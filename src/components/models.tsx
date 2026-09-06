import { useModels } from "@/hooks/useModels";
import { Button } from "./ui/button";

export function Models() {
	const { data: models } = useModels();

	return (
		<section className="bg-surface-bright border-2 border-outline p-6 shadow-section">
			<h2 className="font-headline font-bold text-lg uppercase tracking-tight pb-4 border-b-2 border-outline mb-10">
				02. Choose a Model
			</h2>
			<div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-6">
				{models?.data.map((model) => (
					<div
						key={model.id}
						className="engine-card border-2 border-outline bg-primary-container p-4 cursor-pointer relative shadow-[3px_3px_0px_#1a1a1a] transition-transform"
					>
						<div className="flex items-center gap-2 mb-2 justify-between">
							<span className="material-symbols-outlined text-lg">
								{model.id}
							</span>
							<span className="font-headline font-bold text-xs uppercase">
								{model.object}
							</span>
						</div>
						<p className="text-[11px] font-body text-on-surface leading-tight mb-3">
							{model.owned_by}
						</p>
					</div>
				))}
			</div>
			<div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-4 border-t-2 border-outline bg-surface-container p-4">
				<div>
					<div className="flex justify-between text-xs font-headline font-bold uppercase mb-1.5">
						<span>Pacing Speed</span>
						<span className="font-mono text-secondary" id="speedVal">
							1.00x
						</span>
					</div>
					<input
						className="w-full accent-primary h-2 bg-surface-dim border border-outline appearance-none cursor-pointer"
						max="1.5"
						min="0.75"
						step="0.05"
						type="range"
						value="1.0"
					/>
					<div className="flex justify-between text-[9px] font-mono text-on-surface-variant mt-1">
						<span>0.75x</span>
						<span>DEFAULT</span>
						<span>1.50x</span>
					</div>
				</div>
				<div>
					<div className="flex justify-between text-xs font-headline font-bold uppercase mb-1.5">
						<span>Pitch Tuning</span>
						<span className="font-mono text-secondary" id="pitchVal">
							0%
						</span>
					</div>
					<input
						className="w-full accent-primary h-2 bg-surface-dim border border-outline appearance-none cursor-pointer"
						max="2"
						min="-2"
						step="0.5"
						type="range"
						value="0"
					/>
					<div className="flex justify-between text-[9px] font-mono text-on-surface-variant mt-1">
						<span>-2%</span>
						<span>NATURAL</span>
						<span>+2%</span>
					</div>
				</div>
				<div>
					<div className="flex justify-between text-xs font-headline font-bold uppercase mb-1.5">
						<span>Emotion Tone</span>
						<span className="font-mono text-secondary">EXPRESSIVE</span>
					</div>
					<div className="grid grid-cols-3 gap-1">
						<Button>Subtle</Button>
						<Button>Expressive</Button>
						<Button>Dramatic</Button>
					</div>
				</div>
			</div>
		</section>
	);
}
