import { useCallback, useRef, useState } from "react";
import type { ChapterJob } from "@/lib/chapter-audio";

export function useChapterPlayback(jobs: ChapterJob[]) {
	const [playingIndex, setPlayingIndex] = useState<number | null>(null);
	const audioRef = useRef<HTMLAudioElement | null>(null);

	const resetPlayback = useCallback(() => {
		audioRef.current?.pause();
		audioRef.current = null;
		setPlayingIndex(null);
	}, []);

	const togglePlay = useCallback(
		(index: number) => {
			if (playingIndex === index) {
				audioRef.current?.pause();
				audioRef.current = null;
				setPlayingIndex(null);
				return;
			}
			const url = jobs[index]?.audioUrl;
			if (!url) return;
			audioRef.current?.pause();
			const audio = new Audio(url);
			audioRef.current = audio;
			setPlayingIndex(index);
			audio.onended = () => {
				audioRef.current = null;
				setPlayingIndex((cur) => (cur === index ? null : cur));
			};
			audio.play().catch(() => {
				audioRef.current = null;
				setPlayingIndex(null);
			});
		},
		[jobs, playingIndex],
	);

	return { playingIndex, togglePlay, resetPlayback };
}
