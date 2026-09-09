import { buildSpeechRequest, type ResponseFormat } from "@/hooks/useSynthesis";
import type { BookChapter } from "@/lib/book";

export type ChapterJobStatus =
	| "idle"
	| "queued"
	| "rendering"
	| "done"
	| "error";

export interface ChapterJob {
	chapterIndex: number;
	status: ChapterJobStatus;
	audioUrl?: string;
	error?: string;
}

export interface SynthesisSnapshot {
	model: string;
	voice: string;
	speed: number;
	volume: number;
	format: ResponseFormat;
}

export const MAX_TTS_CHARS = 4000;

export function chunkText(text: string, maxChars = MAX_TTS_CHARS): string[] {
	const normalized = text.replace(/\s+/g, " ").trim();
	if (!normalized) return [];
	if (normalized.length <= maxChars) return [normalized];
	const sentences = normalized.match(/[^.!?]+[.!?]+["”']?\s*|[^.!?]+$/g) ?? [
		normalized,
	];
	const chunks: string[] = [];
	let current = "";
	for (const sentence of sentences) {
		if (current && current.length + sentence.length > maxChars) {
			chunks.push(current.trim());
			current = "";
		}
		if (sentence.length > maxChars) {
			for (let i = 0; i < sentence.length; i += maxChars) {
				chunks.push(sentence.slice(i, i + maxChars).trim());
			}
		} else {
			current += sentence;
		}
	}
	if (current.trim()) chunks.push(current.trim());
	return chunks;
}

export function buildChapterRequests(
	state: SynthesisSnapshot,
	chapter: BookChapter,
) {
	return chunkText(chapter.text).map((input) =>
		buildSpeechRequest(state, input),
	);
}

export function createChapterJobs(count: number): ChapterJob[] {
	return Array.from({ length: count }, (_, chapterIndex) => ({
		chapterIndex,
		status: "idle" as ChapterJobStatus,
	}));
}
