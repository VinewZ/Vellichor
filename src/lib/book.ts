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
	estimatedAudio: string;
	coverUrl?: string;
	coverMime?: string;
	toc: TocEntry[];
	chapters: BookChapter[];
	fullText: string;
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

export function formatAudioETA(words: number, wpm = 150): string {
	const totalMinutes = Math.max(1, Math.round(words / wpm));
	const hours = Math.floor(totalMinutes / 60);
	const minutes = totalMinutes % 60;
	if (hours === 0) return `${minutes}m`;
	return `${hours}h ${minutes}m`;
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
