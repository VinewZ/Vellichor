import { LoaderCircle, Square, Trash2 } from "lucide-react";
import { useBook } from "@/hooks/useBook";
import { useChapterAudio } from "@/hooks/useChapterAudio";
import { useChapterSelection } from "@/hooks/useChapterSelection";
import { useMixerState } from "@/hooks/useMixerState";
import { useSynthesis } from "@/hooks/useSynthesis";
import { SynthesisControls } from "./synthesis-controls";
import { TrackRow } from "./track-row";
import { Button } from "./ui/button";

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
		exportProgress,
		exportPhase,
		generate,
		cancel,
		clearRender,
		retry,
		togglePlay,
		exportM4b,
	} = useChapterAudio();

	const { selectedIndices, canGenerate, hint, canExport, canClear } =
		useMixerState({
			book,
			selected,
			voice,
			isGenerating,
			doneCount,
			runIndices,
			exporting,
		});

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
					{exporting ? (
						<>
							<LoaderCircle className="size-4 animate-spin" />
							Exporting {exportProgress}%…
						</>
					) : (
						"Export .M4B"
					)}
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
			{doneCount > 0 ? (
				<p className="mt-2 font-mono text-[11px] text-on-surface-variant">
					Note: M4B export re-encodes the full book and can take a few minutes
					for long books — keep this tab open until the download starts.
				</p>
			) : null}
			{exporting ? (
				<div className="mt-3">
					<div
						className="h-2 w-full border border-outline"
						role="progressbar"
						aria-valuemin={0}
						aria-valuemax={100}
						aria-valuenow={exportProgress}
						aria-label="M4B export progress"
					>
						<div
							className="h-full transition-[width]"
							style={{ width: `${exportProgress}%` }}
						/>
					</div>
					<div className="mt-1 flex justify-between font-bold font-mono text-[10px] text-on-surface-variant">
						<span className="text-secondary">{exportProgress}%</span>
						<span>{exportPhase || "Exporting…"}</span>
					</div>
				</div>
			) : null}
		</section>
	);
}
