import { useCallback, useRef, useState } from "react";
import type { ResponseFormat } from "@/hooks/useSynthesis";
import { buildSpeechRequest } from "@/hooks/useSynthesis";

export const DEFAULT_PREVIEW_TEXT = "Hello, this is a preview of this voice.";

interface PreviewState {
	model: string;
	speed: number;
	volume: number;
	format: ResponseFormat;
	previewText: string;
}

export function useVoicePreview(state: PreviewState) {
	const [previewingId, setPreviewingId] = useState<string | null>(null);
	const [previewError, setPreviewError] = useState<string | null>(null);
	const audioRef = useRef<HTMLAudioElement | null>(null);

	const handlePreview = useCallback(
		async (voiceId: string) => {
			try {
				setPreviewError(null);
				setPreviewingId(voiceId);
				audioRef.current?.pause();
				const res = await fetch("/api/speech", {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify(
						buildSpeechRequest(
							{
								model: state.model,
								voice: voiceId,
								speed: state.speed,
								volume: state.volume,
								format: state.format,
							},
							state.previewText.trim() === ""
								? DEFAULT_PREVIEW_TEXT
								: state.previewText.trim(),
						),
					),
				});
				if (!res.ok) throw new Error(`Preview failed: ${res.status}`);
				const blob = await res.blob();
				const url = URL.createObjectURL(blob);
				const audio = new Audio(url);
				audioRef.current = audio;
				audio.onended = () => {
					URL.revokeObjectURL(url);
					setPreviewingId((cur) => (cur === voiceId ? null : cur));
				};
				await audio.play();
			} catch (error) {
				setPreviewError(
					error instanceof Error ? error.message : "Preview failed",
				);
				setPreviewingId(null);
			}
		},
		[state.model, state.speed, state.volume, state.format, state.previewText],
	);

	return { previewingId, previewError, handlePreview };
}
