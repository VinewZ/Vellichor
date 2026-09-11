export function kokoroBaseUrl(): string {
	const raw = process.env.KOKORO_BASE_URL?.trim().replace(/\/+$/, "");
	if (!raw) {
		throw new Error(
			"KOKORO_BASE_URL is not set. Point it at your Kokoro TTS server, e.g. KOKORO_BASE_URL=http://127.0.0.1:8880",
		);
	}
	return raw;
}
