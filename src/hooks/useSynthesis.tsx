import {
	createContext,
	useCallback,
	useContext,
	useEffect,
	useMemo,
	useState,
} from "react";

import { buildSpeechRequest, type ResponseFormat } from "@/lib/synthesis";

export type { ResponseFormat };
export { buildSpeechRequest };

interface SynthesisContextValue {
	model: string;
	voice: string;
	speed: number;
	volume: number;
	format: ResponseFormat;
	setModel: (model: string) => void;
	setVoice: (voice: string) => void;
	setSpeed: (speed: number) => void;
	setVolume: (volume: number) => void;
	setFormat: (format: ResponseFormat) => void;
}

const SynthesisContext = createContext<SynthesisContextValue | null>(null);

const STORAGE_KEY = "pagevoice:synthesis:v1";

const DEFAULTS = {
	model: "kokoro",
	voice: "",
	speed: 1,
	format: "mp3" as ResponseFormat,
	volume: 1,
};

function clamp(n: number, min: number, max: number, fallback: number) {
	return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
}

function loadInitial(): typeof DEFAULTS {
	if (typeof window === "undefined") return DEFAULTS;
	try {
		const raw = window.localStorage.getItem(STORAGE_KEY);
		if (!raw) return DEFAULTS;
		const parsed = JSON.parse(raw) as Partial<typeof DEFAULTS>;
		return {
			model:
				typeof parsed.model === "string" && parsed.model.length > 0
					? parsed.model
					: DEFAULTS.model,
			voice: typeof parsed.voice === "string" ? parsed.voice : DEFAULTS.voice,
			speed: clamp(Number(parsed.speed), 0.25, 4, DEFAULTS.speed),
			volume: clamp(Number(parsed.volume), 0.1, 2, DEFAULTS.volume),
			format:
				parsed.format === "mp3" ||
				parsed.format === "opus" ||
				parsed.format === "aac" ||
				parsed.format === "flac" ||
				parsed.format === "wav" ||
				parsed.format === "pcm"
					? parsed.format
					: DEFAULTS.format,
		};
	} catch {
		return DEFAULTS;
	}
}

export function SynthesisProvider({ children }: { children: React.ReactNode }) {
	const [initial] = useState(loadInitial);
	const [model, setModelState] = useState(initial.model);
	const [voice, setVoiceState] = useState(initial.voice);
	const [speed, setSpeedState] = useState(initial.speed);
	const [volume, setVolumeState] = useState(initial.volume);
	const [format, setFormatState] = useState<ResponseFormat>(initial.format);

	useEffect(() => {
		try {
			window.localStorage.setItem(
				STORAGE_KEY,
				JSON.stringify({ model, voice, speed, volume, format }),
			);
		} catch {
			// ignore write errors (private mode, etc.)
		}
	}, [model, voice, speed, volume, format]);

	const setModel = useCallback((next: string) => setModelState(next), []);
	const setVoice = useCallback((next: string) => setVoiceState(next), []);
	const setSpeed = useCallback(
		(next: number) => setSpeedState(clamp(next, 0.25, 4, 1)),
		[],
	);
	const setVolume = useCallback(
		(next: number) => setVolumeState(clamp(next, 0.1, 2, 1)),
		[],
	);
	const setFormat = useCallback(
		(next: ResponseFormat) => setFormatState(next),
		[],
	);

	const value = useMemo(
		() => ({
			model,
			voice,
			speed,
			volume,
			format,
			setModel,
			setVoice,
			setSpeed,
			setVolume,
			setFormat,
		}),
		[
			model,
			voice,
			speed,
			volume,
			format,
			setModel,
			setVoice,
			setSpeed,
			setVolume,
			setFormat,
		],
	);

	return (
		<SynthesisContext.Provider value={value}>
			{children}
		</SynthesisContext.Provider>
	);
}

export function useSynthesis(): SynthesisContextValue {
	const ctx = useContext(SynthesisContext);
	if (!ctx)
		throw new Error("useSynthesis must be used within a SynthesisProvider");
	return ctx;
}
