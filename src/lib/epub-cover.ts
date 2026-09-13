import type { ManifestItem } from "@/lib/epub-manifest";
import { normalizeHref } from "@/lib/epub-xml";

export function guessImageMime(href: string, fallback = "image/jpeg"): string {
	const ext = href.split(".").pop()?.toLowerCase().split("?")[0];
	if (ext === "png") return "image/png";
	if (ext === "webp") return "image/webp";
	if (ext === "gif") return "image/gif";
	if (ext === "svg" || ext === "svgz") return "image/svg+xml";
	if (ext === "jpg" || ext === "jpeg") return "image/jpeg";
	return fallback;
}

export function findCoverItem(
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
