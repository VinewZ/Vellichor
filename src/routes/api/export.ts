import { createReadStream, promises as fs } from "node:fs";
import { Readable } from "node:stream";
import { createFileRoute } from "@tanstack/react-router";
import { exportM4b } from "@/lib/server/render-jobs";

export const Route = createFileRoute("/api/export")({
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
				const rawMeta = (b.metadata ?? {}) as Record<string, unknown>;
				const pick = (v: unknown): string | undefined =>
					typeof v === "string" && v.trim()
						? v.trim().slice(0, 500)
						: undefined;
				const title =
					pick(rawMeta.title) ??
					(typeof b.title === "string" && b.title.trim()
						? b.title.trim().slice(0, 500)
						: "book");
				const metadata = {
					title,
					author: pick(rawMeta.author),
					publisher: pick(rawMeta.publisher),
					date: pick(rawMeta.date)?.slice(0, 50),
					fileName:
						typeof rawMeta.fileName === "string" && rawMeta.fileName.trim()
							? rawMeta.fileName.trim().slice(0, 120)
							: undefined,
				};
				let cover: { dataBase64: string; mime: string } | undefined;
				const rawCover = b.cover as Record<string, unknown> | undefined;
				if (
					rawCover &&
					typeof rawCover.dataBase64 === "string" &&
					(rawCover.mime === "image/jpeg" || rawCover.mime === "image/png")
				) {
					if (rawCover.dataBase64.length > 7 * 1024 * 1024) {
						return Response.json(
							{ error: "Cover image too large" },
							{ status: 400 },
						);
					}
					cover = { dataBase64: rawCover.dataBase64, mime: rawCover.mime };
				}
				try {
					const { filePath, fileName } = await exportM4b(
						b.fingerprint,
						metadata,
						cover,
					);
					const size = (await fs.stat(filePath)).size;
					return new Response(
						Readable.toWeb(createReadStream(filePath)) as ReadableStream,
						{
							headers: {
								"Content-Type": "audio/mp4",
								"Content-Length": String(size),
								"Content-Disposition": `attachment; filename="${fileName.replace(/"/g, "")}"`,
							},
						},
					);
				} catch (e) {
					return Response.json(
						{ error: e instanceof Error ? e.message : "Export failed" },
						{ status: 400 },
					);
				}
			},
		},
	},
});
