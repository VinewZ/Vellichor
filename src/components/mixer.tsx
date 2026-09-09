import {
	LoaderCircle,
	Pause,
	Play,
	RotateCcw,
	Square,
	Trash2,
} from "lucide-react";
import { memo } from "react";
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
		<div className="flex flex-col gap-2 p-3 bg-surface border-2 border-outline [content-visibility:auto] [contain-intrinsic-size:auto_64px]">
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
				<div className="flex-1 min-w-0">
					<div className="flex items-center justify-between gap-2">
						<span className="font-headline font-bold text-xs uppercase truncate">
							Ch {index + 1}: {title}
						</span>
						<span className="font-mono text-[11px] font-bold text-secondary shrink-0 uppercase flex items-center gap-1">
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
					<p className="text-[11px] text-on-surface-variant font-mono">
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
					<div className="w-full h-2 bg-surface-dim border border-outline">
						<div
							className="h-full bg-secondary transition-[width]"
							style={{ width: `${progress}%` }}
						/>
					</div>
					<div className="flex justify-between text-[10px] font-mono font-bold mt-1 text-on-surface-variant">
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

	return (
		<section className="bg-surface-bright border-2 border-outline p-6 shadow-section">
			<div className="flex items-center justify-between pb-3 border-b-2 border-outline mb-4">
				<h2 className="font-headline font-bold text-base uppercase tracking-tight">
					04. Output &amp; Chapter Tracks
				</h2>
				<span className="px-2 py-0.5 bg-surface-container text-on-surface text-[10px] font-mono font-bold uppercase border border-outline">
					{runIndices.length === 0
						? "Nothing rendered"
						: `${doneCount} of ${runIndices.length} rendered`}
				</span>
			</div>
			<SynthesisControls />
			<div className="flex items-center gap-3 mt-4 mb-2">
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
				<span className="text-[11px] font-mono text-on-surface-variant">
					{hint}
				</span>
			</div>
			{error ? (
				<p role="alert" className="text-xs font-mono text-red-600 mb-2">
					{error}
				</p>
			) : null}
			{selectedIndices.length > 0 && book ? (
				<div className="flex flex-col gap-2 mb-4 max-h-72 overflow-y-auto pr-1">
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
			) : null}
			<div className="flex items-center gap-3">
				<Button variant="neutral" disabled={!canExport} onClick={exportM4b}>
					{exporting ? "Exporting…" : "Export .M4B"}
				</Button>
				<Button variant="neutral" disabled={!canClear} onClick={clearRender}>
					<Trash2 />
					Clear
				</Button>
				<span className="text-[11px] font-mono text-on-surface-variant">
					{doneCount > 0
						? `${doneCount} chapter(s) with chapter marks`
						: "Generate chapters first"}
				</span>
			</div>
		</section>
	);
}
