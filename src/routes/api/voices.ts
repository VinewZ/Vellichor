import { createFileRoute } from "@tanstack/react-router";
import { kokoroAuthHeaders, kokoroBaseUrl } from "@/lib/server/kokoro";

const COUNTRY_NAMES: Record<string, string> = {
	a: "American",
	b: "British",
	e: "Spanish",
	f: "French",
	h: "Hindi",
	i: "Italian",
	j: "Japanese",
	p: "Brazilian Portuguese",
	z: "Mandarin Chinese",
};

export interface CountryVoiceOption {
	id: string;
	description: string;
	gender: "female" | "male";
}

export interface CountryVoiceGroup {
	country: string;
	voices: CountryVoiceOption[];
}

export function groupVoicesByCountry(
	voices: Array<{ id: string; description: string }>,
): CountryVoiceGroup[] {
	const groups = new Map<string, CountryVoiceOption[]>();

	for (const voice of voices) {
		const prefix = voice.id.split("_")[0] ?? "";
		const country = COUNTRY_NAMES[prefix[0] ?? ""] ?? "Other";
		const gender = prefix[1] === "m" ? "male" : "female";

		const list = groups.get(country) ?? [];
		list.push({ id: voice.id, description: voice.description, gender });
		groups.set(country, list);
	}

	return [...groups.entries()].map(([country, groupVoices]) => ({
		country,
		voices: groupVoices,
	}));
}

export const Route = createFileRoute("/api/voices")({
	server: {
		handlers: {
			GET: async () => {
				let baseUrl: string;
				try {
					baseUrl = kokoroBaseUrl();
				} catch (e) {
					return Response.json(
						{ error: e instanceof Error ? e.message : "KOKORO_BASE_URL is not set" },
						{ status: 500 },
					);
				}

				let res: Response;
				try {
					res = await fetch(`${baseUrl}/v1/voices`, {
						headers: kokoroAuthHeaders(),
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
					return Response.json(
						{ error: `Kokoro responded with status ${res.status}` },
						{ status: 502 },
					);
				}

				const data = (await res.json()) as {
					voices?: Array<{ id: string; description: string }>;
					openai_aliases?: Record<string, string>;
				};
				const voices = data.voices ?? [];

				return Response.json({
					voices,
					openai_aliases: data.openai_aliases ?? {},
					byCountry: groupVoicesByCountry(voices),
				});
			},
		},
	},
});
