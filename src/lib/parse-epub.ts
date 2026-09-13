import JSZip from "jszip";
import type { BookChapter, ParsedBook } from "./book";
import { countWords, formatFileSizeMB, formatWordCount } from "./book";
import { findCoverItem, guessImageMime } from "./epub-cover";
import { loadPackage } from "./epub-manifest";
import { extractHtmlText } from "./epub-text";
import { extractToc } from "./epub-toc";
import { mapPool, yieldToUI } from "./map-pool";

export async function parseEpub(file: File): Promise<ParsedBook> {
	const zip = await JSZip.loadAsync(file);
	const pkg = await loadPackage(zip, file.name);
	const { opfDoc, manifest, spineIds, base } = pkg;

	const toc = await extractToc(zip, manifest);

	const hrefToTocLabel = new Map<string, string>();
	for (const entry of toc) {
		if (entry.href) {
			hrefToTocLabel.set(entry.href.split("#")[0], entry.label);
		}
	}

	const spineChapters = await mapPool(spineIds, 8, async (id, spineIndex) => {
		// Yield periodically so the upload progress UI keeps painting on huge books.
		if (spineIndex % 16 === 0) await yieldToUI();
		const item = manifest.get(id);
		if (!item) return null;
		const entry = zip.file(item.href);
		if (!entry) return null;
		const html = await entry.async("string");
		const { title: htmlTitle, text } = extractHtmlText(html);
		if (!text) return null;
		const key = item.href.split("#")[0];
		return {
			title:
				hrefToTocLabel.get(key) || htmlTitle || `Chapter ${spineIndex + 1}`,
			href: item.href,
			text,
		};
	});

	const chapters: BookChapter[] = [];
	const chapterTexts: string[] = [];
	for (const parsed of spineChapters) {
		if (!parsed) continue;
		chapters.push({
			title: parsed.title,
			href: parsed.href,
			text: parsed.text,
			wordCount: countWords(parsed.text),
		});
		chapterTexts.push(parsed.text);
	}

	if (chapters.length === 0)
		throw new Error("Could not extract text from EPUB");

	const fullText = chapterTexts.join("\n\n").trim();
	const wordCount = countWords(fullText);

	if (toc.length === 0) {
		for (const chapter of chapters) {
			toc.push({ label: chapter.title, level: 0, href: chapter.href });
		}
	}

	let coverUrl: string | undefined;
	let coverMime: string | undefined;
	try {
		const coverItem = findCoverItem(opfDoc, manifest, base);
		if (coverItem) {
			const coverFile = zip.file(coverItem.href);
			if (coverFile) {
				const raw = await coverFile.async("blob");
				const mime =
					coverItem.mediaType.startsWith("image/") &&
					coverItem.mediaType.includes("/")
						? coverItem.mediaType
						: guessImageMime(coverItem.href, raw.type || "image/jpeg");
				const blob = raw.type === mime ? raw : new Blob([raw], { type: mime });
				coverUrl = URL.createObjectURL(blob);
				coverMime = mime;
			}
		}
	} catch {
		coverUrl = undefined;
	}

	return {
		fileName: file.name,
		fileFormat: "epub",
		fileSizeMB: formatFileSizeMB(file.size),
		title: pkg.title,
		author: pkg.author,
		publisher: pkg.publisher,
		date: pkg.date,
		chapterCount: chapters.length,
		wordCount,
		wordCountLabel: formatWordCount(wordCount),
		coverUrl,
		coverMime,
		toc,
		chapters,
		fullText,
	};
}
