import {
	createContext,
	useCallback,
	useContext,
	useEffect,
	useMemo,
	useState,
} from "react";
import { useBook } from "@/hooks/useBook";
import { useChapterPlayback } from "@/hooks/useChapterPlayback";
import { useChapterSelection } from "@/hooks/useChapterSelection";
import { useExportJob } from "@/hooks/useExportJob";
import { useRenderJob } from "@/hooks/useRenderJob";
import { useSynthesis } from "@/hooks/useSynthesis";
import { bookFingerprint } from "@/lib/book";
import type { ChapterJob } from "@/lib/chapter-audio";

interface ChapterAudioContextValue {
	jobs: ChapterJob[];
	runIndices: number[];
	isGenerating: boolean;
	playingIndex: number | null;
	error: string | null;
	doneCount: number;
	exporting: boolean;
	exportProgress: number;
	exportPhase: string;
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

export function ChapterAudioProvider({
	children,
}: {
	children: React.ReactNode;
}) {
	const { book } = useBook();
	const { selected } = useChapterSelection();
	const { model, voice, speed, volume, format } = useSynthesis();

	const [error, setError] = useState<string | null>(null);

	const fingerprint = useMemo(
		() => (book ? bookFingerprint(book) : null),
		[book],
	);
	const synthesis = useMemo(
		() => ({ model, voice, speed, volume, format }),
		[model, voice, speed, volume, format],
	);

	const render = useRenderJob({
		book,
		fingerprint,
		selected,
		synthesis,
		setError,
	});
	const exp = useExportJob({ book, fingerprint, setError });
	const playback = useChapterPlayback(render.jobs);

	// biome-ignore lint/correctness/useExhaustiveDependencies: re-run on book change by design
	useEffect(() => {
		playback.resetPlayback();
		exp.resetExport();
		setError(null);
	}, [book, playback.resetPlayback, exp.resetExport]);

	const clearRender = useCallback(() => {
		if (!book || !fingerprint || render.isGenerating) return;
		playback.resetPlayback();
		render.clearRender();
	}, [book, fingerprint, render, playback]);

	const doneCount = useMemo(
		() => render.jobs.filter((j) => j.status === "done").length,
		[render.jobs],
	);

	const value = useMemo(
		() => ({
			jobs: render.jobs,
			runIndices: render.runIndices,
			isGenerating: render.isGenerating,
			playingIndex: playback.playingIndex,
			error,
			doneCount,
			exporting: exp.exporting,
			exportProgress: exp.exportProgress,
			exportPhase: exp.exportPhase,
			generate: render.generate,
			cancel: render.cancel,
			clearRender,
			retry: render.retry,
			togglePlay: playback.togglePlay,
			exportM4b: exp.exportM4b,
		}),
		[render, playback, exp, error, doneCount, clearRender],
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
