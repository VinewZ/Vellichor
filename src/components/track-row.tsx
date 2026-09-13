import { LoaderCircle, Pause, Play, RotateCcw } from "lucide-react";
import { memo } from "react";
import type { ChapterJobStatus } from "@/lib/chapter-audio";
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

export const TrackRow = memo(function TrackRow({
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
