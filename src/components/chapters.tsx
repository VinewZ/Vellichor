import { memo, useMemo } from "react";
import { useBook } from "@/hooks/useBook";
import { useChapterAudio } from "@/hooks/useChapterAudio";
import { useChapterSelection } from "@/hooks/useChapterSelection";
import { useSynthesis } from "@/hooks/useSynthesis";
import type { BookChapter } from "@/lib/book";
import { formatAudioETA, formatDuration } from "@/lib/book";
import { Button } from "./ui/button";
import { Checkbox } from "./ui/checkbox";

interface ChapterRowProps {
	index: number;
	chapter: BookChapter;
	checked: boolean;
	durationSec?: number;
	speed: number;
	onToggle: (index: number) => void;
}

const ChapterRow = memo(function ChapterRow({
	index,
	chapter,
	checked,
	durationSec,
	speed,
	onToggle,
}: ChapterRowProps) {
	const label =
		durationSec !== undefined
			? formatDuration(durationSec)
			: formatAudioETA(chapter.wordCount, undefined, speed);
	return (
		<button
			type="button"
			onClick={() => onToggle(index)}
			className="flex w-full cursor-pointer items-center gap-3 border-2 border-outline p-3 text-left transition-colors [contain-intrinsic-size:auto_72px] [content-visibility:auto] hover:bg-surface-container"
		>
			<Checkbox
				checked={checked}
				onClick={(e) => e.stopPropagation()}
				onCheckedChange={() => onToggle(index)}
			/>
			<div className="min-w-0 flex-1">
				<div className="flex min-w-0 items-center justify-between gap-2">
					<span
						className="min-w-0 flex-1 truncate font-bold font-headline text-xs uppercase"
						title={`Ch ${index + 1}: ${chapter.title}`}
					>
						Ch {index + 1}: {chapter.title}
					</span>
					<span className="shrink-0 font-bold font-mono text-[11px] text-secondary uppercase">
						{label}
					</span>
				</div>
				<p
					className="truncate font-mono text-[11px] text-on-surface-variant"
					title={
						chapter.href
							? `${chapter.wordCount} words • ${chapter.href}`
							: `${chapter.wordCount} words`
					}
				>
					{chapter.wordCount} words
					{chapter.href ? ` • ${chapter.href}` : ""}
				</p>
			</div>
		</button>
	);
});

export function Chapters() {
	const { book, isParsing } = useBook();
	const { speed } = useSynthesis();
	const { jobs } = useChapterAudio();
	const {
		isSelected,
		toggle,
		selectAll,
		deselectAll,
		selected,
		selectedCount,
		totalCount,
		selectedAudioETA,
	} = useChapterSelection();

	const totalLabel = useMemo(() => {
		if (!book || selected.size === 0) return selectedAudioETA;
		let actualSec = 0;
		let actualCount = 0;
		let remainingWords = 0;
		for (const index of selected) {
			const job = jobs[index];
			const chapter = book.chapters[index];
			if (
				job?.status === "done" &&
				typeof job.durationSec === "number" &&
				Number.isFinite(job.durationSec)
			) {
				actualSec += job.durationSec;
				actualCount += 1;
			} else {
				remainingWords += chapter?.wordCount ?? 0;
			}
		}
		if (actualCount === 0) return selectedAudioETA;
		if (remainingWords === 0) return `${formatDuration(actualSec)} ACTUAL`;
		return `${formatDuration(actualSec)} + ~${formatAudioETA(remainingWords, undefined, speed)} EST`;
	}, [book, jobs, selected, selectedAudioETA, speed]);

	return (
		<section className="max-h-112 min-w-0 overflow-x-hidden border-2 border-outline bg-background p-6 shadow-section">
			<div className="mb-4 flex items-center justify-between border-outline border-b-2 pb-4">
				<h2 className="font-bold font-headline text-lg uppercase tracking-tight">
					02. Chapter Scope
				</h2>
				<span className="font-bold font-mono text-secondary text-xs">
					{selectedCount} of {totalCount} SELECTED
				</span>
			</div>
			<div className="mb-3 flex flex-wrap items-center justify-between gap-2 border-outline/30 border-b pb-3 font-bold font-headline text-xs uppercase">
				<div className="flex min-w-0 flex-wrap items-center gap-2">
					<Button disabled={!book} onClick={selectAll}>
						Select All
					</Button>
					<span>•</span>
					<Button disabled={!book} onClick={deselectAll}>
						Deselect All
					</Button>
				</div>
				<span className="wrap-break-word min-w-0 text-right font-mono font-normal text-[10px] text-on-surface-variant uppercase">
					EST. TOTAL: {totalLabel}
				</span>
			</div>
			<div className="flex max-h-68 min-w-0 flex-col gap-2.5 overflow-y-auto overflow-x-hidden pr-1">
				{isParsing ? (
					[0, 1, 2, 3].map((i) => (
						<div
							key={i}
							className="h-18 animate-pulse border-2 border-outline"
						/>
					))
				) : !book || book.chapters.length === 0 ? (
					<div className="border-2 border-outline border-dashed p-6 text-center">
						<p className="font-bold font-headline text-sm uppercase">
							No chapters yet
						</p>
						<p className="mt-1 font-mono text-[11px] text-on-surface-variant">
							Upload a .PDF or .EPUB to list its chapters here.
						</p>
					</div>
				) : (
					book.chapters.map((chapter, index) => (
						<ChapterRow
							key={chapter.href ?? index}
							index={index}
							chapter={chapter}
							checked={isSelected(index)}
							durationSec={jobs[index]?.durationSec}
							speed={speed}
							onToggle={toggle}
						/>
					))
				)}
			</div>
		</section>
	);
}
