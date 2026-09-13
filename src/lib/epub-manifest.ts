import type JSZip from "jszip";
import { cleanTitle, formatBookYear } from "@/lib/book";
import { dirname, getText, normalizeHref, parseXml } from "@/lib/epub-xml";

export interface ManifestItem {
	href: string;
	mediaType: string;
	properties?: string;
}

export interface EpubPackage {
	opfDoc: Document;
	manifest: Map<string, ManifestItem>;
	spineIds: string[];
	base: string;
	title: string;
	author: string;
	publisher?: string;
	date?: string;
}

function readAttr(el: Element, name: string): string | undefined {
	return el.getAttribute(name) ?? undefined;
}

export async function loadPackage(
	zip: JSZip,
	fileName: string,
): Promise<EpubPackage> {
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

	const title = getText(opfDoc, "dc:title") || cleanTitle(fileName);
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
		const id = readAttr(el, "id");
		const href = readAttr(el, "href");
		if (!id || !href) continue;
		manifest.set(id, {
			href: normalizeHref(base, decodeURIComponent(href)),
			mediaType: readAttr(el, "media-type") ?? "",
			properties: readAttr(el, "properties"),
		});
	}

	const spineEls = opfDoc.getElementsByTagName("spine")[0]?.childNodes ?? [];
	const spineIds: string[] = [];
	for (const node of Array.from(spineEls)) {
		if (node.nodeType !== 1) continue;
		const el = node as Element;
		if (el.tagName.toLowerCase() !== "itemref") continue;
		const idref = readAttr(el, "idref");
		if (idref) spineIds.push(idref);
	}
	if (spineIds.length === 0) throw new Error("Invalid EPUB: empty spine");

	return {
		opfDoc,
		manifest,
		spineIds,
		base,
		title,
		author,
		publisher,
		date,
	};
}
