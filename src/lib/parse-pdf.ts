import * as pdfjsLib from "pdfjs-dist";
import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import type { BookChapter, ParsedBook, TocEntry } from "./book";
import {
	cleanTitle,
	countWords,
	formatAudioETA,
	formatFileSizeMB,
	formatWordCount,
} from "./book";

pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl;

interface OutlineItem {
	title: string;
	dest?: string | unknown[] | null;
	items?: OutlineItem[];
}

// biome-ignore lint/suspicious/noExplicitAny: pdf.js types vary across builds
type PdfProxy = any;

async function resolvePageNumber(
	pdf: PdfProxy,
	dest: string | unknown[] | null | undefined,
): Promise<number | undefined> {
	try {
		let explicitDest: unknown = dest;
		if (typeof dest === "string") {
			explicitDest = await pdf.getDestination(dest);
		}
		if (Array.isArray(explicitDest) && explicitDest.length > 0) {
			const ref = explicitDest[0];
			if (ref !== null && typeof ref === "object") {
				const index: number = await pdf.getPageIndex(ref);
				return index + 1;
			}
			if (Number.isInteger(ref)) {
				return (ref as number) + 1;
			}
		}
	} catch {
		return undefined;
	}
	return undefined;
}

async function flattenOutline(
	pdf: PdfProxy,
	items: OutlineItem[],
	level: number,
	out: TocEntry[],
): Promise<void> {
	for (const item of items) {
		const label = (item.title ?? "").trim() || "Untitled section";
		const pageNumber = item.dest
			? await resolvePageNumber(pdf, item.dest)
			: undefined;
		out.push({ label, level, pageNumber });
		if (item.items && item.items.length > 0) {
			await flattenOutline(pdf, item.items, level + 1, out);
		}
	}
}

async function renderCover(
	pdf: PdfProxy,
	targetWidth = 360,
): Promise<string | undefined> {
	try {
		const page = await pdf.getPage(1);
		try {
			const baseViewport = page.getViewport({ scale: 1 });
			const scale = Math.min(
				1.5,
				Math.max(0.4, targetWidth / baseViewport.width),
			);
			const viewport = page.getViewport({ scale });
			const canvas = document.createElement("canvas");
			canvas.width = Math.floor(viewport.width);
			canvas.height = Math.floor(viewport.height);
			const context = canvas.getContext("2d");
			if (!context) return undefined;
			await page.render({ canvasContext: context, viewport }).promise;
			const blob: Blob | null = await new Promise((resolve) =>
				canvas.toBlob((b) => resolve(b), "image/jpeg", 0.82),
			);
			if (blob) return URL.createObjectURL(blob);
			return canvas.toDataURL("image/jpeg", 0.82);
		} finally {
			page.cleanup();
		}
	} catch {
		return undefined;
	}
}

export async function parsePdf(file: File): Promise<ParsedBook> {
	const data = await file.arrayBuffer();
	const loadingTask = pdfjsLib.getDocument({ data });
	const pdf = await loadingTask.promise;

	try {
		const pageCount = pdf.numPages;

		let title = "";
		let author = "";
		try {
			const metadata = await pdf.getMetadata();
			const info = (metadata?.info ?? {}) as Record<string, unknown>;
			if (typeof info.Title === "string") title = info.Title;
			if (typeof info.Author === "string") author = info.Author;
		} catch {
			title = "";
			author = "";
		}

		const pageTexts: string[] = [];
		for (let i = 1; i <= pageCount; i++) {
			const page = await pdf.getPage(i);
			const content = await page.getTextContent();
			const text = content.items
				.map((item) => {
					if (typeof item === "object" && item !== null && "str" in item) {
						return (item as { str: string }).str;
					}
					return "";
				})
				.join(" ");
			pageTexts.push(text);
			page.cleanup();
		}

		const fullText = pageTexts
			.join("\n\n")
			.replace(/[ \t]+\n/g, "\n")
			.trim();

		let toc: TocEntry[] = [];
		try {
			const outline = (await pdf.getOutline()) as OutlineItem[] | null;
			if (outline && outline.length > 0) {
				await flattenOutline(pdf, outline, 0, toc);
			}
		} catch {
			toc = [];
		}

		const chapters: BookChapter[] =
			toc.length > 0
				? toc
						.filter((entry) => entry.level === 0)
						.map((entry, index, arr) => {
							const startPage = entry.pageNumber ?? 1;
							const next = arr[index + 1];
							const endPage = next?.pageNumber
								? next.pageNumber - 1
								: pageCount;
							const slice = pageTexts.slice(
								Math.max(0, startPage - 1),
								Math.max(startPage - 1, endPage),
							);
							const text = slice.join("\n\n").trim();
							return {
								title: entry.label,
								text,
								wordCount: countWords(text),
							};
						})
				: [
						{
							title: "Full document",
							text: fullText,
							wordCount: countWords(fullText),
						},
					];

		const wordCount = countWords(fullText);
		const coverUrl = await renderCover(pdf);

		return {
			fileName: file.name,
			fileFormat: "pdf",
			fileSizeMB: formatFileSizeMB(file.size),
			title: title.trim() || cleanTitle(file.name),
			author: author.trim() || "Unknown",
			pageCount,
			chapterCount: chapters.length,
			wordCount,
			wordCountLabel: formatWordCount(wordCount),
			estimatedAudio: formatAudioETA(wordCount),
			coverUrl,
			coverMime: coverUrl ? "image/jpeg" : undefined,
			toc,
			chapters,
			fullText,
		};
	} finally {
		await pdf.cleanup();
		await loadingTask.destroy().catch(() => undefined);
	}
}
