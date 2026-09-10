import type { BookChapter } from "@/lib/book";
import { buildSpeechRequest, type SynthesisSnapshot } from "@/lib/synthesis";

export type ChapterJobStatus =
	| "idle"
	| "queued"
	| "rendering"
	| "done"
	| "error";

export interface ChapterJob {
	chapterIndex: number;
	status: ChapterJobStatus;
	totalChunks: number;
	doneChunks: number;
	durationSec?: number;
	audioUrl?: string;
	error?: string;
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

interface BlockSentence {
	text: string;
	sep: "" | " " | "\n" | "\n\n";
}

function blockSentences(text: string, locale: string): BlockSentence[] {
	const parts = text.split(/(\n+)/);
	const out: BlockSentence[] = [];
	let pendingSep: "" | " " | "\n" | "\n\n" = "";
	for (let i = 0; i < parts.length; i++) {
		const part = parts[i] ?? "";
		if (i % 2 === 1) {
			pendingSep = pendingSep === "" && part.length === 1 ? "\n" : "\n\n";
			continue;
		}
		const line = part.replace(/\s+/g, " ").trim();
		if (!line) {
			if (pendingSep === "\n") pendingSep = "\n\n";
			continue;
		}
		const sep = out.length === 0 ? "" : pendingSep || " ";
		segmentSentences(line, locale).forEach((sentence, sIndex) => {
			out.push({ text: sentence, sep: sIndex === 0 ? sep : " " });
		});
		pendingSep = "";
	}
	return out;
}

export function chunkText(
	text: string,
	locale = "en",
	maxChars = CHUNK_TARGET,
): string[] {
	const sentences = blockSentences(text, locale);
	const chunks: string[] = [];
	let current = "";
	for (const sentence of sentences) {
		const glue = !current ? "" : sentence.sep || " ";
		if (
			current &&
			current.length + glue.length + sentence.text.length > maxChars
		) {
			chunks.push(current);
			current = "";
		}
		if (sentence.text.length > maxChars) {
			if (current) {
				chunks.push(current);
				current = "";
			}
			const words = sentence.text.split(" ");
			let part = "";
			for (const word of words) {
				if (part && part.length + word.length + 1 > maxChars) {
					chunks.push(part);
					part = "";
				}
				part = part ? `${part} ${word}` : word;
			}
			if (part) current = part;
		} else {
			current = current ? `${current}${glue}${sentence.text}` : sentence.text;
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
		totalChunks: 0,
		doneChunks: 0,
	}));
}
