import {
	AudioLines,
	Captions,
	FileHeadphone,
	FolderArchive,
	Play,
	RotateCcwClock,
	Volume2,
} from "lucide-react";
import { SynthesisControls } from "./synthesis-controls";
import { Button } from "./ui/button";

export function Mixer() {
	return (
		<section className="bg-surface-bright border-2 border-outline p-6 shadow-section">
			<div className="flex items-center justify-between pb-3 border-b-2 border-outline mb-4">
				<h2 className="font-headline font-bold text-base uppercase tracking-tight">
					05. Output &amp; Real-Time Master Player
				</h2>
				<span className="px-2 py-0.5 bg-surface-container text-on-surface text-[10px] font-mono font-bold uppercase border border-outline">
					CH 01 RENDERED
				</span>
			</div>
			<SynthesisControls />
			<div className="mb-4">
				<h4 className="font-headline font-bold text-sm uppercase">
					Chapter 1: A Beginning is a Very Delicate Time
				</h4>
				<p className="text-xs font-mono text-on-surface-variant">
					Narrator: Arthur V. • Dynamic Master • 48kHz FLAC Master
				</p>
			</div>
			<div className="bg-surface border-2 border-outline p-3 mb-4">
				<div className="flex items-center justify-between text-[10px] font-mono font-bold uppercase mb-2">
					<span className="text-secondary">PEAK LEVEL: -0.3 dBFS</span>
					<span className="text-on-surface-variant">RMS: -14.2 LUFS</span>
				</div>
				<div
					className="h-16 w-full flex items-end gap-1 px-1 overflow-hidden"
					id="waveform"
				>
					<div className="w-1 bg-secondary h-4"></div>
					<div className="w-1 bg-secondary h-7"></div>
					<div className="w-1 bg-secondary h-12"></div>
					<div className="w-1 bg-secondary h-9"></div>
					<div className="w-1 bg-secondary h-14"></div>
					<div className="w-1 bg-secondary h-11"></div>
					<div className="w-1 bg-secondary h-8"></div>
					<div className="w-1 bg-secondary h-13"></div>
					<div className="w-1 bg-secondary h-16"></div>
					<div className="w-1 bg-secondary h-10"></div>
					<div className="w-1 bg-secondary h-6"></div>
					<div className="w-1 bg-secondary h-12"></div>
					<div className="w-1 bg-secondary h-15"></div>
					<div className="w-1 bg-secondary h-7"></div>
					<div className="w-1 bg-outline h-3"></div>
					<div className="w-1 bg-outline h-8"></div>
					<div className="w-1 bg-outline h-12"></div>
					<div className="w-1 bg-outline h-5"></div>
					<div className="w-1 bg-outline h-9"></div>
					<div className="w-1 bg-outline h-14"></div>
					<div className="w-1 bg-outline h-11"></div>
					<div className="w-1 bg-outline h-7"></div>
					<div className="w-1 bg-outline h-10"></div>
					<div className="w-1 bg-outline h-4"></div>
					<div className="w-1 bg-outline h-8"></div>
					<div className="w-1 bg-outline h-13"></div>
					<div className="w-1 bg-outline h-6"></div>
					<div className="w-1 bg-outline h-10"></div>
					<div className="w-1 bg-outline h-14"></div>
					<div className="w-1 bg-outline h-9"></div>
					<div className="w-1 bg-outline h-5"></div>
					<div className="w-1 bg-outline h-3"></div>
					<div className="w-1 bg-outline h-7"></div>
					<div className="w-1 bg-outline h-11"></div>
					<div className="w-1 bg-outline h-15"></div>
					<div className="w-1 bg-outline h-8"></div>
					<div className="w-1 bg-outline h-4"></div>
					<div className="w-1 bg-outline h-10"></div>
					<div className="w-1 bg-outline h-12"></div>
					<div className="w-1 bg-outline h-6"></div>
					<div className="w-1 bg-outline h-2"></div>
				</div>
				<div className="relative w-full h-2 bg-surface-dim mt-2 cursor-pointer border border-outline">
					<div className="absolute left-0 top-0 h-full w-[23%] bg-secondary"></div>
					<div className="absolute left-[23%] -top-1 w-2 h-4 bg-primary border border-surface"></div>
				</div>
				<div className="flex justify-between text-[10px] font-mono font-bold mt-1 text-on-surface-variant">
					<span className="text-secondary">04:18</span>
					<span>18:24</span>
				</div>
			</div>
			<div className="flex items-center justify-between gap-3 p-3 bg-surface-container border-2 border-outline mb-5">
				<div className="flex items-center gap-1.5">
					<Button variant="neutral">
						<RotateCcwClock />
					</Button>
					<Button>
						<Play />
					</Button>
					<Button variant="neutral">
						<RotateCcwClock className="-scale-x-100" />
					</Button>
				</div>
				<div className="flex items-center gap-1">
					<Button variant="neutral">1.0x</Button>
					<Button variant="neutral">1.25x</Button>
					<Button variant="neutral">1.5x</Button>
				</div>
				<div className="hidden sm:flex items-center gap-1 text-on-surface">
					<Volume2 />
					<input
						className="w-16 h-1.5 accent-primary cursor-pointer"
						max="100"
						min="0"
						type="range"
						value="85"
					/>
				</div>
			</div>
			<div>
				<span className="text-[10px] font-headline uppercase font-bold text-on-surface-variant block mb-2 tracking-wider">
					Export &amp; Release Channels
				</span>
				<div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
					<Button className="p-2.5 bg-surface border-2 border-outline hover:bg-primary-container text-left transition-colors flex items-center gap-2.5">
						<FileHeadphone />
						<div>
							<span className="font-headline font-bold text-xs uppercase block">
								Full .M4B Master
							</span>
							<span className="text-[10px] font-mono text-on-surface-variant">
								Includes Chapter Markers
							</span>
						</div>
					</Button>
					<Button className="p-2.5 bg-surface border-2 border-outline hover:bg-primary-container text-left transition-colors flex items-center gap-2.5">
						<FolderArchive />
						<div>
							<span className="font-headline font-bold text-xs uppercase block">
								MP3 Archive (.ZIP)
							</span>
							<span className="text-[10px] font-mono text-on-surface-variant">
								320kbps Individual Tracks
							</span>
						</div>
					</Button>
					<Button className="p-2.5 bg-surface border-2 border-outline hover:bg-primary-container text-left transition-colors flex items-center gap-2.5">
						<Captions />
						<div>
							<span className="font-headline font-bold text-xs uppercase block">
								Subtitles (.SRT / .VTT)
							</span>
							<span className="text-[10px] font-mono text-on-surface-variant">
								Word-Level Timestamps
							</span>
						</div>
					</Button>
					<Button className="p-2.5 bg-surface border-2 border-outline hover:bg-primary-container text-left transition-colors flex items-center gap-2.5">
						<AudioLines />
						<div>
							<span className="font-headline font-bold text-xs uppercase block">
								MP3
							</span>
							<span className="text-[10px] font-mono text-on-surface-variant">
								Export to MP3 (no chapter marks)
							</span>
						</div>
					</Button>
				</div>
			</div>
		</section>
	);
}
