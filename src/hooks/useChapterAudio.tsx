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
	durationSec?: number;
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

const POLL_BASE_MS = 1000;
const POLL_MAX_MS = 4000;
const POLL_STALL_TICKS = 3;

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
	const pollTickRef = useRef<(() => void) | null>(null);
	const pollInflightRef = useRef(false);
	const pollDelayRef = useRef(POLL_BASE_MS);
	const pollStallRef = useRef(0);
	const pollLastDoneRef = useRef(0);
	const audioRef = useRef<HTMLAudioElement | null>(null);

	const stopPolling = useCallback(() => {
		if (pollRef.current !== null) {
			window.clearTimeout(pollRef.current);
			pollRef.current = null;
		}
		jobIdRef.current = null;
		pollTickRef.current = null;
		pollInflightRef.current = false;
		pollDelayRef.current = POLL_BASE_MS;
		pollStallRef.current = 0;
		pollLastDoneRef.current = 0;
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
										durationSec: entry.durationSec,
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

	// Returning to a hidden-then-visible tab refreshes state immediately
	// instead of waiting out the paused poll cadence.
	useEffect(() => {
		const onVisibilityChange = () => {
			if (document.visibilityState !== "visible") return;
			if (!jobIdRef.current || !pollTickRef.current) return;
			if (pollRef.current !== null) window.clearTimeout(pollRef.current);
			pollRef.current = null;
			pollTickRef.current();
		};
		document.addEventListener("visibilitychange", onVisibilityChange);
		return () =>
			document.removeEventListener("visibilitychange", onVisibilityChange);
	}, []);

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
						durationSec: entry.durationSec ?? job.durationSec,
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
			const schedule = (delay: number) => {
				if (pollRef.current !== null) window.clearTimeout(pollRef.current);
				pollRef.current = window.setTimeout(tick, delay);
			};
			const tick = () => {
				pollRef.current = null;
				if (jobIdRef.current !== jobId) return;
				// Hidden tab: no network, re-check on the base cadence.
				if (document.hidden) {
					schedule(POLL_BASE_MS);
					return;
				}
				// Slow response still in flight: skip this tick, don't stack.
				if (pollInflightRef.current) {
					schedule(pollDelayRef.current);
					return;
				}
				pollInflightRef.current = true;
				fetch(`/api/render?id=${encodeURIComponent(jobId)}`)
					.then((res) => {
						if (!res.ok) throw new Error(`Render status failed: ${res.status}`);
						return res.json() as Promise<JobSnapshot>;
					})
					.then((snap) => {
						const done = snap.chapters.reduce((n, c) => n + c.doneChunks, 0);
						if (done > pollLastDoneRef.current) {
							pollLastDoneRef.current = done;
							pollStallRef.current = 0;
							pollDelayRef.current = POLL_BASE_MS;
						} else {
							pollStallRef.current += 1;
							pollDelayRef.current = Math.min(
								POLL_MAX_MS,
								POLL_BASE_MS *
									2 ** Math.floor(pollStallRef.current / POLL_STALL_TICKS),
							);
						}
						applySnapshot(snap, fp);
						// applySnapshot stops polling once the job leaves "rendering".
						if (jobIdRef.current === jobId) schedule(pollDelayRef.current);
					})
					.catch((e: unknown) => {
						setError(e instanceof Error ? e.message : "Render status failed");
						stopPolling();
					})
					.finally(() => {
						pollInflightRef.current = false;
					});
			};
			pollTickRef.current = tick;
			tick();
		},
		[applySnapshot, stopPolling],
	);

	const startChapters = useCallback(
		(indices: number[]) => {
			if (!book || !fingerprint) return;
			const snapshot = { model, voice, speed, volume, format };
			setError(null);
			const indexSet = new Set(indices);
			setJobs((prev) =>
				prev.map((job, i) =>
					indexSet.has(i)
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
						durationSec: undefined,
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
