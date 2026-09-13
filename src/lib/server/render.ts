import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { chunkText, voiceIdToLocale } from "@/lib/chapter-audio";
import { joinPartsToMp3 } from "@/lib/server/audio-join";
import { probeDurationSec } from "@/lib/server/ffmpeg";
import { kokoroAuthHeaders, kokoroBaseUrl } from "@/lib/server/kokoro";
import {
	bookDir,
	chapterFileName,
	chapterPath,
	fileExists,
	manifestPath,
	sanitizeFingerprint,
} from "@/lib/server/paths";
import { buildSpeechRequest, type SynthesisSnapshot } from "@/lib/synthesis";

export type ServerChapterStatus =
	| "idle"
	| "queued"
	| "rendering"
	| "done"
	| "error";

export interface RenderChapterInput {
	index: number;
	title: string;
	text: string;
	wordCount: number;
}

export interface StartRenderInput {
	fingerprint: string;
	fileName: string;
	voice: string;
	synthesis: SynthesisSnapshot;
	chapters: RenderChapterInput[];
}

export interface JobChapterState {
	index: number;
	title: string;
	wordCount: number;
	status: ServerChapterStatus;
	totalChunks: number;
	doneChunks: number;
	durationSec?: number;
	error?: string;
}

export type JobStatus = "rendering" | "done" | "error" | "cancelled";

export interface JobSnapshot {
	jobId: string;
	status: JobStatus;
	fingerprint: string;
	chapters: JobChapterState[];
	doneCount: number;
	totalCount: number;
}

interface Job extends JobSnapshot {
	controller: AbortController;
}

const jobs = new Map<string, Job>();

function isDryRun(): boolean {
	return process.env.VELLICHOR_DRY_RUN === "1";
}

function dryRunDir(fingerprint: string): string {
	return join(bookDir(fingerprint), "dryrun");
}

async function persistManifest(job: Job): Promise<void> {
	await writeFile(
		manifestPath(job.fingerprint),
		JSON.stringify(
			{
				fingerprint: job.fingerprint,
				status: job.status,
				chapters: job.chapters.map((c) => ({
					index: c.index,
					title: c.title,
					wordCount: c.wordCount,
					status: c.status,
					totalChunks: c.totalChunks,
					durationSec: c.durationSec,
					file: c.status === "done" ? chapterFileName(c.index) : undefined,
				})),
			},
			null,
			2,
		),
	);
}

async function postChunk(
	body: unknown,
	baseUrl: string,
	signal: AbortSignal,
): Promise<Buffer> {
	const res = await fetch(`${baseUrl}/v1/audio/speech`, {
		method: "POST",
		headers: { "Content-Type": "application/json", ...kokoroAuthHeaders() },
		body: JSON.stringify(body),
		signal,
	});
	if (res.status === 401)
		throw new Error("Kokoro rejected the API key (401) — check KOKORO_API_KEY");
	if (!res.ok) throw new Error(`Kokoro responded with status ${res.status}`);
	return Buffer.from(await res.arrayBuffer());
}

async function runJob(job: Job, input: StartRenderInput): Promise<void> {
	const dryRun = isDryRun();
	const baseUrl = dryRun ? "" : kokoroBaseUrl();
	const locale = voiceIdToLocale(input.voice);
	if (dryRun) {
		await mkdir(dryRunDir(job.fingerprint), { recursive: true }).catch(
			() => {},
		);
	}
	for (const chapter of job.chapters) {
		if (job.controller.signal.aborted) break;
		if (chapter.status === "done") continue;
		const source = input.chapters.find((c) => c.index === chapter.index);
		if (!source) continue;
		chapter.status = "rendering";
		chapter.error = undefined;
		try {
			const chunks = chunkText(source.text, locale);
			chapter.totalChunks = chunks.length;
			chapter.doneChunks = 0;
			if (dryRun) {
				await writeFile(
					join(dryRunDir(job.fingerprint), `ch-${chapter.index}.json`),
					JSON.stringify(
						{
							index: chapter.index,
							title: chapter.title,
							locale,
							sourceChars: source.text.length,
							sourceWords: source.text.trim().split(/\s+/).filter(Boolean)
								.length,
							totalChunks: chunks.length,
							chunks: chunks.map((text, i) => ({
								i,
								chars: text.length,
								words: text.trim().split(/\s+/).filter(Boolean).length,
								preview: text.slice(0, 200),
								text,
							})),
						},
						null,
						2,
					),
				);
				chapter.doneChunks = chunks.length;
				chapter.status = "done";
				continue;
			}
			const parts: Buffer[] = [];
			for (const text of chunks) {
				parts.push(
					await postChunk(
						buildSpeechRequest(input.synthesis, text),
						baseUrl,
						job.controller.signal,
					),
				);
				chapter.doneChunks += 1;
			}
			await joinPartsToMp3(parts, chapterPath(job.fingerprint, chapter.index));
			chapter.durationSec = await probeDurationSec(
				chapterPath(job.fingerprint, chapter.index),
			);
			if (chapter.durationSec === undefined) {
				throw new Error("Could not verify chapter audio duration");
			}
			chapter.status = "done";
		} catch (e) {
			if (job.controller.signal.aborted) break;
			chapter.status = "error";
			chapter.error = e instanceof Error ? e.message : "Render failed";
		}
		await persistManifest(job).catch(() => {});
	}
	if (job.controller.signal.aborted) {
		job.status = "cancelled";
		for (const chapter of job.chapters) {
			if (chapter.status === "queued" || chapter.status === "rendering") {
				chapter.status = "idle";
			}
		}
	} else {
		job.status = job.chapters.some((c) => c.status === "error")
			? "error"
			: "done";
	}
	job.doneCount = job.chapters.filter((c) => c.status === "done").length;
	await persistManifest(job).catch(() => {});
}

export async function startRender(input: StartRenderInput): Promise<string> {
	// Fail fast before creating any state: runJob throws unhandled otherwise.
	// Dry-run skips Kokoro entirely: no base URL needed, no audio fetched.
	if (!isDryRun()) kokoroBaseUrl();
	for (const job of jobs.values()) {
		if (job.status === "rendering") {
			throw new Error("Another render is already running");
		}
	}
	const fingerprint = sanitizeFingerprint(input.fingerprint);
	await mkdir(bookDir(fingerprint), { recursive: true });

	const restored = new Map<
		number,
		{ totalChunks: number; durationSec?: number }
	>();
	try {
		const raw = await readFile(manifestPath(fingerprint), "utf-8");
		const manifest = JSON.parse(raw) as {
			chapters?: Array<{
				index: number;
				status?: string;
				totalChunks?: number;
				durationSec?: number;
			}>;
		};
		for (const entry of manifest.chapters ?? []) {
			if (
				entry.status === "done" &&
				(await fileExists(chapterPath(fingerprint, entry.index)))
			) {
				const durationSec =
					typeof entry.durationSec === "number" &&
					Number.isFinite(entry.durationSec)
						? entry.durationSec
						: await probeDurationSec(chapterPath(fingerprint, entry.index));
				restored.set(entry.index, {
					totalChunks: entry.totalChunks ?? 0,
					durationSec,
				});
			}
		}
	} catch {
		// no usable manifest — render everything
	}

	const jobId = crypto.randomUUID();
	const job: Job = {
		jobId,
		status: "rendering",
		fingerprint,
		chapters: input.chapters.map((c) => {
			const prior = restored.get(c.index);
			return {
				index: c.index,
				title: c.title,
				wordCount: c.wordCount,
				status: (prior ? "done" : "queued") as ServerChapterStatus,
				totalChunks: prior?.totalChunks ?? 0,
				doneChunks: prior ? (prior.totalChunks ?? 0) : 0,
				durationSec: prior?.durationSec,
			};
		}),
		doneCount: restored.size,
		totalCount: input.chapters.length,
		controller: new AbortController(),
	};
	jobs.set(jobId, job);
	await persistManifest(job).catch(() => {});
	void runJob(job, { ...input, fingerprint });
	return jobId;
}

export function getJob(jobId: string): JobSnapshot | null {
	const job = jobs.get(jobId);
	if (!job) return null;
	return {
		jobId: job.jobId,
		status: job.status,
		fingerprint: job.fingerprint,
		chapters: job.chapters.map((c) => ({ ...c })),
		doneCount: job.chapters.filter((c) => c.status === "done").length,
		totalCount: job.chapters.length,
	};
}

export function cancelJob(jobId: string): boolean {
	const job = jobs.get(jobId);
	if (!job || job.status !== "rendering") return false;
	job.controller.abort();
	return true;
}

export async function deleteBook(fingerprint: string): Promise<void> {
	const fp = sanitizeFingerprint(fingerprint);
	for (const [jobId, job] of jobs) {
		if (job.fingerprint === fp) {
			if (job.status === "rendering") job.controller.abort();
			jobs.delete(jobId);
		}
	}
	await rm(bookDir(fp), { recursive: true, force: true });
}

export async function readManifest(fingerprint: string): Promise<{
	exists: boolean;
	chapters: Array<{
		index: number;
		title: string;
		wordCount: number;
		status: string;
		totalChunks?: number;
		durationSec?: number;
	}>;
}> {
	try {
		const fp = sanitizeFingerprint(fingerprint);
		const raw = await readFile(manifestPath(fp), "utf-8");
		const manifest = JSON.parse(raw) as {
			chapters?: Array<{
				index: number;
				title: string;
				wordCount: number;
				status: string;
				totalChunks?: number;
				durationSec?: number;
			}>;
		};
		const chapters = manifest.chapters ?? [];
		let patched = false;
		for (const entry of chapters) {
			if (
				entry.status === "done" &&
				(typeof entry.durationSec !== "number" ||
					!Number.isFinite(entry.durationSec))
			) {
				const probed = await probeDurationSec(chapterPath(fp, entry.index));
				if (probed !== undefined) {
					entry.durationSec = probed;
					patched = true;
				}
			}
		}
		if (patched) {
			await writeFile(
				manifestPath(fp),
				JSON.stringify(
					{
						fingerprint: fp,
						status: (manifest as { status?: string }).status ?? "done",
						chapters: chapters.map((c) => ({
							index: c.index,
							title: c.title,
							wordCount: c.wordCount,
							status: c.status,
							totalChunks: c.totalChunks,
							durationSec: c.durationSec,
							file: c.status === "done" ? chapterFileName(c.index) : undefined,
						})),
					},
					null,
					2,
				),
			).catch(() => {});
		}
		return { exists: true, chapters };
	} catch {
		return { exists: false, chapters: [] };
	}
}
