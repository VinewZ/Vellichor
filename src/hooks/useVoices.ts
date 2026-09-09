import { useQuery } from "@tanstack/react-query";
import type { CountryVoiceGroup } from "@/routes/api/voices";

export interface Voice {
	id: string;
	description: string;
}

export interface VoicesResponse {
	voices: Voice[];
	openai_aliases: Record<string, string>;
	byCountry: CountryVoiceGroup[];
}

export const VOICES_URL = "/api/voices";

async function fetchVoices(): Promise<VoicesResponse> {
	const res = await fetch(VOICES_URL);
	if (!res.ok) {
		throw new Error(`Failed to fetch voices: ${res.status} ${res.statusText}`);
	}
	return res.json();
}

export function useVoices() {
	return useQuery({
		queryKey: ["voices"],
		queryFn: fetchVoices,
		staleTime: Number.POSITIVE_INFINITY,
		gcTime: 30 * 60 * 1000,
		retry: 1,
		refetchOnWindowFocus: false,
	});
}
