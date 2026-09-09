import { createReadStream, promises as fs } from "node:fs";
import { join } from "node:path";
import { Readable } from "node:stream";
import { createFileRoute } from "@tanstack/react-router";
import {
	bookDir,
	chapterFileName,
	sanitizeFingerprint,
} from "@/lib/server/render-jobs";

export const Route = createFileRoute("/api/files")({
	server: {
		handlers: {
			GET: async ({ request }: { request: Request }) => {
				const url = new URL(request.url);
				let dir: string;
				let index: number;
				try {
					dir = bookDir(
						sanitizeFingerprint(url.searchParams.get("fingerprint")),
					);
					index = Number(url.searchParams.get("chapter"));
					if (!Number.isInteger(index) || index < 0)
						throw new Error("bad chapter");
				} catch {
					return Response.json({ error: "Invalid request" }, { status: 400 });
				}
				const filePath = join(dir, chapterFileName(index));
				let size: number;
				try {
					size = (await fs.stat(filePath)).size;
				} catch {
					return Response.json({ error: "Not found" }, { status: 404 });
				}
				return new Response(
					Readable.toWeb(createReadStream(filePath)) as ReadableStream,
					{
						headers: {
							"Content-Type": "audio/mpeg",
							"Content-Length": String(size),
							"Accept-Ranges": "none",
							"Cache-Control": "private, max-age=3600",
						},
					},
				);
			},
		},
	},
});
