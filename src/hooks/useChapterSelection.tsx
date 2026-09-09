import {
	createContext,
	useCallback,
	useContext,
	useEffect,
	useMemo,
	useState,
} from "react";
import { useBook } from "@/hooks/useBook";
import { formatAudioETA } from "@/lib/book";

interface ChapterSelectionContextValue {
	selected: Set<number>;
	isSelected: (index: number) => boolean;
	toggle: (index: number) => void;
	selectAll: () => void;
	deselectAll: () => void;
	selectedCount: number;
	totalCount: number;
	selectedWordCount: number;
	selectedAudioETA: string;
}

const ChapterSelectionContext =
	createContext<ChapterSelectionContextValue | null>(null);

export function ChapterSelectionProvider({
	children,
}: {
	children: React.ReactNode;
}) {
	const { book } = useBook();
	const [selected, setSelected] = useState<Set<number>>(new Set());

	useEffect(() => {
		setSelected(
			book ? new Set(book.chapters.map((_, index) => index)) : new Set(),
		);
	}, [book]);

	const isSelected = useCallback(
		(index: number) => selected.has(index),
		[selected],
	);

	const toggle = useCallback((index: number) => {
		setSelected((prev) => {
			const next = new Set(prev);
			if (next.has(index)) {
				next.delete(index);
			} else {
				next.add(index);
			}
			return next;
		});
	}, []);

	const selectAll = useCallback(() => {
		setSelected(
			book ? new Set(book.chapters.map((_, index) => index)) : new Set(),
		);
	}, [book]);

	const deselectAll = useCallback(() => {
		setSelected(new Set());
	}, []);

	const selectedWordCount = useMemo(() => {
		if (!book) return 0;
		let total = 0;
		for (const index of selected) {
			total += book.chapters[index]?.wordCount ?? 0;
		}
		return total;
	}, [book, selected]);

	const value = useMemo(
		() => ({
			selected,
			isSelected,
			toggle,
			selectAll,
			deselectAll,
			selectedCount: selected.size,
			totalCount: book?.chapterCount ?? 0,
			selectedWordCount,
			selectedAudioETA: formatAudioETA(selectedWordCount),
		}),
		[
			selected,
			isSelected,
			toggle,
			selectAll,
			deselectAll,
			book,
			selectedWordCount,
		],
	);

	return (
		<ChapterSelectionContext.Provider value={value}>
			{children}
		</ChapterSelectionContext.Provider>
	);
}

export function useChapterSelection(): ChapterSelectionContextValue {
	const ctx = useContext(ChapterSelectionContext);
	if (!ctx)
		throw new Error(
			"useChapterSelection must be used within a ChapterSelectionProvider",
		);
	return ctx;
}
