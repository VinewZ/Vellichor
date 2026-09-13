import { stat } from "node:fs/promises";
import { join } from "node:path";

function dataDir(): string {
	return process.env.VELLICHOR_DATA_DIR ?? join(process.cwd(), "data");
}

export function sanitizeFingerprint(raw: unknown): string {
	if (
		typeof raw !== "string" ||
		!/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(raw)
	) {
		throw new Error("Invalid fingerprint");
	}
	return raw;
}

export function bookDir(fingerprint: string): string {
	return join(dataDir(), "books", fingerprint);
}

export function chapterFileName(index: number): string {
	return `ch-${String(index).padStart(3, "0")}.mp3`;
}

export function chapterPath(fingerprint: string, index: number): string {
	return join(bookDir(fingerprint), chapterFileName(index));
}

export function manifestPath(fingerprint: string): string {
	return join(bookDir(fingerprint), "manifest.json");
}

export async function fileExists(path: string): Promise<boolean> {
	try {
		await stat(path);
		return true;
	} catch {
		return false;
	}
}
