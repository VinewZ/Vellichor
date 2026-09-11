import {
	LoaderCircle,
	Pause,
	Play,
	RotateCcw,
	Square,
	Trash2,
} from "lucide-react";
import { memo, useMemo } from "react";
import { useBook } from "@/hooks/useBook";
import { useChapterAudio } from "@/hooks/useChapterAudio";
import { useChapterSelection } from "@/hooks/useChapterSelection";
import { useSynthesis } from "@/hooks/useSynthesis";
import type { ChapterJobStatus } from "@/lib/chapter-audio";
import { SynthesisControls } from "./synthesis-controls";
import { Button } from "./ui/button";

interface TrackRowProps {
	index: number;
	title: string;
	wordCount: number;
	status: ChapterJobStatus;
	doneChunks: number;
	totalChunks: number;
	statusError?: string;
	isPlaying: boolean;
	isGenerating: boolean;
	onPlay: (index: number) => void;
	onRetry: (index: number) => void;
}

const TrackRow = memo(function TrackRow({
	index,
	title,
	wordCount,
	status,
	doneChunks,
	totalChunks,
	statusError,
	isPlaying,
	isGenerating,
	onPlay,
	onRetry,
}: TrackRowProps) {
	const progress =
		totalChunks > 0 ? Math.round((doneChunks / totalChunks) * 100) : 0;
	const showProgress = status === "queued" || status === "rendering";
	return (
		<div className="flex flex-col gap-2 border-2 border-outline p-3 [contain-intrinsic-size:auto_64px] [content-visibility:auto]">
			<div className="flex items-center gap-3">
				<Button
					size="sm"
					variant="neutral"
					disabled={status !== "done"}
					onClick={() => onPlay(index)}
					aria-label={
						isPlaying
							? `Pause chapter ${index + 1}`
							: `Play chapter ${index + 1}`
					}
				>
					{isPlaying ? <Pause /> : <Play />}
				</Button>
				<div className="min-w-0 flex-1">
					<div className="flex min-w-0 items-center justify-between gap-2">
						<span
							className="min-w-0 flex-1 truncate font-bold font-headline text-xs uppercase"
							title={`Ch ${index + 1}: ${title}`}
						>
							Ch {index + 1}: {title}
						</span>
						<span className="flex shrink-0 items-center gap-1 font-bold font-mono text-[11px] text-secondary uppercase">
							{status === "rendering" ? (
								<LoaderCircle className="size-3 animate-spin" />
							) : null}
							{status === "idle"
								? "Pending"
								: status === "queued"
									? "Queued"
									: status === "rendering"
										? "Rendering"
										: status === "done"
											? "Done"
											: "Failed"}
						</span>
					</div>
					<p
						className="truncate font-mono text-[11px] text-on-surface-variant"
						title={
							status === "error" && statusError
								? `${wordCount} words • ${statusError}`
								: `${wordCount} words`
						}
					>
						{wordCount} words
						{status === "error" && statusError ? ` • ${statusError}` : ""}
					</p>
				</div>
				{status === "error" ? (
					<Button
						size="sm"
						variant="neutral"
						disabled={isGenerating}
						onClick={() => onRetry(index)}
					>
						<RotateCcw />
						Retry
					</Button>
				) : null}
			</div>
			{showProgress ? (
				<div>
					<div className="h-2 w-full border border-outline">
						<div
							className="h-full transition-[width]"
							style={{ width: `${progress}%` }}
						/>
					</div>
					<div className="mt-1 flex justify-between font-bold font-mono text-[10px] text-on-surface-variant">
						<span className="text-secondary">{progress}%</span>
						<span>
							{doneChunks}/{totalChunks} chunks
						</span>
					</div>
				</div>
			) : null}
		</div>
	);
});

export function Mixer() {
	const { book } = useBook();
	const { selected } = useChapterSelection();
	const { voice } = useSynthesis();
	const {
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
	} = useChapterAudio();

	const mixerState = useMemo(() => {
		const selectedIndices = [...selected].sort((a, b) => a - b);
		const canGenerate =
			!!book && selectedIndices.length > 0 && voice !== "" && !isGenerating;
		const hint = !book
			? "Upload a book to begin"
			: selectedIndices.length === 0
				? "Select chapters in Chapter Scope"
				: voice === ""
					? "Choose a voice in step 03"
					: isGenerating
						? `Rendering… ${doneCount} of ${runIndices.length} done`
						: `Ready — ${selectedIndices.length} chapter(s) selected`;
		const canExport = !!book && doneCount > 0 && !isGenerating && !exporting;
		const canClear = !!book && !isGenerating && runIndices.length > 0;
		return { selectedIndices, canGenerate, hint, canExport, canClear };
	}, [book, selected, voice, isGenerating, doneCount, runIndices, exporting]);
	const { selectedIndices, canGenerate, hint, canExport, canClear } =
		mixerState;

	return (
		<section className="min-w-0 overflow-x-hidden border-2 border-outline bg-background p-6 shadow-section">
			<div className="mb-4 flex items-center justify-between border-outline border-b-2 pb-3">
				<h2 className="font-bold font-headline text-base uppercase tracking-tight">
					04. Output &amp; Chapter Tracks
				</h2>
				<span className="border border-outline px-2 py-0.5 font-bold font-mono text-[10px] uppercase">
					{runIndices.length === 0
						? "Nothing rendered"
						: `${doneCount} of ${runIndices.length} rendered`}
				</span>
			</div>
			<SynthesisControls />
			<div className="mt-4 mb-2 flex items-center gap-3">
				{isGenerating ? (
					<Button variant="neutral" onClick={cancel}>
						<Square />
						Cancel
					</Button>
				) : (
					<Button disabled={!canGenerate} onClick={generate}>
						Generate
					</Button>
				)}
				<span className="font-mono text-[11px] text-on-surface-variant">
					{hint}
				</span>
			</div>
			{error ? (
				<p role="alert" className="mb-2 font-mono text-red-600 text-xs">
					{error}
				</p>
			) : null}
			<div></div>
			{selectedIndices.length > 0 && book ? (
				<div className="mb-4 flex max-h-72 min-w-0 flex-col gap-2 overflow-y-auto overflow-x-hidden pr-1">
					{selectedIndices.map((index) => (
						<TrackRow
							key={book.chapters[index]?.href ?? index}
							index={index}
							title={book.chapters[index]?.title ?? `Chapter ${index + 1}`}
							wordCount={book.chapters[index]?.wordCount ?? 0}
							status={jobs[index]?.status ?? "idle"}
							doneChunks={jobs[index]?.doneChunks ?? 0}
							totalChunks={jobs[index]?.totalChunks ?? 0}
							statusError={jobs[index]?.error}
							isPlaying={playingIndex === index}
							isGenerating={isGenerating}
							onPlay={togglePlay}
							onRetry={retry}
						/>
					))}
				</div>
			) : (
				<div className="my-8 border-2 border-outline border-dashed p-6 text-center">
					<p className="font-bold font-headline text-sm uppercase">
						No chapters yet
					</p>
					<p className="mt-1 font-mono text-[11px] text-on-surface-variant">
						Upload a .PDF or .EPUB to list its chapters here.
					</p>
				</div>
			)}
			<div className="flex items-center gap-3">
				<Button variant="neutral" disabled={!canExport} onClick={exportM4b}>
					{exporting ? "Exporting…" : "Export .M4B"}
				</Button>
				<Button variant="neutral" disabled={!canClear} onClick={clearRender}>
					<Trash2 />
					Clear
				</Button>
				<span className="font-mono text-[11px] text-on-surface-variant">
					{doneCount > 0
						? `${doneCount} chapter(s) with chapter marks`
						: "Generate chapters first"}
				</span>
			</div>
		</section>
	);
}
