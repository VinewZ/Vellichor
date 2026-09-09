import { memo } from "react";
import { useBook } from "@/hooks/useBook";
import { useChapterSelection } from "@/hooks/useChapterSelection";
import type { BookChapter } from "@/lib/book";
import { formatAudioETA } from "@/lib/book";
import { Button } from "./ui/button";
import { Checkbox } from "./ui/checkbox";

interface ChapterRowProps {
	index: number;
	chapter: BookChapter;
	checked: boolean;
	onToggle: (index: number) => void;
}

const ChapterRow = memo(function ChapterRow({
	index,
	chapter,
	checked,
	onToggle,
}: ChapterRowProps) {
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
						{formatAudioETA(chapter.wordCount)}
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
	const {
		isSelected,
		toggle,
		selectAll,
		deselectAll,
		selectedCount,
		totalCount,
		selectedAudioETA,
	} = useChapterSelection();

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
					EST. TOTAL: {selectedAudioETA}
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
							onToggle={toggle}
						/>
					))
				)}
			</div>
		</section>
	);
}
