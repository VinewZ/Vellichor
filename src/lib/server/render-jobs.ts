import { execFile } from "node:child_process";
import { mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";
import { chunkText, voiceIdToLocale } from "@/lib/chapter-audio";
import { buildSpeechRequest, type SynthesisSnapshot } from "@/lib/synthesis";

const execFileAsync = promisify(execFile);

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

function dataDir(): string {
	return process.env.DATA_DIR ?? join(process.cwd(), "data");
}

export function sanitizeFingerprint(raw: unknown): string {
	if (
		typeof raw !== "string" ||
		!/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(raw)
	) {
		throw new Error("Invalid fingerprint");
	}
	return raw;
}

export function bookDir(fingerprint: string): string {
	return join(dataDir(), "books", fingerprint);
}

export function chapterFileName(index: number): string {
	return `ch-${String(index).padStart(3, "0")}.mp3`;
}

function chapterPath(fingerprint: string, index: number): string {
	return join(bookDir(fingerprint), chapterFileName(index));
}

function manifestPath(fingerprint: string): string {
	return join(bookDir(fingerprint), "manifest.json");
}

async function fileExists(path: string): Promise<boolean> {
	try {
		await stat(path);
		return true;
	} catch {
		return false;
	}
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
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify(body),
		signal,
	});
	if (!res.ok) throw new Error(`Kokoro responded with status ${res.status}`);
	return Buffer.from(await res.arrayBuffer());
}

async function runJob(job: Job, input: StartRenderInput): Promise<void> {
	const baseUrl = process.env.KOKORO_BASE_URL ?? "http://127.0.0.1:8880";
	const locale = voiceIdToLocale(input.voice);
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
			await writeFile(
				chapterPath(job.fingerprint, chapter.index),
				Buffer.concat(parts),
			);
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
	for (const job of jobs.values()) {
		if (job.status === "rendering") {
			throw new Error("Another render is already running");
		}
	}
	const fingerprint = sanitizeFingerprint(input.fingerprint);
	await mkdir(bookDir(fingerprint), { recursive: true });

	const restored = new Map<number, { totalChunks: number }>();
	try {
		const raw = await readFile(manifestPath(fingerprint), "utf-8");
		const manifest = JSON.parse(raw) as {
			chapters?: Array<{
				index: number;
				status?: string;
				totalChunks?: number;
			}>;
		};
		for (const entry of manifest.chapters ?? []) {
			if (
				entry.status === "done" &&
				(await fileExists(chapterPath(fingerprint, entry.index)))
			) {
				restored.set(entry.index, { totalChunks: entry.totalChunks ?? 0 });
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
	}>;
}> {
	try {
		const raw = await readFile(
			manifestPath(sanitizeFingerprint(fingerprint)),
			"utf-8",
		);
		const manifest = JSON.parse(raw) as {
			chapters?: Array<{
				index: number;
				title: string;
				wordCount: number;
				status: string;
			}>;
		};
		return { exists: true, chapters: manifest.chapters ?? [] };
	} catch {
		return { exists: false, chapters: [] };
	}
}

function ffmpegPath(): string {
	return process.env.FFMPEG_PATH ?? "ffmpeg";
}

function ffprobePath(): string {
	return process.env.FFPROBE_PATH ?? "ffprobe";
}

function escapeMeta(value: string): string {
	return value
		.replace(/\\/g, "\\\\")
		.replace(/=/g, "\\=")
		.replace(/;/g, "\\;")
		.replace(/#/g, "\\#")
		.replace(/\n/g, "\\\n");
}

export async function exportM4b(
	fingerprint: string,
	title: string,
): Promise<{ filePath: string; fileName: string }> {
	const fp = sanitizeFingerprint(fingerprint);
	const dir = bookDir(fp);
	const raw = await readFile(manifestPath(fp), "utf-8").catch(() => {
		throw new Error("Nothing rendered for this book yet");
	});
	const manifest = JSON.parse(raw) as {
		chapters?: Array<{ index: number; title: string; status: string }>;
	};
	const done = (manifest.chapters ?? [])
		.filter((c) => c.status === "done")
		.sort((a, b) => a.index - b.index);
	if (done.length === 0) throw new Error("Nothing rendered for this book yet");
	for (const chapter of done) {
		if (!(await fileExists(join(dir, chapterFileName(chapter.index))))) {
			throw new Error(`Missing audio for chapter ${chapter.index + 1}`);
		}
	}

	const durationsMs: number[] = [];
	for (const chapter of done) {
		const { stdout } = await execFileAsync(ffprobePath(), [
			"-v",
			"error",
			"-show_entries",
			"format=duration",
			"-of",
			"csv=p=0",
			join(dir, chapterFileName(chapter.index)),
		]);
		const seconds = Number.parseFloat(stdout.trim());
		if (!Number.isFinite(seconds)) {
			throw new Error(
				`Could not read duration of chapter ${chapter.index + 1}`,
			);
		}
		durationsMs.push(Math.round(seconds * 1000));
	}

	let cursor = 0;
	const meta = [";FFMETADATA1", `title=${escapeMeta(title)}`];
	done.forEach((chapter, i) => {
		const start = cursor;
		cursor += durationsMs[i] ?? 0;
		meta.push(
			"[CHAPTER]",
			"TIMEBASE=1/1000",
			`START=${start}`,
			`END=${cursor}`,
			`title=${escapeMeta(chapter.title)}`,
		);
	});
	await writeFile(
		join(dir, "filelist.txt"),
		done.map((c) => `file '${chapterFileName(c.index)}'`).join("\n"),
	);
	await writeFile(join(dir, "chapters.meta"), `${meta.join("\n")}\n`);

	const safeTitle =
		title
			.replace(/[^A-Za-z0-9._-]+/g, " ")
			.trim()
			.slice(0, 80) || "book";
	const fileName = `${safeTitle}.m4b`;
	const filePath = join(dir, "book.m4b");
	try {
		await execFileAsync(ffmpegPath(), [
			"-y",
			"-f",
			"concat",
			"-safe",
			"0",
			"-i",
			join(dir, "filelist.txt"),
			"-i",
			join(dir, "chapters.meta"),
			"-map_metadata",
			"1",
			"-c:a",
			"aac",
			"-b:a",
			"128k",
			"-movflags",
			"+faststart",
			filePath,
		]);
	} catch (e) {
		const detail = e instanceof Error ? e.message : String(e);
		throw new Error(`ffmpeg export failed: ${detail.slice(-500)}`);
	}
	return { filePath, fileName };
}
