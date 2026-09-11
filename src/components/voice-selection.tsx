import { useDeferredValue, useMemo, useState } from "react";
import { useSynthesis } from "@/hooks/useSynthesis";
import { DEFAULT_PREVIEW_TEXT, useVoicePreview } from "@/hooks/useVoicePreview";
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
import { VoiceCard } from "./voice-card";

export function VoiceSelection() {
	const { model, voice, speed, volume, format, setVoice } = useSynthesis();
	const voicesQuery = useVoices();
	const [selectedCountry, setSelectedCountry] = useState("American");
	const [filter, setFilter] = useState("");
	const [previewText, setPreviewText] = useState(DEFAULT_PREVIEW_TEXT);
	const deferredFilter = useDeferredValue(filter);
	const { previewingId, previewError, handlePreview } = useVoicePreview({
		model,
		speed,
		volume,
		format,
		previewText,
	});

	const query = deferredFilter.trim().toLowerCase();

	const countries = useMemo(
		() => voicesQuery.data?.byCountry.map((g) => g.country) ?? [],
		[voicesQuery.data],
	);

	const activeCountry =
		countries.length === 0
			? selectedCountry
			: countries.includes(selectedCountry)
				? selectedCountry
				: (countries[0] ?? selectedCountry);

	const visibleVoices = useMemo(() => {
		const group = voicesQuery.data?.byCountry.find(
			(g) => g.country === activeCountry,
		);
		if (!group) return [];
		if (query === "") return group.voices;
		return group.voices.filter(
			(v) =>
				v.id.toLowerCase().includes(query) ||
				v.description.toLowerCase().includes(query),
		);
	}, [voicesQuery.data, activeCountry, query]);

	return (
		<section className="border-2 border-outline p-6 shadow-section bg-background">
			<div className="flex items-center justify-between pb-4 border-b-2 border-outline mb-6">
				<h2 className="font-headline font-bold text-lg uppercase tracking-tight">
					03. Choose Voice
				</h2>
				<span className="text-[10px] font-mono font-bold text-on-surface-variant uppercase">
					{voice === "" ? "No voice selected" : voice}
				</span>
			</div>

			<div className="flex flex-col gap-4">
				<div className="flex items-center gap-2">
					<Select value={activeCountry} onValueChange={setSelectedCountry}>
						<SelectTrigger className="w-45">
							<SelectValue placeholder="Select a Country" />
						</SelectTrigger>
						<SelectContent>
							<SelectGroup>
								{countries.map((country) => (
									<SelectItem key={country} value={country}>
										{country}
									</SelectItem>
								))}
							</SelectGroup>
						</SelectContent>
					</Select>
					<Input
						value={filter}
						onChange={(e) => setFilter(e.currentTarget.value)}
						placeholder="Filter voices..."
					/>
				</div>

				{previewError ? (
					<p className="text-xs font-mono text-red-600">{previewError}</p>
				) : null}

				<Input
					value={previewText}
					onChange={(e) => setPreviewText(e.currentTarget.value)}
					placeholder="Type a sentence to preview voices..."
					maxLength={300}
				/>

				{voicesQuery.isPending ? (
					<div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
						{[0, 1, 2, 3].map((i) => (
							<div
								key={i}
								className="h-32 border-2 border-outline animate-pulse"
							/>
						))}
					</div>
				) : voicesQuery.isError ? (
					<div className="border-2 border-outline p-4 mb-4 text-sm">
						<p className="font-bold uppercase text-xs mb-1">
							Voices unavailable
						</p>
						<Button
							size="sm"
							variant="neutral"
							onClick={() => voicesQuery.refetch()}
						>
							Retry
						</Button>
					</div>
				) : visibleVoices.length === 0 ? (
					<p className="text-sm text-on-surface-variant py-8 text-center">
						No voices match “{deferredFilter}” in {activeCountry}.
					</p>
				) : (
					<div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4 max-h-96 overflow-y-auto">
						{visibleVoices.map((v) => (
							<VoiceCard
								key={v.id}
								id={v.id}
								description={v.description}
								gender={v.gender}
								selected={v.id === voice}
								previewing={v.id === previewingId}
								onSelect={setVoice}
								onPreview={handlePreview}
							/>
						))}
					</div>
				)}
			</div>
		</section>
	);
}
