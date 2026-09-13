export function extractHtmlText(html: string): {
	title: string;
	text: string;
} {
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
