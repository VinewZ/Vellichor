import { memo } from "react";
import { cn } from "@/lib/utils";
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
		<div
			className={cn(
				"p-4 border-2 border-outline relative flex flex-col justify-between [content-visibility:auto]",
				selected ? "bg-primary-container" : "bg-surface",
			)}
		>
			<div>
				<div className="flex items-start justify-between gap-2 mb-2">
					<h4 className="font-headline font-bold text-sm uppercase">{id}</h4>
					<span className="px-2 py-0.5 bg-primary text-on-primary text-[10px] font-headline font-bold uppercase">
						{gender}
					</span>
				</div>
				<p className="text-xs text-on-surface-variant mb-3">{description}</p>
			</div>
			<div className="flex items-center justify-between pt-2 border-t border-outline">
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
