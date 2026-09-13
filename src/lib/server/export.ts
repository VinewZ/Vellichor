import { readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { probeDurationSec, runFfmpegWithProgress } from "@/lib/server/ffmpeg";
import {
	bookDir,
	chapterFileName,
	fileExists,
	manifestPath,
	sanitizeFingerprint,
} from "@/lib/server/paths";

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

export type ExportJobStatus = "preparing" | "encoding" | "done" | "error";

export interface ExportJobSnapshot {
	jobId: string;
	status: ExportJobStatus;
	fingerprint: string;
	progress: number;
	phase: string;
	totalMs: number;
	doneMs: number;
	fileName?: string;
	error?: string;
}

interface ExportJob extends ExportJobSnapshot {
	filePath?: string;
	finishedAt?: number;
}

const exportJobs = new Map<string, ExportJob>();

function pruneExportJobs(): void {
	if (exportJobs.size <= 50) return;
	const now = Date.now();
	for (const [id, job] of exportJobs) {
		if (
			(job.status === "done" || job.status === "error") &&
			job.finishedAt !== undefined &&
			now - job.finishedAt > 15 * 60 * 1000
		) {
			exportJobs.delete(id);
		}
	}
}

function clampProgress(n: number): number {
	if (!Number.isFinite(n)) return 0;
	return Math.min(100, Math.max(0, Math.round(n)));
}

interface PreparedExport {
	fp: string;
	dir: string;
	totalMs: number;
	filePath: string;
	fileName: string;
	baseArgs: string[];
	coverPath: string | null;
}

async function prepareExport(
	fingerprint: string,
	titleOrMeta: string | ExportBookMetadata,
	cover?: ExportCoverInput,
): Promise<PreparedExport> {
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
		const seconds = await probeDurationSec(
			join(dir, chapterFileName(chapter.index)),
		);
		if (seconds === undefined) {
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
	return { fp, dir, totalMs: cursor, filePath, fileName, baseArgs, coverPath };
}

async function encodePreparedExport(
	prepared: PreparedExport,
	onProgress?: (doneMs: number) => void,
): Promise<void> {
	const totalMs = prepared.totalMs;
	if (prepared.coverPath) {
		try {
			await runFfmpegWithProgress(
				[
					...prepared.baseArgs,
					"-i",
					prepared.coverPath,
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
					prepared.filePath,
				],
				totalMs,
				onProgress,
			);
			return;
		} catch {
			// fall through to audio-only export
		}
	}
	await runFfmpegWithProgress(
		[
			...prepared.baseArgs,
			"-map_metadata",
			"1",
			"-c:a",
			"aac",
			"-b:a",
			"128k",
			"-movflags",
			"+faststart",
			prepared.filePath,
		],
		totalMs,
		onProgress,
	);
}

async function runExportJob(
	jobId: string,
	fingerprint: string,
	titleOrMeta: string | ExportBookMetadata,
	cover?: ExportCoverInput,
): Promise<void> {
	const job = exportJobs.get(jobId);
	if (!job) return;
	try {
		job.phase = "Probing chapters…";
		const prepared = await prepareExport(fingerprint, titleOrMeta, cover);
		job.totalMs = prepared.totalMs;
		job.fileName = prepared.fileName;
		job.filePath = prepared.filePath;
		job.status = "encoding";
		job.phase = "Encoding audio…";
		await encodePreparedExport(prepared, (doneMs) => {
			const current = exportJobs.get(jobId);
			if (!current) return;
			current.doneMs = Math.min(doneMs, prepared.totalMs);
			current.progress =
				prepared.totalMs > 0
					? clampProgress((current.doneMs / prepared.totalMs) * 100)
					: 0;
		});
		const finished = exportJobs.get(jobId);
		if (!finished) return;
		finished.status = "done";
		finished.progress = 100;
		finished.doneMs = prepared.totalMs;
		finished.phase = "Done";
		finished.finishedAt = Date.now();
	} catch (e) {
		const failed = exportJobs.get(jobId);
		if (!failed) return;
		failed.status = "error";
		failed.phase = "Failed";
		failed.error = e instanceof Error ? e.message : "Export failed";
		failed.finishedAt = Date.now();
	}
}

export async function startExport(
	fingerprint: string,
	titleOrMeta: string | ExportBookMetadata,
	cover?: ExportCoverInput,
): Promise<string> {
	const fp = sanitizeFingerprint(fingerprint);
	for (const job of exportJobs.values()) {
		if (
			job.fingerprint === fp &&
			(job.status === "preparing" || job.status === "encoding")
		) {
			throw new Error("An export is already running for this book");
		}
	}
	pruneExportJobs();
	const jobId = crypto.randomUUID();
	exportJobs.set(jobId, {
		jobId,
		status: "preparing",
		fingerprint: fp,
		progress: 0,
		phase: "Preparing…",
		totalMs: 0,
		doneMs: 0,
	});
	void runExportJob(jobId, fp, titleOrMeta, cover);
	return jobId;
}

export function getExportJob(jobId: string): ExportJobSnapshot | null {
	const job = exportJobs.get(jobId);
	if (!job) return null;
	return {
		jobId: job.jobId,
		status: job.status,
		fingerprint: job.fingerprint,
		progress: job.progress,
		phase: job.phase,
		totalMs: job.totalMs,
		doneMs: job.doneMs,
		fileName: job.fileName,
		error: job.error,
	};
}

export function getExportFile(jobId: string): {
	filePath: string;
	fileName: string;
} | null {
	const job = exportJobs.get(jobId);
	if (!job || job.status !== "done" || !job.filePath || !job.fileName)
		return null;
	return { filePath: job.filePath, fileName: job.fileName };
}

export async function exportM4b(
	fingerprint: string,
	titleOrMeta: string | ExportBookMetadata,
	cover?: ExportCoverInput,
): Promise<{ filePath: string; fileName: string }> {
	const prepared = await prepareExport(fingerprint, titleOrMeta, cover);
	await encodePreparedExport(prepared);
	return { filePath: prepared.filePath, fileName: prepared.fileName };
}
