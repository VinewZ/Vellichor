import { useState } from "react";
import { useVoices } from "@/hooks/useVoices";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import {
	Select,
	SelectContent,
	SelectGroup,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "./ui/select";

export function Voices() {
	const { data: voices } = useVoices();
	// TODO: save to local storage, retrieve on page load
	const [selectedCountry, setSelectedCountry] = useState("American");
	const [filter, setFilter] = useState("");
	const query = filter.trim().toLowerCase();

	return (
		<section className="bg-surface-bright border-2 border-outline p-6 shadow-section">
			<div className="flex items-center justify-between pb-4 border-b-2 border-outline mb-6">
				<h2 className="font-headline font-bold text-lg uppercase tracking-tight">
					03. Choose a Voice
				</h2>
				<div className="flex items-center gap-2">
					<label className="inline-flex items-center gap-2 cursor-pointer">
						<input
							className="sr-only peer"
							id="dialogueToggle"
							type="checkbox"
						/>
						<Select
							value={selectedCountry}
							onValueChange={(e) => setSelectedCountry(e)}
						>
							<SelectTrigger className="w-45">
								<SelectValue placeholder="Select a Country" />
							</SelectTrigger>
							<SelectContent>
								<SelectGroup>
									{voices?.byCountry.map((group) => (
										<SelectItem key={group.country} value={group.country}>
											{group.country}
										</SelectItem>
									))}
								</SelectGroup>
							</SelectContent>
						</Select>
					</label>
				</div>
			</div>
			<div className="flex flex-col gap-4">
				<Input
					value={filter}
					onChange={(e) => setFilter(e.currentTarget.value)}
					placeholder="Filter voices..."
				/>

				<div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4 max-h-96 overflow-y-auto">
					{voices?.byCountry
						.find((group) => group.country === selectedCountry)
						?.voices.filter(
							(voice) =>
								voice.id.toLowerCase().includes(query) ||
								voice.description.toLowerCase().includes(query),
						)
						.map((voice) => (
							<div
								key={voice.id}
								className="p-4 border-2 border-outline bg-surface relative shadow-[3px_3px_0px_#1a1a1a] flex flex-col justify-between"
							>
								<div>
									<div className="flex items-start justify-between gap-2 mb-2">
										<div className="flex items-center gap-3">
											<h4 className="font-headline font-bold text-sm uppercase">
												{voice.id}
											</h4>
										</div>
										<span className="px-2 py-0.5 bg-primary text-on-primary text-[10px] font-headline font-bold uppercase">
											{voice.gender}
										</span>
									</div>
									<p className="text-xs text-on-surface-variant mb-3">
										{voice.description}
									</p>
								</div>
								<div className="flex items-center justify-between pt-2 border-t border-outline">
									<Button>Preview Voice</Button>
									<Button>Select</Button>
								</div>
							</div>
						))}
				</div>
			</div>
		</section>
	);
}
