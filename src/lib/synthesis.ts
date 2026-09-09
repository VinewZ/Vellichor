export type ResponseFormat = "mp3" | "opus" | "aac" | "flac" | "wav" | "pcm";

export interface SynthesisSnapshot {
	model: string;
	voice: string;
	speed: number;
	volume: number;
	format: ResponseFormat;
}

export function buildSpeechRequest(state: SynthesisSnapshot, input: string) {
	return {
		model: state.model,
		input,
		voice: state.voice,
		response_format: state.format,
		speed: state.speed,
		volume_multiplier: state.volume,
	};
}
