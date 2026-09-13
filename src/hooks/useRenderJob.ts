import { useCallback, useEffect, useRef, useState } from "react";
import type { ParsedBook } from "@/lib/book";
import { bookFingerprint } from "@/lib/book";
import { type ChapterJob, createChapterJobs } from "@/lib/chapter-audio";
import type { SynthesisSnapshot } from "@/lib/synthesis";

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

const POLL_BASE_MS = 1000;
const POLL_MAX_MS = 4000;
const POLL_STALL_TICKS = 3;

function fileUrl(fingerprint: string, index: number): string {
	return `/api/files?fingerprint=${encodeURIComponent(fingerprint)}&chapter=${index}`;
}

interface UseRenderJobParams {
	book: ParsedBook | null;
	fingerprint: string | null;
	selected: Set<number>;
	synthesis: SynthesisSnapshot;
	setError: (error: string | null) => void;
}

export function useRenderJob({
	book,
	fingerprint,
	selected,
	synthesis,
	setError,
}: UseRenderJobParams) {
	const [jobs, setJobs] = useState<ChapterJob[]>([]);
	const [runIndices, setRunIndices] = useState<number[]>([]);
	const [isGenerating, setIsGenerating] = useState(false);

	const pollRef = useRef<number | null>(null);
	const jobIdRef = useRef<string | null>(null);
	const pollTickRef = useRef<(() => void) | null>(null);
	const pollInflightRef = useRef(false);
	const pollDelayRef = useRef(POLL_BASE_MS);
	const pollStallRef = useRef(0);
	const pollLastDoneRef = useRef(0);

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
		setError(null);
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
	}, [book, stopPolling, setError]);

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
		[applySnapshot, stopPolling, setError],
	);

	const startChapters = useCallback(
		(indices: number[]) => {
			if (!book || !fingerprint) return;
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
					voice: synthesis.voice,
					synthesis,
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
		[book, fingerprint, synthesis, pollJob, setError],
	);

	const generate = useCallback(() => {
		if (jobIdRef.current || !book) return;
		if (synthesis.voice === "") {
			setError("Choose a voice before generating.");
			return;
		}
		const indices = [...selected].sort((a, b) => a - b);
		if (indices.length === 0) {
			setError("Select at least one chapter in Chapter Scope.");
			return;
		}
		startChapters(indices);
	}, [book, selected, synthesis.voice, startChapters, setError]);

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
	}, [book, fingerprint, setError]);

	const retry = useCallback(
		(index: number) => {
			if (jobIdRef.current || !book) return;
			if (synthesis.voice === "") {
				setError("Choose a voice before generating.");
				return;
			}
			startChapters([index]);
		},
		[book, synthesis.voice, startChapters, setError],
	);

	return {
		jobs,
		runIndices,
		isGenerating,
		generate,
		cancel,
		clearRender,
		retry,
	};
}
