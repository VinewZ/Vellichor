import { createFileRoute } from "@tanstack/react-router";
import { kokoroAuthHeaders, kokoroBaseUrl } from "@/lib/server/kokoro";

export const Route = createFileRoute("/api/speech")({
	server: {
		handlers: {
			POST: async ({ request }: { request: Request }) => {
				let baseUrl: string;
				try {
					baseUrl = kokoroBaseUrl();
				} catch (e) {
					return Response.json(
						{ error: e instanceof Error ? e.message : "KOKORO_BASE_URL is not set" },
						{ status: 500 },
					);
				}

				let body: unknown;
				try {
					body = await request.json();
				} catch {
					return Response.json({ error: "Invalid JSON body" }, { status: 400 });
				}

				let res: Response;
				try {
					res = await fetch(`${baseUrl}/v1/audio/speech`, {
						method: "POST",
						headers: {
							"Content-Type": "application/json",
							...kokoroAuthHeaders(),
						},
						body: JSON.stringify(body),
					});
				} catch (error) {
					return Response.json(
						{
							error: "Kokoro backend unreachable",
							detail: error instanceof Error ? error.message : String(error),
						},
						{ status: 502 },
					);
				}

				if (res.status === 401) {
					return Response.json(
						{ error: "Kokoro rejected the API key (401) — check KOKORO_API_KEY" },
						{ status: 502 },
					);
				}
				if (!res.ok) {
					let detail: unknown = null;
					try {
						detail = await res.json();
					} catch {
						// upstream returned non-JSON error (e.g. binary error page)
					}
					return Response.json(
						{ error: `Kokoro responded with status ${res.status}`, detail },
						{ status: 502 },
					);
				}

				const contentType = res.headers.get("Content-Type") ?? "audio/mpeg";
				const buffer = await res.arrayBuffer();
				return new Response(buffer, {
					headers: {
						"Content-Type": contentType,
						"Cache-Control": "no-store",
					},
				});
			},
		},
	},
});
