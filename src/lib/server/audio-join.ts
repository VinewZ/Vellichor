import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileAsync, ffmpegPath } from "@/lib/server/ffmpeg";

function sniffAudioExt(buf: Buffer): string {
	if (
		buf.length >= 12 &&
		buf.subarray(0, 4).toString("ascii") === "RIFF" &&
		buf.subarray(8, 12).toString("ascii") === "WAVE"
	)
		return "wav";
	if (buf.length >= 3 && buf[0] === 0xff && (buf[1] ?? 0) >= 0xe0) return "mp3";
	if (buf.subarray(0, 3).toString("ascii") === "ID3") return "mp3";
	if (buf.subarray(0, 4).toString("ascii") === "fLaC") return "flac";
	if (buf.subarray(0, 4).toString("ascii") === "OggS") return "ogg";
	return "bin";
}

// Kokoro may return WAV, MP3, or other bytes regardless of the requested
// response_format, and every part carries its own container headers.
// Raw Buffer.concat of such parts yields a file that plays only part 0:
// a WAV header declares part 0's length, mid-file ID3 tags stop players.
// Decode + re-encode through ffmpeg so N parts become one clean MP3.
export async function joinPartsToMp3(
	parts: Buffer[],
	outPath: string,
): Promise<void> {
	if (parts.length === 0) throw new Error("No audio parts to join");
	if (parts.length === 1 && sniffAudioExt(parts[0] as Buffer) === "mp3") {
		await writeFile(outPath, parts[0] as Buffer);
		return;
	}
	const dir = await mkdtemp(join(tmpdir(), "vellichor-parts-"));
	try {
		const args = ["-y", "-hide_banner", "-nostats", "-loglevel", "error"];
		for (let i = 0; i < parts.length; i++) {
			const partPath = join(
				dir,
				`part-${i}.${sniffAudioExt(parts[i] as Buffer)}`,
			);
			await writeFile(partPath, parts[i] as Buffer);
			args.push("-i", partPath);
		}
		args.push(
			"-filter_complex",
			`concat=n=${parts.length}:v=0:a=1`,
			"-c:a",
			"libmp3lame",
			"-b:a",
			"64k",
			"-ac",
			"1",
			"-ar",
			"24000",
			outPath,
		);
		await execFileAsync(ffmpegPath(), args);
	} finally {
		await rm(dir, { recursive: true, force: true }).catch(() => {});
	}
}
