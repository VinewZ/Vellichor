import { execFile } from "node:child_process";
import { mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";
import { chunkText, voiceIdToLocale } from "@/lib/chapter-audio";
import { kokoroAuthHeaders, kokoroBaseUrl } from "@/lib/server/kokoro";
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

function dataDir(): string {
	return process.env.VELLICHOR_DATA_DIR ?? join(process.cwd(), "data");
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

async function probeDurationSec(filePath: string): Promise<number | undefined> {
	try {
		const { stdout } = await execFileAsync(ffprobePath(), [
			"-v",
			"error",
			"-show_entries",
			"format=duration",
			"-of",
			"csv=p=0",
			filePath,
		]);
		const seconds = Number.parseFloat(stdout.trim());
		if (Number.isFinite(seconds) && seconds >= 0) return seconds;
	} catch {
		// ignore probe failures
	}
	return undefined;
}

async function runJob(job: Job, input: StartRenderInput): Promise<void> {
	const baseUrl = kokoroBaseUrl();
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
			chapter.durationSec = await probeDurationSec(
				chapterPath(job.fingerprint, chapter.index),
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
	// Fail fast before creating any state: runJob throws unhandled otherwise.
	kokoroBaseUrl();
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

function ffmpegPath(): string {
	return process.env.VELLICHOR_FFMPEG_PATH ?? "ffmpeg";
}

function ffprobePath(): string {
	return process.env.VELLICHOR_FFPROBE_PATH ?? "ffprobe";
}

function escapeMeta(value: string): string {
	return value
		.replace(/\\/g, "\\\\")
		.replace(/=/g, "\\=")
		.replace(/;/g, "\\;")
		.replace(/#/g, "\\#")
		.replace(/\n/g, "\\\n");
}

export interface ExportBookMetadata {
	title: string;
	author?: string;
	publisher?: string;
	date?: string;
	fileName?: string;
}

export interface ExportCoverInput {
	dataBase64: string;
	mime: string;
}

function cleanMeta(value: unknown, max = 500): string | undefined {
	if (typeof value !== "string") return undefined;
	const v = value.trim().replace(/\s+/g, " ").slice(0, max);
	return v ? v : undefined;
}

function extractYear(date: string | undefined): string | undefined {
	if (!date) return undefined;
	const m = date.match(/(\d{4})/);
	return m ? m[1] : undefined;
}

function isPngBuffer(buf: Buffer): boolean {
	return (
		buf.length >= 8 &&
		buf[0] === 0x89 &&
		buf[1] === 0x50 &&
		buf[2] === 0x4e &&
		buf[3] === 0x47
	);
}

function isJpegBuffer(buf: Buffer): boolean {
	return (
		buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff
	);
}

async function writeCoverFile(
	dir: string,
	cover: ExportCoverInput | undefined,
): Promise<string | null> {
	if (!cover) return null;
	if (cover.mime !== "image/jpeg" && cover.mime !== "image/png") return null;
	let buf: Buffer;
	try {
		buf = Buffer.from(cover.dataBase64, "base64");
	} catch {
		return null;
	}
	if (buf.length === 0 || buf.length > 5 * 1024 * 1024) return null;
	const isPng = isPngBuffer(buf);
	const isJpg = isJpegBuffer(buf);
	if (!isPng && !isJpg) return null;
	const ext = isPng ? "png" : "jpg";
	const other = isPng ? "jpg" : "png";
	await rm(join(dir, `cover.${other}`), { force: true }).catch(() => {});
	const coverPath = join(dir, `cover.${ext}`);
	await writeFile(coverPath, buf);
	return coverPath;
}

async function runFfmpeg(args: string[]): Promise<void> {
	try {
		await execFileAsync(ffmpegPath(), args);
	} catch (e) {
		const detail = e instanceof Error ? e.message : String(e);
		throw new Error(`ffmpeg export failed: ${detail.slice(-500)}`);
	}
}

export async function exportM4b(
	fingerprint: string,
	titleOrMeta: string | ExportBookMetadata,
	cover?: ExportCoverInput,
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
	const rawMeta: ExportBookMetadata =
		typeof titleOrMeta === "string" ? { title: titleOrMeta } : titleOrMeta;
	const title = cleanMeta(rawMeta.title) ?? "book";
	const authorRaw = cleanMeta(rawMeta.author);
	const author =
		authorRaw && authorRaw.toLowerCase() !== "unknown" ? authorRaw : undefined;
	const publisher = cleanMeta(rawMeta.publisher);
	const date = cleanMeta(rawMeta.date, 50);
	const year = extractYear(date);
	const fileNameSrc = cleanMeta(rawMeta.fileName, 120);
	const meta = [";FFMETADATA1", `title=${escapeMeta(title)}`];
	if (author) {
		meta.push(
			`artist=${escapeMeta(author)}`,
			`album_artist=${escapeMeta(author)}`,
			`author=${escapeMeta(author)}`,
		);
	}
	meta.push(`album=${escapeMeta(title)}`);
	if (publisher) meta.push(`publisher=${escapeMeta(publisher)}`);
	if (date) meta.push(`date=${escapeMeta(date)}`);
	if (year && year !== date) meta.push(`year=${escapeMeta(year)}`);
	if (fileNameSrc)
		meta.push(
			`comment=${escapeMeta(`Generated by Vellichor from ${fileNameSrc}`)}`,
		);
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
	const coverPath = await writeCoverFile(dir, cover);
	const baseArgs = [
		"-y",
		"-f",
		"concat",
		"-safe",
		"0",
		"-i",
		join(dir, "filelist.txt"),
		"-i",
		join(dir, "chapters.meta"),
	];
	if (coverPath) {
		try {
			await runFfmpeg([
				...baseArgs,
				"-i",
				coverPath,
				"-map",
				"0:a",
				"-map",
				"2:v",
				"-map_metadata",
				"1",
				"-c:a",
				"aac",
				"-b:a",
				"128k",
				"-c:v",
				"copy",
				"-disposition:v",
				"attached_pic",
				"-movflags",
				"+faststart",
				filePath,
			]);
			return { filePath, fileName };
		} catch {
			// fall through to audio-only export
		}
	}
	await runFfmpeg([
		...baseArgs,
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
	return { filePath, fileName };
}
