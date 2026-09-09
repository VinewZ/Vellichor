import { createFileRoute } from "@tanstack/react-router";

const FALLBACK_KOKORO_BASE_URL = "http://127.0.0.1:8880";

const CACHE_TTL_MS = 60 * 60 * 1000;
let cached: { expires: number; data: unknown } | null = null;

export const Route = createFileRoute("/api/models")({
	server: {
		handlers: {
			GET: async () => {
				if (cached && Date.now() < cached.expires) {
					return Response.json(cached.data, {
						headers: { "Cache-Control": "public, max-age=3600" },
					});
				}
				const baseUrl = process.env.KOKORO_BASE_URL ?? FALLBACK_KOKORO_BASE_URL;

				let res: Response;
				try {
					res = await fetch(`${baseUrl}/v1/models`);
				} catch (error) {
					return Response.json(
						{
							error: "Kokoro backend unreachable",
							detail: error instanceof Error ? error.message : String(error),
						},
						{ status: 502 },
					);
				}

				if (!res.ok) {
					return Response.json(
						{ error: `Kokoro responded with status ${res.status}` },
						{ status: 502 },
					);
				}

				const data = await res.json();
				cached = { expires: Date.now() + CACHE_TTL_MS, data };
				return Response.json(data, {
					headers: { "Cache-Control": "public, max-age=3600" },
				});
			},
		},
	},
});
