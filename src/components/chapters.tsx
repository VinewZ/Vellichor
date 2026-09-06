import { Button } from "./ui/button";
import { Checkbox } from "./ui/checkbox";

export function Chapters() {
	const example = [
		{
			title: "A Beginning is a delicate time",
			wc: 3840,
			subtitle: "Scene Caladan Library",
		},
		{
			title: "A Beginning is a delicate time",
			wc: 3840,
			subtitle: "Scene Caladan Library",
		},
		{
			title: "A Beginning is a delicate time",
			wc: 3840,
			subtitle: "Scene Caladan Library",
		},
		{
			title: "A Beginning is a delicate time",
			wc: 3840,
			subtitle: "Scene Caladan Library",
		},
		{
			title: "A Beginning is a delicate time",
			wc: 3840,
			subtitle: "Scene Caladan Library",
		},
		{
			title: "A Beginning is a delicate time",
			wc: 3840,
			subtitle: "Scene Caladan Library",
		},
		{
			title: "A Beginning is a delicate time",
			wc: 3840,
			subtitle: "Scene Caladan Library",
		},
		{
			title: "A Beginning is a delicate time",
			wc: 3840,
			subtitle: "Scene Caladan Library",
		},
		{
			title: "A Beginning is a delicate time",
			wc: 3840,
			subtitle: "Scene Caladan Library",
		},
		{
			title: "A Beginning is a delicate time",
			wc: 3840,
			subtitle: "Scene Caladan Library",
		},
		{
			title: "A Beginning is a delicate time",
			wc: 3840,
			subtitle: "Scene Caladan Library",
		},
		{
			title: "A Beginning is a delicate time",
			wc: 3840,
			subtitle: "Scene Caladan Library",
		},
	];

	return (
		<section className="bg-surface-bright border-2 border-outline p-6 shadow-section">
			<div className="flex items-center justify-between pb-4 border-b-2 border-outline mb-4">
				<h2 className="font-headline font-bold text-lg uppercase tracking-tight">
					04. Chapter Scope
				</h2>
				<span className="text-xs font-mono font-bold text-secondary">
					4 of 5 SELECTED
				</span>
			</div>
			<div className="flex items-center justify-between gap-2 pb-3 mb-3 border-b border-outline/30 text-xs font-headline font-bold uppercase">
				<div className="flex items-center gap-2">
					<Button>Select All</Button>
					<span>•</span>
					<Button>Deselect All</Button>
				</div>
				<span className="text-[10px] font-mono text-on-surface-variant font-normal">
					EST. TOTAL: 1h 37m
				</span>
			</div>
			<div className="flex flex-col gap-2.5 max-h-118 overflow-y-auto pr-1">
				{example.map((ch, idx) => (
					<div
						key={ch.title}
						className="flex items-center gap-3 p-3 bg-surface border-2 border-outline hover:bg-surface-container cursor-pointer transition-colors"
					>
						<Checkbox />
						<div className="flex-1 min-w-0">
							<div className="flex items-center justify-between gap-2">
								<span className="font-headline font-bold text-xs uppercase truncate">
									Ch {idx}: {ch.title}
								</span>
								<span className="font-mono text-[11px] font-bold text-secondary shrink-0">
									{idx} MINS
								</span>
							</div>
							<p className="text-[11px] text-on-surface-variant font-mono">
								{ch.wc + idx} words • {ch.subtitle}
							</p>
						</div>
					</div>
				))}
			</div>
		</section>
	);
}
