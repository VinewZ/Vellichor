import {
	createContext,
	useCallback,
	useContext,
	useEffect,
	useMemo,
	useRef,
	useState,
} from "react";
import { useBook } from "@/hooks/useBook";
import { useChapterSelection } from "@/hooks/useChapterSelection";
import { useSynthesis } from "@/hooks/useSynthesis";
import {
	bookFingerprint,
	isAttachableCoverMime,
	parsedBookToExportMeta,
} from "@/lib/book";
import { type ChapterJob, createChapterJobs } from "@/lib/chapter-audio";

interface ServerChapterSnapshot {
	index: number;
	status: ChapterJob["status"];
	totalChunks: number;
	doneChunks: number;
	error?: string;
}

interface JobSnapshot {
	jobId: string;
	status: string;
	fingerprint: string;
	chapters: ServerChapterSnapshot[];
}

interface ChapterAudioContextValue {
	jobs: ChapterJob[];
	runIndices: number[];
	isGenerating: boolean;
	playingIndex: number | null;
	error: string | null;
	doneCount: number;
	exporting: boolean;
	generate: () => void;
	cancel: () => void;
	clearRender: () => void;
	retry: (index: number) => void;
	togglePlay: (index: number) => void;
	exportM4b: () => void;
}

const ChapterAudioContext = createContext<ChapterAudioContextValue | null>(
	null,
);

function fileUrl(fingerprint: string, index: number): string {
	return `/api/files?fingerprint=${encodeURIComponent(fingerprint)}&chapter=${index}`;
}

export function ChapterAudioProvider({
	children,
}: {
	children: React.ReactNode;
}) {
	const { book } = useBook();
	const { selected } = useChapterSelection();
	const { model, voice, speed, volume, format } = useSynthesis();

	const [jobs, setJobs] = useState<ChapterJob[]>([]);
	const [runIndices, setRunIndices] = useState<number[]>([]);
	const [isGenerating, setIsGenerating] = useState(false);
	const [playingIndex, setPlayingIndex] = useState<number | null>(null);
	const [error, setError] = useState<string | null>(null);
	const [exporting, setExporting] = useState(false);

	const fingerprint = useMemo(
		() => (book ? bookFingerprint(book) : null),
		[book],
	);
	const pollRef = useRef<number | null>(null);
	const jobIdRef = useRef<string | null>(null);
	const audioRef = useRef<HTMLAudioElement | null>(null);

	const stopPolling = useCallback(() => {
		if (pollRef.current !== null) {
			window.clearInterval(pollRef.current);
			pollRef.current = null;
		}
		jobIdRef.current = null;
		setIsGenerating(false);
	}, []);

	useEffect(() => {
		stopPolling();
		setRunIndices([]);
		setPlayingIndex(null);
		setError(null);
		audioRef.current?.pause();
		audioRef.current = null;
		if (!book) {
			setJobs([]);
			return;
		}
		setJobs(createChapterJobs(book.chapterCount));
		const fp = bookFingerprint(book);
		fetch(`/api/render?fingerprint=${encodeURIComponent(fp)}`)
			.then((res) => (res.ok ? res.json() : null))
			.then(
				(
					data: { exists?: boolean; chapters?: ServerChapterSnapshot[] } | null,
				) => {
					if (!data?.exists) return;
					const done = (data.chapters ?? []).filter((c) => c.status === "done");
					if (done.length === 0) return;
					setJobs((prev) =>
						prev.map((job) => {
							const entry = done.find((c) => c.index === job.chapterIndex);
							return entry
								? {
										...job,
										status: "done" as const,
										totalChunks: entry.totalChunks,
										doneChunks: entry.totalChunks,
										audioUrl: fileUrl(fp, job.chapterIndex),
									}
								: job;
						}),
					);
					setRunIndices(done.map((c) => c.index));
				},
			)
			.catch(() => {});
		return stopPolling;
	}, [book, stopPolling]);

	useEffect(() => stopPolling, [stopPolling]);

	const applySnapshot = useCallback(
		(snap: JobSnapshot, fp: string) => {
			setJobs((prev) =>
				prev.map((job) => {
					const entry = snap.chapters.find((c) => c.index === job.chapterIndex);
					if (!entry) return job;
					return {
						...job,
						status: entry.status,
						totalChunks: entry.totalChunks,
						doneChunks: entry.doneChunks,
						error: entry.error,
						audioUrl:
							entry.status === "done"
								? fileUrl(fp, job.chapterIndex)
								: job.audioUrl,
					};
				}),
			);
			setRunIndices(snap.chapters.map((c) => c.index));
			if (snap.status !== "rendering") stopPolling();
		},
		[stopPolling],
	);

	const pollJob = useCallback(
		(jobId: string, fp: string) => {
			stopPolling();
			jobIdRef.current = jobId;
			setIsGenerating(true);
			const tick = () => {
				fetch(`/api/render?id=${encodeURIComponent(jobId)}`)
					.then((res) => {
						if (!res.ok) throw new Error(`Render status failed: ${res.status}`);
						return res.json() as Promise<JobSnapshot>;
					})
					.then((snap) => applySnapshot(snap, fp))
					.catch((e: unknown) => {
						setError(e instanceof Error ? e.message : "Render status failed");
						stopPolling();
					});
			};
			tick();
			pollRef.current = window.setInterval(tick, 1000);
		},
		[applySnapshot, stopPolling],
	);

	const startChapters = useCallback(
		(indices: number[]) => {
			if (!book || !fingerprint) return;
			const snapshot = { model, voice, speed, volume, format };
			setError(null);
			setJobs((prev) =>
				prev.map((job, i) =>
					indices.includes(i)
						? {
								...job,
								status: "queued" as const,
								totalChunks: 0,
								doneChunks: 0,
								error: undefined,
							}
						: job,
				),
			);
			fetch("/api/render", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					fingerprint,
					fileName: book.title,
					voice,
					synthesis: snapshot,
					chapters: indices.map((index) => ({
						index,
						title: book.chapters[index]?.title ?? `Chapter ${index + 1}`,
						text: book.chapters[index]?.text ?? "",
						wordCount: book.chapters[index]?.wordCount ?? 0,
					})),
				}),
			})
				.then((res) => {
					if (!res.ok) {
						return res.json().then((data: { error?: string }) => {
							throw new Error(data.error ?? `Render failed: ${res.status}`);
						});
					}
					return res.json() as Promise<{ jobId: string }>;
				})
				.then(({ jobId }) => pollJob(jobId, fingerprint))
				.catch((e: unknown) => {
					setError(e instanceof Error ? e.message : "Could not start render");
					setIsGenerating(false);
				});
		},
		[book, fingerprint, model, voice, speed, volume, format, pollJob],
	);

	const generate = useCallback(() => {
		if (jobIdRef.current || !book) return;
		if (voice === "") {
			setError("Choose a voice before generating.");
			return;
		}
		const indices = [...selected].sort((a, b) => a - b);
		if (indices.length === 0) {
			setError("Select at least one chapter in Chapter Scope.");
			return;
		}
		startChapters(indices);
	}, [book, selected, voice, startChapters]);

	const cancel = useCallback(() => {
		const jobId = jobIdRef.current;
		stopPolling();
		setJobs((prev) =>
			prev.map((job) =>
				job.status === "queued" || job.status === "rendering"
					? { ...job, status: "idle" as const, totalChunks: 0, doneChunks: 0 }
					: job,
			),
		);
		if (jobId) {
			fetch(`/api/render?id=${encodeURIComponent(jobId)}`, {
				method: "DELETE",
			}).catch(() => {});
		}
	}, [stopPolling]);

	const clearRender = useCallback(() => {
		if (!book || !fingerprint || jobIdRef.current) return;
		setError(null);
		audioRef.current?.pause();
		audioRef.current = null;
		setPlayingIndex(null);
		fetch(`/api/render?fingerprint=${encodeURIComponent(fingerprint)}`, {
			method: "DELETE",
		})
			.then((res) => {
				if (!res.ok) throw new Error("Could not delete previous render");
				setJobs((prev) =>
					prev.map((job) => ({
						...job,
						status: "idle" as const,
						totalChunks: 0,
						doneChunks: 0,
						audioUrl: undefined,
						error: undefined,
					})),
				);
				setRunIndices([]);
			})
			.catch((e: unknown) => {
				setError(
					e instanceof Error ? e.message : "Could not delete previous render",
				);
			});
	}, [book, fingerprint]);

	const retry = useCallback(
		(index: number) => {
			if (jobIdRef.current || !book) return;
			if (voice === "") {
				setError("Choose a voice before generating.");
				return;
			}
			startChapters([index]);
		},
		[book, voice, startChapters],
	);

	const togglePlay = useCallback(
		(index: number) => {
			if (playingIndex === index) {
				audioRef.current?.pause();
				audioRef.current = null;
				setPlayingIndex(null);
				return;
			}
			const url = jobs[index]?.audioUrl;
			if (!url) return;
			audioRef.current?.pause();
			const audio = new Audio(url);
			audioRef.current = audio;
			setPlayingIndex(index);
			audio.onended = () => {
				audioRef.current = null;
				setPlayingIndex((cur) => (cur === index ? null : cur));
			};
			audio.play().catch(() => {
				audioRef.current = null;
				setPlayingIndex(null);
			});
		},
		[jobs, playingIndex],
	);

	const exportM4b = useCallback(() => {
		if (!book || !fingerprint || exporting) return;
		setExporting(true);
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
				const buf = await blob.arrayBuffer();
				const bytes = new Uint8Array(buf);
				let binary = "";
				const chunk = 0x8000;
				for (let i = 0; i < bytes.length; i += chunk) {
					binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
				}
				return {
					dataBase64: btoa(binary),
					mime: blob.type || (book.coverMime as string),
				};
			} catch {
				return undefined;
			}
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
			return res.blob();
		})()
			.then((blob) => {
				const url = URL.createObjectURL(blob);
				const a = document.createElement("a");
				a.href = url;
				a.download = `${book.title.replace(/[^A-Za-z0-9._-]+/g, " ").trim() || "book"}.m4b`;
				document.body.appendChild(a);
				a.click();
				a.remove();
				URL.revokeObjectURL(url);
			})
			.catch((e: unknown) => {
				setError(e instanceof Error ? e.message : "Export failed");
			})
			.finally(() => setExporting(false));
	}, [book, fingerprint, exporting]);

	const doneCount = useMemo(
		() => jobs.filter((j) => j.status === "done").length,
		[jobs],
	);

	const value = useMemo(
		() => ({
			jobs,
			runIndices,
			isGenerating,
			playingIndex,
			error,
			doneCount,
			exporting,
			generate,
			cancel,
			clearRender,
			retry,
			togglePlay,
			exportM4b,
		}),
		[
			jobs,
			runIndices,
			isGenerating,
			playingIndex,
			error,
			doneCount,
			exporting,
			generate,
			cancel,
			clearRender,
			retry,
			togglePlay,
			exportM4b,
		],
	);

	return (
		<ChapterAudioContext.Provider value={value}>
			{children}
		</ChapterAudioContext.Provider>
	);
}

export function useChapterAudio(): ChapterAudioContextValue {
	const ctx = useContext(ChapterAudioContext);
	if (!ctx)
		throw new Error(
			"useChapterAudio must be used within a ChapterAudioProvider",
		);
	return ctx;
}
