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
				const title = typeof b.title === "string" && b.title ? b.title : "book";
				try {
					const { filePath, fileName } = await exportM4b(b.fingerprint, title);
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
