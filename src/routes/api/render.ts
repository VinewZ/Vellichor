import { createFileRoute } from "@tanstack/react-router";
import {
	cancelJob,
	deleteBook,
	getJob,
	readManifest,
	startRender,
} from "@/lib/server/render";
import type { SynthesisSnapshot } from "@/lib/synthesis";

function clamp(n: number, min: number, max: number, fallback: number) {
	return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
}

function parseSynthesis(raw: unknown): SynthesisSnapshot {
	const s = (raw ?? {}) as Record<string, unknown>;
	const format = s.format;
	return {
		model: typeof s.model === "string" && s.model ? s.model : "kokoro",
		voice: typeof s.voice === "string" ? s.voice : "",
		speed: clamp(Number(s.speed), 0.25, 4, 1),
		volume: clamp(Number(s.volume), 0.1, 2, 1),
		format:
			format === "mp3" ||
			format === "opus" ||
			format === "aac" ||
			format === "flac" ||
			format === "wav" ||
			format === "pcm"
				? format
				: "mp3",
	};
}

export const Route = createFileRoute("/api/render")({
	server: {
		handlers: {
			POST: async ({ request }: { request: Request }) => {
				let body: unknown;
				try {
					body = await request.json();
				} catch {
					return Response.json({ error: "Invalid JSON body" }, { status: 400 });
				}
				const b = (body ?? {}) as Record<string, unknown>;
				if (typeof b.fingerprint !== "string" || !b.fingerprint) {
					return Response.json(
						{ error: "Missing fingerprint" },
						{ status: 400 },
					);
				}
				if (typeof b.voice !== "string" || !b.voice) {
					return Response.json({ error: "Missing voice" }, { status: 400 });
				}
				if (!Array.isArray(b.chapters) || b.chapters.length === 0) {
					return Response.json({ error: "Missing chapters" }, { status: 400 });
				}
				if (b.chapters.length > 500) {
					return Response.json({ error: "Too many chapters" }, { status: 400 });
				}
				const chapters: Array<{
					index: number;
					title: string;
					text: string;
					wordCount: number;
				}> = [];
				for (const entry of b.chapters) {
					const c = (entry ?? {}) as Record<string, unknown>;
					if (
						!Number.isInteger(c.index) ||
						(c.index as number) < 0 ||
						typeof c.text !== "string" ||
						c.text.length === 0 ||
						c.text.length > 2_000_000
					) {
						return Response.json(
							{ error: "Invalid chapter entry" },
							{ status: 400 },
						);
					}
					chapters.push({
						index: c.index as number,
						title:
							typeof c.title === "string"
								? c.title
								: `Chapter ${(c.index as number) + 1}`,
						text: c.text,
						wordCount: Number.isFinite(Number(c.wordCount))
							? Number(c.wordCount)
							: 0,
					});
				}
				try {
					const jobId = await startRender({
						fingerprint: b.fingerprint,
						fileName: typeof b.fileName === "string" ? b.fileName : "book",
						voice: b.voice,
						synthesis: parseSynthesis(b.synthesis),
						chapters,
					});
					return Response.json({ jobId });
				} catch (e) {
					const message =
						e instanceof Error ? e.message : "Could not start render";
					const status =
						message === "Another render is already running" ? 409 : 400;
					return Response.json({ error: message }, { status });
				}
			},
			GET: async ({ request }: { request: Request }) => {
				const url = new URL(request.url);
				const id = url.searchParams.get("id");
				if (id) {
					const job = getJob(id);
					if (!job)
						return Response.json({ error: "Unknown job" }, { status: 404 });
					return Response.json(job);
				}
				const fingerprint = url.searchParams.get("fingerprint");
				if (fingerprint) {
					return Response.json(await readManifest(fingerprint));
				}
				return Response.json(
					{ error: "Missing id or fingerprint" },
					{ status: 400 },
				);
			},
			DELETE: async ({ request }: { request: Request }) => {
				const url = new URL(request.url);
				const id = url.searchParams.get("id");
				if (id) {
					if (!cancelJob(id)) {
						return Response.json({ error: "Unknown job" }, { status: 404 });
					}
					return Response.json({ cancelled: true });
				}
				const fingerprint = url.searchParams.get("fingerprint");
				if (fingerprint) {
					try {
						await deleteBook(fingerprint);
					} catch {
						return Response.json(
							{ error: "Invalid fingerprint" },
							{ status: 400 },
						);
					}
					return Response.json({ deleted: true });
				}
				return Response.json(
					{ error: "Missing id or fingerprint" },
					{ status: 400 },
				);
			},
		},
	},
});
