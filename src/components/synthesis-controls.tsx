import { type ResponseFormat, useSynthesis } from "@/hooks/useSynthesis";

const FORMATS: ResponseFormat[] = ["mp3", "opus", "aac", "flac", "wav", "pcm"];

export function SynthesisControls() {
	const { speed, volume, format, setSpeed, setVolume, setFormat } =
		useSynthesis();

	return (
		<div className="grid grid-cols-1 gap-4 border-outline border-t-2 p-4 pt-4 md:grid-cols-3">
			<div>
				<div className="mb-1.5 flex justify-between font-bold font-headline text-xs uppercase">
					<label htmlFor="synth-speed">Speed</label>
					<span className="font-mono text-secondary">{speed.toFixed(2)}x</span>
				</div>
				<input
					id="synth-speed"
					className="h-2 w-full cursor-pointer appearance-none border border-outline accent-primary"
					max="4"
					min="0.25"
					step="0.05"
					type="range"
					value={speed}
					onChange={(e) => setSpeed(Number(e.currentTarget.value))}
				/>
				<div className="mt-1 flex justify-between font-mono text-[9px] text-on-surface-variant">
					<span>0.25x</span>
					<span>DEFAULT 1.00x</span>
					<span>4.00x</span>
				</div>
			</div>
			<div>
				<div className="mb-1.5 flex justify-between font-bold font-headline text-xs uppercase">
					<label htmlFor="synth-volume">Volume</label>
					<span className="font-mono text-secondary">
						{Math.round(volume * 100)}%
					</span>
				</div>
				<input
					id="synth-volume"
					className="h-2 w-full cursor-pointer appearance-none border border-outline accent-primary"
					max="2"
					min="0.1"
					step="0.05"
					type="range"
					value={volume}
					onChange={(e) => setVolume(Number(e.currentTarget.value))}
				/>
				<div className="mt-1 flex justify-between font-mono text-[9px] text-on-surface-variant">
					<span>10%</span>
					<span>DEFAULT 100%</span>
					<span>200%</span>
				</div>
			</div>
			<div>
				<div className="mb-1.5 flex justify-between font-bold font-headline text-xs uppercase">
					<label htmlFor="synth-format">Format</label>
					<span className="font-mono text-secondary">
						{format.toUpperCase()}
					</span>
				</div>
				<select
					id="synth-format"
					className="h-10 w-full cursor-pointer border-2 border-outline px-3 font-mono text-sm"
					value={format}
					onChange={(e) => setFormat(e.currentTarget.value as ResponseFormat)}
				>
					{FORMATS.map((f) => (
						<option key={f} value={f}>
							{f}
						</option>
					))}
				</select>
				<p className="mt-1 font-mono text-[9px] text-on-surface-variant">
					SENT AS response_format ON EVERY PREVIEW + EXPORT
				</p>
			</div>
		</div>
	);
}
