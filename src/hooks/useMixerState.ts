import { useMemo } from "react";
import type { ParsedBook } from "@/lib/book";

interface UseMixerStateParams {
	book: ParsedBook | null;
	selected: Set<number>;
	voice: string;
	isGenerating: boolean;
	doneCount: number;
	runIndices: number[];
	exporting: boolean;
}

export function useMixerState({
	book,
	selected,
	voice,
	isGenerating,
	doneCount,
	runIndices,
	exporting,
}: UseMixerStateParams) {
	return useMemo(() => {
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
		const canClear =
			!!book && !isGenerating && !exporting && runIndices.length > 0;
		return { selectedIndices, canGenerate, hint, canExport, canClear };
	}, [book, selected, voice, isGenerating, doneCount, runIndices, exporting]);
}
