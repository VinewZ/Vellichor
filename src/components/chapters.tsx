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
			className="flex w-full items-center gap-3 p-3 bg-surface border-2 border-outline hover:bg-surface-container cursor-pointer transition-colors text-left [content-visibility:auto] [contain-intrinsic-size:auto_72px]"
		>
			<Checkbox
				checked={checked}
				onClick={(e) => e.stopPropagation()}
				onCheckedChange={() => onToggle(index)}
			/>
			<div className="flex-1 min-w-0">
				<div className="flex items-center justify-between gap-2">
					<span className="font-headline font-bold text-xs uppercase truncate">
						Ch {index + 1}: {chapter.title}
					</span>
					<span className="font-mono text-[11px] font-bold text-secondary shrink-0 uppercase">
						{label}
					</span>
				</div>
				<p className="text-[11px] text-on-surface-variant font-mono">
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
		<section className="bg-surface-bright border-2 border-outline p-6 shadow-section">
			<div className="flex items-center justify-between pb-4 border-b-2 border-outline mb-4">
				<h2 className="font-headline font-bold text-lg uppercase tracking-tight">
					02. Chapter Scope
				</h2>
				<span className="text-xs font-mono font-bold text-secondary">
					{selectedCount} of {totalCount} SELECTED
				</span>
			</div>
			<div className="flex items-center justify-between gap-2 pb-3 mb-3 border-b border-outline/30 text-xs font-headline font-bold uppercase">
				<div className="flex items-center gap-2">
					<Button disabled={!book} onClick={selectAll}>
						Select All
					</Button>
					<span>•</span>
					<Button disabled={!book} onClick={deselectAll}>
						Deselect All
					</Button>
				</div>
				<span className="text-[10px] font-mono text-on-surface-variant font-normal uppercase">
					EST. TOTAL: {totalLabel}
				</span>
			</div>
			<div className="flex flex-col gap-2.5 max-h-118 overflow-y-auto pr-1">
				{isParsing ? (
					[0, 1, 2, 3].map((i) => (
						<div
							key={i}
							className="h-18 border-2 border-outline bg-surface-container animate-pulse"
						/>
					))
				) : !book || book.chapters.length === 0 ? (
					<div className="border-2 border-dashed border-outline p-6 text-center">
						<p className="font-headline font-bold text-sm uppercase">
							No chapters yet
						</p>
						<p className="text-[11px] font-mono text-on-surface-variant mt-1">
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
