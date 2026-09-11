import { memo } from "react";
import { Button } from "./ui/button";

export interface VoiceCardProps {
	id: string;
	description: string;
	gender: string;
	selected: boolean;
	previewing: boolean;
	onSelect: (id: string) => void;
	onPreview: (id: string) => void;
}

export const VoiceCard = memo(function VoiceCard({
	id,
	description,
	gender,
	selected,
	previewing,
	onSelect,
	onPreview,
}: VoiceCardProps) {
	return (
		<div className="justify-between] relative flex flex-col border-2 border-outline p-4">
			<div>
				<div className="mb-2 flex items-start justify-between gap-2">
					<h4 className="font-bold font-headline text-sm uppercase">{id}</h4>
					<span className="px-2 py-0.5 font-bold font-headline text-[10px] uppercase">
						{gender}
					</span>
				</div>
				<p className="mb-3 text-on-surface-variant text-xs">{description}</p>
			</div>
			<div className="flex items-center justify-between border-outline border-t pt-2">
				<Button
					variant="neutral"
					size="sm"
					disabled={previewing}
					onClick={() => onPreview(id)}
				>
					{previewing ? "Playing…" : "Preview"}
				</Button>
				<Button
					size="sm"
					variant={selected ? "default" : "neutral"}
					aria-pressed={selected}
					onClick={() => onSelect(id)}
				>
					{selected ? "Selected" : "Select"}
				</Button>
			</div>
		</div>
	);
});
