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
		<section className="border-2 border-outline bg-background p-6 shadow-section">
			<div className="mb-6 flex items-center justify-between border-outline border-b-2 pb-4">
				<h2 className="font-bold font-headline text-lg uppercase tracking-tight">
					03. Choose Voice
				</h2>
				<span className="font-bold font-mono text-[10px] text-on-surface-variant uppercase">
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
					<p className="font-mono text-red-600 text-xs">{previewError}</p>
				) : null}

				<Input
					value={previewText}
					onChange={(e) => setPreviewText(e.currentTarget.value)}
					placeholder="Type a sentence to preview voices..."
					maxLength={300}
				/>

				{voicesQuery.isPending ? (
					<div className="mb-4 grid grid-cols-1 gap-4 md:grid-cols-2">
						{[0, 1, 2, 3].map((i) => (
							<div
								key={i}
								className="h-32 animate-pulse border-2 border-outline"
							/>
						))}
					</div>
				) : voicesQuery.isError ? (
					<div className="mb-4 border-2 border-outline p-4 text-sm">
						<p className="mb-1 font-bold text-xs uppercase">
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
					<p className="py-8 text-center text-on-surface-variant text-sm">
						No voices match “{deferredFilter}” in {activeCountry}.
					</p>
				) : (
					<div className="mb-4 grid max-h-96 grid-cols-1 gap-4 overflow-y-auto md:grid-cols-2">
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
