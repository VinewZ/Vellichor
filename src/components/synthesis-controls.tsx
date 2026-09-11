import { type ResponseFormat, useSynthesis } from "@/hooks/useSynthesis";

const FORMATS: ResponseFormat[] = ["mp3", "opus", "aac", "flac", "wav", "pcm"];

export function SynthesisControls() {
	const { speed, volume, format, setSpeed, setVolume, setFormat } =
		useSynthesis();

	return (
		<div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-4 border-t-2 border-outline p-4">
			<div>
				<div className="flex justify-between text-xs font-headline font-bold uppercase mb-1.5">
					<label htmlFor="synth-speed">Speed</label>
					<span className="font-mono text-secondary">{speed.toFixed(2)}x</span>
				</div>
				<input
					id="synth-speed"
					className="w-full accent-primary h-2 border border-outline appearance-none cursor-pointer"
					max="4"
					min="0.25"
					step="0.05"
					type="range"
					value={speed}
					onChange={(e) => setSpeed(Number(e.currentTarget.value))}
				/>
				<div className="flex justify-between text-[9px] font-mono text-on-surface-variant mt-1">
					<span>0.25x</span>
					<span>DEFAULT 1.00x</span>
					<span>4.00x</span>
				</div>
			</div>
			<div>
				<div className="flex justify-between text-xs font-headline font-bold uppercase mb-1.5">
					<label htmlFor="synth-volume">Volume</label>
					<span className="font-mono text-secondary">
						{Math.round(volume * 100)}%
					</span>
				</div>
				<input
					id="synth-volume"
					className="w-full accent-primary h-2 border border-outline appearance-none cursor-pointer"
					max="2"
					min="0.1"
					step="0.05"
					type="range"
					value={volume}
					onChange={(e) => setVolume(Number(e.currentTarget.value))}
				/>
				<div className="flex justify-between text-[9px] font-mono text-on-surface-variant mt-1">
					<span>10%</span>
					<span>DEFAULT 100%</span>
					<span>200%</span>
				</div>
			</div>
			<div>
				<div className="flex justify-between text-xs font-headline font-bold uppercase mb-1.5">
					<label htmlFor="synth-format">Format</label>
					<span className="font-mono text-secondary">
						{format.toUpperCase()}
					</span>
				</div>
				<select
					id="synth-format"
					className="w-full h-10 px-3 border-2 border-outline text-sm font-mono cursor-pointer"
					value={format}
					onChange={(e) => setFormat(e.currentTarget.value as ResponseFormat)}
				>
					{FORMATS.map((f) => (
						<option key={f} value={f}>
							{f}
						</option>
					))}
				</select>
				<p className="text-[9px] font-mono text-on-surface-variant mt-1">
					SENT AS response_format ON EVERY PREVIEW + EXPORT
				</p>
			</div>
		</div>
	);
}
