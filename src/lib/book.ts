export interface TocEntry {
	label: string;
	level: number;
	pageNumber?: number;
	href?: string;
}

export interface BookChapter {
	title: string;
	href?: string;
	text: string;
	wordCount: number;
}

export type BookFileFormat = "pdf" | "epub";

export interface ParsedBook {
	fileName: string;
	fileFormat: BookFileFormat;
	fileSizeMB: string;
	title: string;
	author: string;
	publisher?: string;
	date?: string;
	pageCount?: number;
	chapterCount: number;
	wordCount: number;
	wordCountLabel: string;
	coverUrl?: string;
	coverMime?: string;
	toc: TocEntry[];
	chapters: BookChapter[];
	fullText: string;
}

export interface ExportMetadata {
	title: string;
	author: string;
	publisher?: string;
	date?: string;
	fileName: string;
}

export interface ExportCover {
	dataBase64: string;
	mime: string;
}

export function isAttachableCoverMime(mime: string | undefined): boolean {
	return mime === "image/jpeg" || mime === "image/png";
}

export function parsedBookToExportMeta(book: ParsedBook): ExportMetadata {
	return {
		title: book.title,
		author: book.author,
		publisher: book.publisher,
		date: book.date,
		fileName: book.fileName,
	};
}
export function revokeCoverUrl(url: string | undefined): void {
	if (url?.startsWith("blob:")) {
		URL.revokeObjectURL(url);
	}
}

export function countWords(text: string): number {
	const matches = text.trim().match(/\S+/g);
	return matches ? matches.length : 0;
}

export function formatWordCount(words: number): string {
	if (words >= 1000) {
		const k = words / 1000;
		return `~${k >= 100 ? Math.round(k).toString() : k.toFixed(1).replace(/\.0$/, "")}k`;
	}
	return words.toString();
}

// Measured Kokoro TTS output rate for Portuguese (~181 wpm pilot chapter,
// ~183 wpm full-book actuals). Deliberately an observation, not a spec value.
export const MEASURED_TTS_WPM = 180;

export function formatAudioETA(
	words: number,
	wpm: number = MEASURED_TTS_WPM,
	speed = 1,
): string {
	const safeSpeed = Number.isFinite(speed) && speed > 0 ? speed : 1;
	const totalSeconds = Math.max(
		1,
		Math.round((words / wpm) * 60 * (1 / safeSpeed)),
	);
	if (totalSeconds < 60) return `${totalSeconds}s`;
	const totalMinutes = Math.max(1, Math.round(totalSeconds / 60));
	const hours = Math.floor(totalMinutes / 60);
	const minutes = totalMinutes % 60;
	if (hours === 0) return `${minutes}m`;
	return `${hours}h ${minutes}m`;
}

export function formatDuration(totalSeconds: number): string {
	if (!Number.isFinite(totalSeconds) || totalSeconds < 0) return "—";
	const secs = Math.round(totalSeconds);
	if (secs < 60) return `${secs}s`;
	const minutes = Math.floor(secs / 60);
	const remSecs = secs % 60;
	const hours = Math.floor(minutes / 60);
	const remMins = minutes % 60;
	if (hours === 0) return `${minutes}m ${remSecs}s`;
	return `${hours}h ${remMins}m`;
}

export function formatFileSizeMB(bytes: number): string {
	return (bytes / (1024 * 1024)).toFixed(1);
}

export function formatBookYear(raw: string): string {
	const year = raw.trim().match(/(\d{4})/);
	return year ? year[1] : raw.trim();
}

export function cleanTitle(fileName: string): string {
	return fileName
		.replace(/\.(pdf|epub)$/i, "")
		.replace(/[_-]+/g, " ")
		.trim();
}

export function bookFingerprint(
	book: Pick<ParsedBook, "fileName" | "fileSizeMB">,
): string {
	const name = book.fileName.replace(/[^A-Za-z0-9._-]+/g, "_").slice(0, 80);
	const size = book.fileSizeMB.replace(/[^A-Za-z0-9._-]+/g, "_");
	return `${name}--${size}`;
}
