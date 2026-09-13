import { execFile, spawn } from "node:child_process";
import { promisify } from "node:util";

export const execFileAsync = promisify(execFile);

export function ffmpegPath(): string {
	return process.env.VELLICHOR_FFMPEG_PATH ?? "ffmpeg";
}

export function ffprobePath(): string {
	return process.env.VELLICHOR_FFPROBE_PATH ?? "ffprobe";
}

export async function probeDurationSec(
	filePath: string,
): Promise<number | undefined> {
	try {
		const { stdout } = await execFileAsync(ffprobePath(), [
			"-v",
			"error",
			"-show_entries",
			"format=duration",
			"-of",
			"csv=p=0",
			filePath,
		]);
		const seconds = Number.parseFloat(stdout.trim());
		if (Number.isFinite(seconds) && seconds >= 0) return seconds;
	} catch {
		// ignore probe failures
	}
	return undefined;
}

export async function runFfmpegWithProgress(
	args: string[],
	totalMs: number,
	onProgress?: (doneMs: number) => void,
): Promise<void> {
	const progressedArgs = [...args];
	const outIndex = progressedArgs.lastIndexOf("book.m4b");
	if (outIndex === -1) {
		progressedArgs.push("-hide_banner", "-nostats", "-progress", "pipe:1");
	} else {
		progressedArgs.splice(
			outIndex,
			0,
			"-hide_banner",
			"-nostats",
			"-progress",
			"pipe:1",
		);
	}
	await new Promise<void>((resolve, reject) => {
		const child = spawn(ffmpegPath(), progressedArgs, {
			stdio: ["ignore", "pipe", "pipe"],
		});
		let stdoutBuf = "";
		let stderrTail = "";
		let settled = false;
		const fail = (message: string) => {
			if (settled) return;
			settled = true;
			try {
				child.kill("SIGKILL");
			} catch {
				// already exited
			}
			reject(new Error(message));
		};
		const finish = (code: number | null) => {
			if (settled) return;
			settled = true;
			if (code === 0) resolve();
			else
				reject(
					new Error(
						`ffmpeg export failed (code ${code ?? "?"}): ${stderrTail.slice(-500)}`,
					),
				);
		};
		child.stdout.on("data", (chunk: Buffer) => {
			stdoutBuf += chunk.toString();
			let idx = stdoutBuf.indexOf("\n");
			while (idx >= 0) {
				const line = stdoutBuf.slice(0, idx).trim();
				stdoutBuf = stdoutBuf.slice(idx + 1);
				if (line.startsWith("out_time_ms=")) {
					const v = Number(line.slice("out_time_ms=".length).trim());
					// ffmpeg reports out_time_ms in microseconds despite the name
					if (Number.isFinite(v))
						onProgress?.(Math.max(0, Math.round(v / 1000)));
				} else if (line.startsWith("out_time_us=")) {
					const v = Number(line.slice("out_time_us=".length).trim());
					if (Number.isFinite(v))
						onProgress?.(Math.max(0, Math.round(v / 1000)));
				} else if (line === "progress=end") {
					onProgress?.(totalMs);
				}
				idx = stdoutBuf.indexOf("\n");
			}
		});
		child.stderr.on("data", (chunk: Buffer) => {
			const text = chunk.toString();
			stderrTail += text;
			if (stderrTail.length > 20000) stderrTail = stderrTail.slice(-20000);
			// Fallback for ffmpeg builds without -progress support
			const matches = text.matchAll(/time=(\d+:\d{1,2}:[\d.]+)/g);
			for (const m of matches) {
				const ms = parseTimeToMs(m[1] ?? "");
				if (ms !== undefined) onProgress?.(ms);
			}
		});
		child.on("error", (e) => fail(`ffmpeg export failed: ${e.message}`));
		child.on("close", finish);
	});
}

function parseTimeToMs(value: string): number | undefined {
	const m = value.trim().match(/(\d+):(\d{1,2}):([\d.]+)/);
	if (!m) return undefined;
	const h = Number(m[1]);
	const min = Number(m[2]);
	const sec = Number(m[3]);
	if (!Number.isFinite(h) || !Number.isFinite(min) || !Number.isFinite(sec))
		return undefined;
	return Math.round((h * 3600 + min * 60 + sec) * 1000);
}
