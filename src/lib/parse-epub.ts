import JSZip from "jszip";
import type { BookChapter, ParsedBook, TocEntry } from "./book";
import {
	cleanTitle,
	countWords,
	formatAudioETA,
	formatBookYear,
	formatFileSizeMB,
	formatWordCount,
} from "./book";
import { mapPool, yieldToUI } from "./map-pool";

function parseXml(xml: string): Document {
	const doc = new DOMParser().parseFromString(xml, "application/xml");
	const parserError = doc.querySelector("parsererror");
	if (parserError) {
		throw new Error("Could not parse EPUB XML");
	}
	return doc;
}

function getText(doc: Document, ...selectors: string[]): string {
	for (const selector of selectors) {
		const el = doc.getElementsByTagName(selector)[0];
		if (el?.textContent?.trim()) return el.textContent.trim();
	}
	return "";
}

function dirname(path: string): string {
	const idx = path.lastIndexOf("/");
	return idx === -1 ? "" : path.slice(0, idx + 1);
}

function normalizeHref(base: string, href: string): string {
	const clean = href.split("#")[0];
	if (!clean || clean.startsWith("http") || clean.startsWith("data:")) {
		return href;
	}
	if (clean.startsWith("/")) return clean.slice(1);
	const stack = (base + clean).split("/");
	const out: string[] = [];
	for (const part of stack) {
		if (part === "" || part === ".") continue;
		if (part === "..") out.pop();
		else out.push(part);
	}
	return out.join("/");
}

function extractHtmlText(html: string): { title: string; text: string } {
	const doc = new DOMParser().parseFromString(html, "text/html");
	doc.querySelectorAll("script, style, nav").forEach((el) => {
		el.remove();
	});
	const title =
		doc.querySelector("h1")?.textContent?.trim() ||
		doc.querySelector("h2")?.textContent?.trim() ||
		doc.querySelector("title")?.textContent?.trim() ||
		"";
	const text = (doc.body?.textContent ?? "")
		.replace(/[ \t]+\n/g, "\n")
		.replace(/\n{3,}/g, "\n\n")
		.trim();
	return { title, text };
}

interface ManifestItem {
	href: string;
	mediaType: string;
	properties?: string;
}

function guessImageMime(href: string, fallback = "image/jpeg"): string {
	const ext = href.split(".").pop()?.toLowerCase().split("?")[0];
	if (ext === "png") return "image/png";
	if (ext === "webp") return "image/webp";
	if (ext === "gif") return "image/gif";
	if (ext === "svg" || ext === "svgz") return "image/svg+xml";
	if (ext === "jpg" || ext === "jpeg") return "image/jpeg";
	return fallback;
}

function findCoverItem(
	opfDoc: Document,
	manifest: Map<string, ManifestItem>,
	base: string,
): ManifestItem | undefined {
	for (const item of manifest.values()) {
		if ((item.properties ?? "").split(" ").includes("cover-image")) {
			return item;
		}
	}
	const metas = opfDoc.getElementsByTagName("meta");
	for (const meta of Array.from(metas)) {
		if (
			meta.getAttribute("name")?.toLowerCase() === "cover" &&
			meta.getAttribute("content")
		) {
			const item = manifest.get(meta.getAttribute("content") as string);
			if (item) return item;
		}
	}
	const guides = opfDoc.getElementsByTagName("guide")[0]?.childNodes ?? [];
	for (const node of Array.from(guides)) {
		if (node.nodeType !== 1) continue;
		const el = node as Element;
		if (
			el.tagName.toLowerCase() === "reference" &&
			el.getAttribute("type")?.toLowerCase() === "cover"
		) {
			const href = el.getAttribute("href");
			if (href) {
				return {
					href: normalizeHref(base, decodeURIComponent(href)),
					mediaType: guessImageMime(href),
				};
			}
		}
	}
	for (const [id, item] of manifest) {
		if (
			item.mediaType.startsWith("image/") &&
			(id.toLowerCase().includes("cover") ||
				item.href.toLowerCase().includes("cover"))
		) {
			return item;
		}
	}
	return undefined;
}

export async function parseEpub(file: File): Promise<ParsedBook> {
	const zip = await JSZip.loadAsync(file);

	const containerFile = zip.file("META-INF/container.xml");
	if (!containerFile) throw new Error("Invalid EPUB: missing container.xml");
	const containerXml = await containerFile.async("string");
	const containerDoc = parseXml(containerXml);
	const rootfile = containerDoc
		.getElementsByTagName("rootfile")[0]
		?.getAttribute("full-path");
	if (!rootfile) throw new Error("Invalid EPUB: missing OPF path");

	const opfFile = zip.file(rootfile);
	if (!opfFile) throw new Error("Invalid EPUB: missing OPF file");
	const opfXml = await opfFile.async("string");
	const opfDoc = parseXml(opfXml);
	const base = dirname(rootfile);

	const title = getText(opfDoc, "dc:title") || cleanTitle(file.name);
	const author = getText(opfDoc, "dc:creator") || "Unknown";
	const publisher = getText(opfDoc, "dc:publisher") || undefined;
	const date = formatBookYear(getText(opfDoc, "dc:date")) || undefined;

	const manifest = new Map<string, ManifestItem>();
	const manifestEls =
		opfDoc.getElementsByTagName("manifest")[0]?.childNodes ?? [];
	for (const node of Array.from(manifestEls)) {
		if (node.nodeType !== 1) continue;
		const el = node as Element;
		if (el.tagName.toLowerCase() !== "item") continue;
		const id = el.getAttribute("id");
		const href = el.getAttribute("href");
		if (!id || !href) continue;
		manifest.set(id, {
			href: normalizeHref(base, decodeURIComponent(href)),
			mediaType: el.getAttribute("media-type") ?? "",
			properties: el.getAttribute("properties") ?? undefined,
		});
	}

	const spineEls = opfDoc.getElementsByTagName("spine")[0]?.childNodes ?? [];
	const spineIds: string[] = [];
	for (const node of Array.from(spineEls)) {
		if (node.nodeType !== 1) continue;
		const el = node as Element;
		if (el.tagName.toLowerCase() !== "itemref") continue;
		const idref = el.getAttribute("idref");
		if (idref) spineIds.push(idref);
	}
	if (spineIds.length === 0) throw new Error("Invalid EPUB: empty spine");

	const toc: TocEntry[] = [];

	const navItem = Array.from(manifest.values()).find((item) =>
		(item.properties ?? "").split(" ").includes("nav"),
	);
	if (navItem) {
		try {
			const navFile = zip.file(navItem.href);
			if (navFile) {
				const navHtml = await navFile.async("string");
				const navDoc = new DOMParser().parseFromString(navHtml, "text/html");
				const tocNav = navDoc.querySelector('nav[*|type="toc"], nav');
				const walk = (ol: Element, level: number) => {
					for (const li of Array.from(ol.children).filter(
						(c) => c.tagName.toLowerCase() === "li",
					)) {
						const a = li.querySelector(":scope > a");
						const label = a?.textContent?.trim();
						const href = a?.getAttribute("href");
						if (label) {
							toc.push({
								label,
								level,
								href: href
									? normalizeHref(dirname(navItem.href), href)
									: undefined,
							});
						}
						const nested = li.querySelector(":scope > ol");
						if (nested) walk(nested, level + 1);
					}
				};
				const topOl = tocNav?.querySelector("ol");
				if (topOl) walk(topOl, 0);
			}
		} catch {
			// fall through to NCX
		}
	}

	if (toc.length === 0) {
		const ncxItem = Array.from(manifest.values()).find(
			(item) => item.mediaType === "application/x-dtbncx+xml",
		);
		if (ncxItem) {
			try {
				const ncxFile = zip.file(ncxItem.href);
				if (ncxFile) {
					const ncxXml = await ncxFile.async("string");
					const ncxDoc = parseXml(ncxXml);
					const walkNcx = (parent: Element, level: number) => {
						for (const node of Array.from(parent.childNodes)) {
							if (node.nodeType !== 1) continue;
							const el = node as Element;
							if (el.tagName.toLowerCase() !== "navpoint") continue;
							const label = el
								.getElementsByTagName("text")[0]
								?.textContent?.trim();
							const src = el
								.getElementsByTagName("content")[0]
								?.getAttribute("src");
							if (label) {
								toc.push({
									label,
									level,
									href: src
										? normalizeHref(dirname(ncxItem.href), src)
										: undefined,
								});
							}
							walkNcx(el, level + 1);
						}
					};
					const navMap = ncxDoc.getElementsByTagName("navMap")[0];
					if (navMap) walkNcx(navMap, 0);
				}
			} catch {
				// keep toc empty
			}
		}
	}

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
		title,
		author,
		publisher,
		date,
		chapterCount: chapters.length,
		wordCount,
		wordCountLabel: formatWordCount(wordCount),
		estimatedAudio: formatAudioETA(wordCount),
		coverUrl,
		coverMime,
		toc,
		chapters,
		fullText,
	};
}
