import { createFileRoute } from "@tanstack/react-router";

const FALLBACK_KOKORO_BASE_URL = "http://127.0.0.1:8880";

export const Route = createFileRoute("/api/models")({
	server: {
		handlers: {
			GET: async () => {
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

				return Response.json(await res.json());
			},
		},
	},
});
