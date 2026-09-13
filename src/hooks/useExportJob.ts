import { useCallback, useEffect, useRef, useState } from "react";
import type { ParsedBook } from "@/lib/book";
import { isAttachableCoverMime, parsedBookToExportMeta } from "@/lib/book";

interface ExportJobSnapshot {
	jobId: string;
	status: string;
	progress: number;
	phase: string;
	error?: string;
}

interface UseExportJobParams {
	book: ParsedBook | null;
	fingerprint: string | null;
	setError: (error: string | null) => void;
}

export function useExportJob({
	book,
	fingerprint,
	setError,
}: UseExportJobParams) {
	const [exporting, setExporting] = useState(false);
	const [exportProgress, setExportProgress] = useState(0);
	const [exportPhase, setExportPhase] = useState("");

	const exportPollRef = useRef<number | null>(null);
	const exportJobRef = useRef<string | null>(null);

	const stopExportPolling = useCallback(() => {
		if (exportPollRef.current !== null) {
			window.clearTimeout(exportPollRef.current);
			exportPollRef.current = null;
		}
		exportJobRef.current = null;
	}, []);

	useEffect(() => stopExportPolling, [stopExportPolling]);

	const resetExport = useCallback(() => {
		stopExportPolling();
		setExporting(false);
		setExportProgress(0);
		setExportPhase("");
	}, [stopExportPolling]);

	const exportM4b = useCallback(() => {
		if (!book || !fingerprint || exporting) return;
		stopExportPolling();
		setExporting(true);
		setExportProgress(0);
		setExportPhase("Preparing…");
		setError(null);
		const buildCover = async (): Promise<
			{ dataBase64: string; mime: string } | undefined
		> => {
			try {
				if (!book.coverUrl || !isAttachableCoverMime(book.coverMime))
					return undefined;
				const res = await fetch(book.coverUrl);
				if (!res.ok) return undefined;
				const blob = await res.blob();
				if (!isAttachableCoverMime(blob.type || book.coverMime))
					return undefined;
				if (blob.size === 0 || blob.size > 5 * 1024 * 1024) return undefined;
				const dataUrl: string = await new Promise((resolve, reject) => {
					const reader = new FileReader();
					reader.onerror = () =>
						reject(reader.error ?? new Error("Could not read cover"));
					reader.onload = () => resolve(reader.result as string);
					reader.readAsDataURL(blob);
				});
				const dataBase64 = dataUrl.split(",", 2)[1] ?? "";
				if (!dataBase64) return undefined;
				return {
					dataBase64,
					mime: blob.type || (book.coverMime as string),
				};
			} catch {
				return undefined;
			}
		};
		const downloadFinishedExport = async (jobId: string) => {
			const res = await fetch(
				`/api/export?id=${encodeURIComponent(jobId)}&download=1`,
			);
			if (!res.ok) {
				const data = (await res.json().catch(() => null)) as {
					error?: string;
				} | null;
				throw new Error(data?.error ?? `Export failed: ${res.status}`);
			}
			const blob = await res.blob();
			const url = URL.createObjectURL(blob);
			const a = document.createElement("a");
			a.href = url;
			a.download = `${book.title.replace(/[^A-Za-z0-9._-]+/g, " ").trim() || "book"}.m4b`;
			document.body.appendChild(a);
			a.click();
			a.remove();
			URL.revokeObjectURL(url);
		};
		const pollExport = (jobId: string) => {
			exportJobRef.current = jobId;
			fetch(`/api/export?id=${encodeURIComponent(jobId)}`)
				.then((res) => {
					if (!res.ok) {
						return res.json().then((data: { error?: string }) => {
							throw new Error(data.error ?? `Export failed: ${res.status}`);
						});
					}
					return res.json() as Promise<ExportJobSnapshot>;
				})
				.then((snap) => {
					if (exportJobRef.current !== jobId) return;
					if (typeof snap.progress === "number")
						setExportProgress(snap.progress);
					if (typeof snap.phase === "string" && snap.phase)
						setExportPhase(snap.phase);
					if (snap.status === "done") {
						exportJobRef.current = null;
						downloadFinishedExport(jobId)
							.then(() => {
								setExportProgress(100);
								setExportPhase("Done");
							})
							.catch((e: unknown) => {
								setError(e instanceof Error ? e.message : "Export failed");
							})
							.finally(() => setExporting(false));
					} else if (snap.status === "error") {
						exportJobRef.current = null;
						setError(snap.error ?? "Export failed");
						setExporting(false);
					} else {
						if (exportPollRef.current !== null)
							window.clearTimeout(exportPollRef.current);
						exportPollRef.current = window.setTimeout(
							() => pollExport(jobId),
							1000,
						);
					}
				})
				.catch((e: unknown) => {
					if (exportJobRef.current !== jobId) return;
					exportJobRef.current = null;
					setError(e instanceof Error ? e.message : "Export failed");
					setExporting(false);
				});
		};
		(async () => {
			const cover = await buildCover();
			const metadata = parsedBookToExportMeta(book);
			const res = await fetch("/api/export", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					fingerprint,
					title: book.title,
					metadata,
					...(cover ? { cover } : {}),
				}),
			});
			if (!res.ok) {
				const data = (await res.json().catch(() => null)) as {
					error?: string;
				} | null;
				throw new Error(data?.error ?? `Export failed: ${res.status}`);
			}
			const data = (await res.json()) as { jobId?: string };
			if (!data.jobId) throw new Error("Export failed to start");
			return data.jobId;
		})()
			.then((jobId) => pollExport(jobId))
			.catch((e: unknown) => {
				exportJobRef.current = null;
				setError(e instanceof Error ? e.message : "Export failed");
				setExporting(false);
			});
	}, [book, fingerprint, exporting, stopExportPolling, setError]);

	return { exporting, exportProgress, exportPhase, exportM4b, resetExport };
}
