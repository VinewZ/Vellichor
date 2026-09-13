export function parseXml(xml: string): Document {
	const doc = new DOMParser().parseFromString(xml, "application/xml");
	const parserError = doc.querySelector("parsererror");
	if (parserError) {
		throw new Error("Could not parse EPUB XML");
	}
	return doc;
}

export function getText(doc: Document, ...selectors: string[]): string {
	for (const selector of selectors) {
		const el = doc.getElementsByTagName(selector)[0];
		if (el?.textContent?.trim()) return el.textContent.trim();
	}
	return "";
}

export function dirname(path: string): string {
	const idx = path.lastIndexOf("/");
	return idx === -1 ? "" : path.slice(0, idx + 1);
}

export function normalizeHref(base: string, href: string): string {
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
