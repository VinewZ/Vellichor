import { useQuery } from "@tanstack/react-query";

export interface Model {
	id: string;
	object: string;
	created: number;
	owned_by: string;
}

export interface ModelsResponse {
	object: string;
	data: Model[];
}

export const MODELS_URL = "/api/models";

async function fetchModels(): Promise<ModelsResponse> {
	const res = await fetch(MODELS_URL);
	if (!res.ok) {
		throw new Error(`Failed to fetch models: ${res.status} ${res.statusText}`);
	}
	return res.json();
}

export function useModels() {
	return useQuery({
		queryKey: ["models"],
		queryFn: fetchModels,
		staleTime: Number.POSITIVE_INFINITY,
		gcTime: 30 * 60 * 1000,
		retry: 1,
		refetchOnWindowFocus: false,
	});
}
