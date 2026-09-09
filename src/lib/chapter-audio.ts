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
	chunks: string[];
	doneChunks: number;
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

export const CHUNK_TARGET = 3800;

export const MAX_TTS_CHARS = 4000;

const VOICE_PREFIX_LOCALES: Record<string, string> = {
	a: "en-US",
	b: "en-GB",
	e: "es",
	f: "fr",
	h: "hi",
	i: "it",
	j: "ja",
	p: "pt-BR",
	z: "zh",
};

export function voiceIdToLocale(voiceId: string): string {
	return VOICE_PREFIX_LOCALES[voiceId[0] ?? ""] ?? "en";
}

function fallbackSentences(text: string): string[] {
	return (
		text.match(/[^.!?。！？।]+[.!?。！？।]+["”']?\s*|[^.!?。！？।]+$/g) ?? [
			text,
		]
	)
		.map((s) => s.trim())
		.filter(Boolean);
}

export function segmentSentences(text: string, locale: string): string[] {
	const normalized = text.replace(/\s+/g, " ").trim();
	if (!normalized) return [];
	let sentences: string[];
	try {
		const segmenter = new Intl.Segmenter(locale, { granularity: "sentence" });
		sentences = [...segmenter.segment(normalized)]
			.map((s) => s.segment.trim())
			.filter(Boolean);
	} catch {
		sentences = fallbackSentences(normalized);
	}
	const merged: string[] = [];
	for (const sentence of sentences) {
		const prev = merged[merged.length - 1];
		if (prev !== undefined && prev.length < 15 && !/[.!?。！？।]$/.test(prev)) {
			merged[merged.length - 1] = `${prev} ${sentence}`;
		} else {
			merged.push(sentence);
		}
	}
	return merged;
}

export function chunkText(
	text: string,
	locale = "en",
	maxChars = CHUNK_TARGET,
): string[] {
	const sentences = segmentSentences(text, locale);
	const chunks: string[] = [];
	let current = "";
	for (const sentence of sentences) {
		if (current && current.length + sentence.length + 1 > maxChars) {
			chunks.push(current);
			current = "";
		}
		if (sentence.length > maxChars) {
			const words = sentence.split(" ");
			let part = "";
			for (const word of words) {
				if (part && part.length + word.length + 1 > maxChars) {
					chunks.push(part);
					part = "";
				}
				part = part ? `${part} ${word}` : word;
			}
			if (part) {
				if (current) chunks.push(current);
				current = part;
			}
		} else {
			current = current ? `${current} ${sentence}` : sentence;
		}
	}
	if (current) chunks.push(current);
	for (const chunk of chunks) {
		if (chunk.length > MAX_TTS_CHARS) {
			throw new Error(
				`Chunk of ${chunk.length} chars exceeds Kokoro limit of ${MAX_TTS_CHARS}`,
			);
		}
	}
	return chunks;
}

export function buildChapterRequests(
	state: SynthesisSnapshot,
	chapter: BookChapter,
	locale = "en",
) {
	return chunkText(chapter.text, locale).map((input) =>
		buildSpeechRequest(state, input),
	);
}

export function createChapterJobs(count: number): ChapterJob[] {
	return Array.from({ length: count }, (_, chapterIndex) => ({
		chapterIndex,
		status: "idle" as ChapterJobStatus,
		chunks: [],
		doneChunks: 0,
	}));
}
