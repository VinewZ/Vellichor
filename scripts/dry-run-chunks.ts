// Dry-run: parse ignore/ books with the SAME logic as the app,
// run chunkText, dump everything to /tmp/vellichor-dryrun.
// No Kokoro calls. Run with: bun scripts/dry-run-chunks.ts
// @ts-nocheck - bun-only dry-run script (Bun global, no DOM types)
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import JSZip from "jszip";
import * as pdfjsLib from "pdfjs-dist";
import { chunkText } from "../src/lib/chapter-audio";

const OUT = "/tmp/vellichor-dryrun";
const PDF_PATH = "ignore/leao e o guarda roupa.pdf";
const EPUB_PATH = "ignore/leao e o guarda roupa.epub";
const LOCALE = "pt-BR";

const norm = (s: string) => s.replace(/\s+/g, " ").trim();
const words = (s: string) => (norm(s) ? norm(s).split(" ").length : 0);

async function parsePdfChapters() {
	const data = new Uint8Array(await Bun.file(PDF_PATH).arrayBuffer());
	const pdf = await pdfjsLib.getDocument({ data }).promise;
	try {
		const pageCount = pdf.numPages;
		const pageTexts: string[] = [];
		for (let p = 1; p <= pageCount; p++) {
			const page = await pdf.getPage(p);
			try {
				const content = await page.getTextContent();
				pageTexts.push(
					content.items
						.map((item) =>
							typeof item === "object" && item !== null && "str" in item
								? (item as { str: string }).str
								: "",
						)
						.join(" "),
				);
			} finally {
				page.cleanup();
			}
		}
		type OutlineItem = { title: string; dest?: unknown; items?: OutlineItem[] };
		const rawOutline = (await pdf.getOutline().catch(() => null)) as unknown as Array<{
			title: string;
			dest: unknown;
			items?: Array<{ title: string; dest: unknown }>;
		}> | null;
		const toc: Array<{ label: string; level: number; pageNumber?: number }> = [];
		const resolve = async (dest: unknown): Promise<number | undefined> => {
			try {
				let d: unknown = dest;
				if (typeof dest === "string") d = await pdf.getDestination(dest);
				if (Array.isArray(d) && d.length > 0) {
					const ref = d[0] as { num: number; gen: number } | number;
					if (ref !== null && typeof ref === "object") {
						return ((await pdf.getPageIndex(ref)) as number) + 1;
					}
					if (Number.isInteger(ref)) return (ref as number) + 1;
				}
			} catch {
				return undefined;
			}
			return undefined;
		};
		const walk = async (items: OutlineItem[], level: number) => {
			for (const item of items) {
				toc.push({
					label: (item.title ?? "").trim() || "Untitled",
					level,
					pageNumber: item.dest ? await resolve(item.dest) : undefined,
				});
				if (item.items?.length) await walk(item.items, level + 1);
			}
		};
		if (rawOutline?.length) await walk(rawOutline as OutlineItem[], 0);
		const topLevel = toc.filter((e) => e.level === 0);
		const chapters = topLevel.map((entry, index, arr) => {
			const startPage = entry.pageNumber ?? 1;
			const next = arr[index + 1];
			const endPage = next?.pageNumber ? next.pageNumber - 1 : pageCount;
			const slice = pageTexts.slice(
				Math.max(0, startPage - 1),
				Math.max(startPage - 1, endPage),
			);
			return {
				title: entry.label,
				startPage,
				endPage,
				pages: slice.length,
				text: slice.join("\n\n").trim(),
			};
		});
		return { pageCount, pageTexts, toc, chapters };
	} finally {
		await pdf.cleanup();
	}
}

// --- EPUB: regex-based mirror of parse-epub.ts (no DOMParser in Bun) ---
function stripHtml(html: string): { title: string; text: string } {
	const title =
		html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i)?.[1]?.replace(/<[^>]+>/g, "").trim() ||
		html.match(/<h2[^>]*>([\s\S]*?)<\/h2>/i)?.[1]?.replace(/<[^>]+>/g, "").trim() ||
		"";
	const body = html.match(/<body[^>]*>([\s\S]*?)<\/body>/i)?.[1] ?? html;
	const text = body
		.replace(/<script[\s\S]*?<\/script>/gi, "")
		.replace(/<style[\s\S]*?<\/style>/gi, "")
		.replace(/<[^>]+>/g, "\n")
		.replace(/&nbsp;/g, " ")
		.replace(/&amp;/g, "&")
		.replace(/&lt;/g, "<")
		.replace(/&gt;/g, ">")
		.replace(/&quot;/g, '"')
		.replace(/&#39;/g, "'")
		.replace(/[ \t]+\n/g, "\n")
		.replace(/\n{3,}/g, "\n\n")
		.trim();
	return { title, text };
}

function attr(tag: string, name: string): string | undefined {
	return tag.match(new RegExp(`${name}\\s*=\\s*"([^"]*)"`, "i"))?.[1];
}

async function parseEpubChapters() {
	const zip = await JSZip.loadAsync(Bun.file(EPUB_PATH).arrayBuffer());
	const container = await zip.file("META-INF/container.xml")?.async("string");
	const rootfile = container?.match(/full-path\s*=\s*"([^"]+)"/i)?.[1];
	if (!rootfile) throw new Error("no OPF path");
	const opf = await zip.file(rootfile)?.async("string");
	if (!opf) throw new Error("no OPF");
	const base = rootfile.includes("/") ? rootfile.slice(0, rootfile.lastIndexOf("/") + 1) : "";
	const manifest = new Map<string, { href: string; mediaType: string }>();
	for (const m of opf.matchAll(/<item\b[^>]*>/gi)) {
		const id = attr(m[0], "id");
		const href = attr(m[0], "href");
		if (id && href) manifest.set(id, { href: base + decodeURIComponent(href), mediaType: attr(m[0], "media-type") ?? "" });
	}
	const spine: string[] = [];
	for (const m of opf.matchAll(/<itemref\b[^>]*>/gi)) {
		const idref = attr(m[0], "idref");
		if (idref) spine.push(idref);
	}
	const ncxItem = [...manifest.values()].find((i) => i.mediaType === "application/x-dtbncx+xml");
	const tocLabels: string[] = [];
	if (ncxItem) {
		const ncx = await zip.file(ncxItem.href)?.async("string");
		if (ncx) for (const m of ncx.matchAll(/<text>([\s\S]*?)<\/text>/gi)) tocLabels.push(m[1]?.trim() ?? "");
	}
	const chapters: Array<{ title: string; href: string; text: string }> = [];
	for (let i = 0; i < spine.length; i++) {
		const item = manifest.get(spine[i] ?? "");
		if (!item) continue;
		const file = zip.file(item.href);
		if (!file) continue;
		const html = await file.async("string");
		const { title, text } = stripHtml(html);
		if (!text) continue;
		chapters.push({ title: title || tocLabels[chapters.length] || `Chapter ${i + 1}`, href: item.href, text });
	}
	return { spineCount: spine.length, tocLabels, chapters };
}

function checkCoverage(label: string, source: string, chunks: string[]) {
	const joined = norm(chunks.join(" "));
	const src = norm(source);
	const srcWords = src ? src.split(" ").length : 0;
	const chunkWords = joined ? joined.split(" ").length : 0;
	// Paragraph-level: every \n\n block's head+tail must survive
	const blocks = source.split(/\n+/).map((b) => norm(b)).filter(Boolean);
	const missing: Array<{ i: number; head: string; len: number }> = [];
	blocks.forEach((b, i) => {
		const head = b.slice(0, 60);
		const tail = b.slice(-40);
		if (!joined.includes(head) || (b.length > 80 && !joined.includes(tail))) {
			missing.push({ i, head: head.slice(0, 80), len: b.length });
		}
	});
	return {
		label,
		sourceChars: source.length,
		sourceWords: srcWords,
		chunkWords,
		wordRetention: srcWords ? Number((chunkWords / srcWords).toFixed(4)) : 1,
		blockCount: blocks.length,
		missingBlocks: missing.length,
		missing,
		overLimit: chunks.filter((c) => c.length > 4000).length,
	};
}

const pdf = await parsePdfChapters();
const epub = await parseEpubChapters();
await mkdir(OUT, { recursive: true });

const report: Record<string, unknown> = { locale: LOCALE, pdf: {}, epub: {} };

// PDF per-chapter dumps
for (let i = 0; i < pdf.chapters.length; i++) {
	const ch = pdf.chapters[i]!;
	const chunks = chunkText(ch.text, LOCALE);
	const cov = checkCoverage(`pdf ch${i}`, ch.text, chunks);
	(report.pdf as Record<string, unknown>)[`ch${i}`] = {
		title: ch.title, startPage: ch.startPage, endPage: ch.endPage,
		pages: ch.pages,
		totalChunks: chunks.length,
		chunkChars: chunks.map((c) => c.length),
		...cov,
	};
	await writeFile(join(OUT, `pdf-ch-${String(i).padStart(2, "0")}.txt`),
		`TITLE: ${ch.title}\nPAGES: ${ch.startPage}-${ch.endPage} (${ch.pages} pages)\nCHUNKS: ${chunks.length}\n${"=".repeat(60)}\n${ch.text}\n`);
	await writeFile(join(OUT, `pdf-ch-${String(i).padStart(2, "0")}.chunks.json`),
		JSON.stringify(chunks.map((t, ci) => ({ i: ci, chars: t.length, words: words(t), text: t })), null, 1));
}
await writeFile(join(OUT, "pdf-page-lengths.json"),
	JSON.stringify(pdf.pageTexts.map((t, i) => ({ page: i + 1, chars: t.length, words: words(t), head: t.slice(0, 120) })), null, 1));
await writeFile(join(OUT, "pdf-toc.json"), JSON.stringify(pdf.toc, null, 1));

// EPUB per-chapter dumps
for (let i = 0; i < epub.chapters.length; i++) {
	const ch = epub.chapters[i]!;
	const chunks = chunkText(ch.text, LOCALE);
	const cov = checkCoverage(`epub ch${i}`, ch.text, chunks);
	(report.epub as Record<string, unknown>)[`ch${i}`] = {
		title: ch.title, href: ch.href,
		totalChunks: chunks.length,
		chunkChars: chunks.map((c) => c.length),
		...cov,
	};
	await writeFile(join(OUT, `epub-ch-${String(i).padStart(2, "0")}.txt`),
		`TITLE: ${ch.title}\nHREF: ${ch.href}\nCHUNKS: ${chunks.length}\n${"=".repeat(60)}\n${ch.text}\n`);
}
await writeFile(join(OUT, "report.json"), JSON.stringify(report, null, 1));

console.log(`PDF: ${pdf.pageCount} pages, ${pdf.toc.length} toc, ${pdf.chapters.length} chapters`);
console.log(`EPUB: spine ${epub.spineCount}, ${epub.chapters.length} chapters, ${epub.tocLabels.length} ncx labels`);
console.log(`Wrote ${OUT}/report.json + per-chapter dumps`);
