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
import { buildSpeechRequest, useSynthesis } from "@/hooks/useSynthesis";
import {
	type ChapterJob,
	chunkText,
	createChapterJobs,
	type SynthesisSnapshot,
	voiceIdToLocale,
} from "@/lib/chapter-audio";

interface ChapterAudioContextValue {
	jobs: ChapterJob[];
	runIndices: number[];
	isGenerating: boolean;
	playingIndex: number | null;
	error: string | null;
	doneCount: number;
	generate: () => void;
	cancel: () => void;
	retry: (index: number) => void;
	togglePlay: (index: number) => void;
}

const ChapterAudioContext = createContext<ChapterAudioContextValue | null>(
	null,
);

function setJobStatus(
	prev: ChapterJob[],
	index: number,
	patch: Partial<ChapterJob>,
): ChapterJob[] {
	return prev.map((job, i) => (i === index ? { ...job, ...patch } : job));
}

async function postSpeech(body: unknown, signal: AbortSignal): Promise<Blob> {
	const res = await fetch("/api/speech", {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify(body),
		signal,
	});
	if (!res.ok) throw new Error(`Kokoro responded with status ${res.status}`);
	return res.blob();
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

	const abortRef = useRef<AbortController | null>(null);
	const generatingRef = useRef(false);
	const audioRef = useRef<HTMLAudioElement | null>(null);

	useEffect(() => {
		setJobs((prev) => {
			for (const job of prev) {
				if (job.audioUrl) URL.revokeObjectURL(job.audioUrl);
			}
			return [];
		});
		setRunIndices([]);
		setPlayingIndex(null);
		setError(null);
		audioRef.current?.pause();
		audioRef.current = null;
		if (book) setJobs(createChapterJobs(book.chapterCount));
	}, [book]);

	useEffect(() => {
		return () => {
			abortRef.current?.abort();
			audioRef.current?.pause();
			setJobs((prev) => {
				for (const job of prev) {
					if (job.audioUrl) URL.revokeObjectURL(job.audioUrl);
				}
				return prev;
			});
		};
	}, []);

	const renderChapter = useCallback(
		async (
			index: number,
			text: string,
			snapshot: SynthesisSnapshot,
			locale: string,
			signal: AbortSignal,
		): Promise<string> => {
			const chunks = chunkText(text, locale);
			setJobs((prev) => setJobStatus(prev, index, { chunks, doneChunks: 0 }));
			const blobs: Blob[] = [];
			for (const input of chunks) {
				blobs.push(
					await postSpeech(buildSpeechRequest(snapshot, input), signal),
				);
				setJobs((prev) =>
					setJobStatus(prev, index, {
						doneChunks: (prev[index]?.doneChunks ?? 0) + 1,
					}),
				);
			}
			return URL.createObjectURL(
				new Blob(blobs, { type: blobs[0]?.type ?? "audio/mpeg" }),
			);
		},
		[],
	);

	const generate = useCallback(() => {
		if (generatingRef.current || !book) return;
		if (voice === "") {
			setError("Choose a voice before generating.");
			return;
		}
		const indices = [...selected].sort((a, b) => a - b);
		if (indices.length === 0) {
			setError("Select at least one chapter in Chapter Scope.");
			return;
		}
		setError(null);
		setRunIndices(indices);
		setJobs((prev) =>
			prev.map((job, i) =>
				indices.includes(i)
					? { ...job, status: "queued" as const, error: undefined }
					: job,
			),
		);

		const snapshot: SynthesisSnapshot = { model, voice, speed, volume, format };
		const locale = voiceIdToLocale(voice);
		const controller = new AbortController();
		abortRef.current = controller;
		generatingRef.current = true;
		setIsGenerating(true);

		(async () => {
			for (const index of indices) {
				if (controller.signal.aborted) break;
				const chapter = book.chapters[index];
				if (!chapter) continue;
				setJobs((prev) =>
					setJobStatus(prev, index, { status: "rendering", error: undefined }),
				);
				try {
					const audioUrl = await renderChapter(
						index,
						chapter.text,
						snapshot,
						locale,
						controller.signal,
					);
					setJobs((prev) => {
						const old = prev[index]?.audioUrl;
						if (old) URL.revokeObjectURL(old);
						return setJobStatus(prev, index, { status: "done", audioUrl });
					});
				} catch (e) {
					if (controller.signal.aborted) break;
					setJobs((prev) =>
						setJobStatus(prev, index, {
							status: "error",
							error: e instanceof Error ? e.message : "Render failed",
						}),
					);
				}
			}
			if (controller.signal.aborted) {
				setJobs((prev) =>
					prev.map((job) =>
						job.status === "queued" || job.status === "rendering"
							? { ...job, status: "idle" as const }
							: job,
					),
				);
			}
			generatingRef.current = false;
			setIsGenerating(false);
		})();
	}, [book, selected, model, voice, speed, volume, format, renderChapter]);

	const cancel = useCallback(() => {
		abortRef.current?.abort();
	}, []);

	const retry = useCallback(
		(index: number) => {
			if (generatingRef.current || !book) return;
			const chapter = book.chapters[index];
			if (!chapter) return;
			if (voice === "") {
				setError("Choose a voice before generating.");
				return;
			}
			setError(null);
			setRunIndices((prev) => (prev.includes(index) ? prev : [...prev, index]));
			setJobs((prev) =>
				setJobStatus(prev, index, { status: "rendering", error: undefined }),
			);
			const snapshot: SynthesisSnapshot = {
				model,
				voice,
				speed,
				volume,
				format,
			};
			const controller = new AbortController();
			const locale = voiceIdToLocale(voice);
			renderChapter(
				index,
				chapter.text,
				snapshot,
				locale,
				controller.signal,
			).then(
				(audioUrl) => {
					setJobs((prev) => {
						const old = prev[index]?.audioUrl;
						if (old) URL.revokeObjectURL(old);
						return setJobStatus(prev, index, { status: "done", audioUrl });
					});
				},
				(e: unknown) => {
					setJobs((prev) =>
						setJobStatus(prev, index, {
							status: "error",
							error: e instanceof Error ? e.message : "Render failed",
						}),
					);
				},
			);
		},
		[book, model, voice, speed, volume, format, renderChapter],
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

	const doneCount = useMemo(
		() => runIndices.filter((i) => jobs[i]?.status === "done").length,
		[runIndices, jobs],
	);

	const value = useMemo(
		() => ({
			jobs,
			runIndices,
			isGenerating,
			playingIndex,
			error,
			doneCount,
			generate,
			cancel,
			retry,
			togglePlay,
		}),
		[
			jobs,
			runIndices,
			isGenerating,
			playingIndex,
			error,
			doneCount,
			generate,
			cancel,
			retry,
			togglePlay,
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
