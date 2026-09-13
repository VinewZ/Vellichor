import type JSZip from "jszip";
import type { TocEntry } from "@/lib/book";
import type { ManifestItem } from "@/lib/epub-manifest";
import { dirname, normalizeHref, parseXml } from "@/lib/epub-xml";

async function extractNavToc(
	zip: JSZip,
	manifest: Map<string, ManifestItem>,
): Promise<TocEntry[]> {
	const toc: TocEntry[] = [];
	const navItem = Array.from(manifest.values()).find((item) =>
		(item.properties ?? "").split(" ").includes("nav"),
	);
	if (!navItem) return toc;
	try {
		const navFile = zip.file(navItem.href);
		if (!navFile) return toc;
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
						href: href ? normalizeHref(dirname(navItem.href), href) : undefined,
					});
				}
				const nested = li.querySelector(":scope > ol");
				if (nested) walk(nested, level + 1);
			}
		};
		const topOl = tocNav?.querySelector("ol");
		if (topOl) walk(topOl, 0);
	} catch {
		return [];
	}
	return toc;
}

async function extractNcxToc(
	zip: JSZip,
	manifest: Map<string, ManifestItem>,
): Promise<TocEntry[]> {
	const toc: TocEntry[] = [];
	const ncxItem = Array.from(manifest.values()).find(
		(item) => item.mediaType === "application/x-dtbncx+xml",
	);
	if (!ncxItem) return toc;
	try {
		const ncxFile = zip.file(ncxItem.href);
		if (!ncxFile) return toc;
		const ncxXml = await ncxFile.async("string");
		const ncxDoc = parseXml(ncxXml);
		const walkNcx = (parent: Element, level: number) => {
			for (const node of Array.from(parent.childNodes)) {
				if (node.nodeType !== 1) continue;
				const el = node as Element;
				if (el.tagName.toLowerCase() !== "navpoint") continue;
				const label = el.getElementsByTagName("text")[0]?.textContent?.trim();
				const src = el.getElementsByTagName("content")[0]?.getAttribute("src");
				if (label) {
					toc.push({
						label,
						level,
						href: src ? normalizeHref(dirname(ncxItem.href), src) : undefined,
					});
				}
				walkNcx(el, level + 1);
			}
		};
		const navMap = ncxDoc.getElementsByTagName("navMap")[0];
		if (navMap) walkNcx(navMap, 0);
	} catch {
		return [];
	}
	return toc;
}

export async function extractToc(
	zip: JSZip,
	manifest: Map<string, ManifestItem>,
): Promise<TocEntry[]> {
	const navToc = await extractNavToc(zip, manifest);
	if (navToc.length > 0) return navToc;
	return extractNcxToc(zip, manifest);
}
