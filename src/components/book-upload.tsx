import { Book, Upload } from "lucide-react";
import { useMemo, useRef } from "react";
import { useBook } from "@/hooks/useBook";
import { useChapterAudio } from "@/hooks/useChapterAudio";
import { useSynthesis } from "@/hooks/useSynthesis";
import { formatAudioETA, formatDuration } from "@/lib/book";
import { cn } from "@/lib/utils";
import { Button } from "./ui/button";

export function BookUpload() {
	const inputRef = useRef<HTMLInputElement>(null);
	const { book, isParsing, error, parseFile } = useBook();
	const { jobs } = useChapterAudio();
	const { speed } = useSynthesis();

	const audioLabel = useMemo(() => {
		if (!book) return "—";
		if (jobs.length === book.chapterCount && jobs.length > 0) {
			let actualSec = 0;
			let allKnown = true;
			for (const job of jobs) {
				if (
					job.status === "done" &&
					typeof job.durationSec === "number" &&
					Number.isFinite(job.durationSec)
				) {
					actualSec += job.durationSec;
				} else {
					allKnown = false;
					break;
				}
			}
			if (allKnown) return formatDuration(actualSec);
		}
		return formatAudioETA(book.wordCount, undefined, speed);
	}, [book, jobs, speed]);

	const isUploaded = book !== null;
	const isEpub = book?.fileFormat === "epub";
	const coverUrl = book?.coverUrl;

	function handleFile(file: File | undefined) {
		parseFile(file);
		if (inputRef.current) inputRef.current.value = "";
	}

	return (
		<section className="bg-surface-bright border-2 border-outline p-6 shadow-section relative">
			<div className="flex items-center justify-between pb-4 border-b-2 border-outline mb-6">
				<div className="flex items-center gap-2">
					<h2 className="font-headline font-bold text-lg uppercase tracking-tight">
						01. Source Document &amp; Parsing.
					</h2>
				</div>
				<Button
					type="button"
					disabled={isParsing}
					onClick={() => inputRef.current?.click()}
				>
					{isParsing ? "Parsing…" : "Upload File"}
				</Button>
			</div>
			<div className="grid grid-cols-1 md:grid-cols-12 gap-5">
				<div className="md:col-span-4 flex flex-col items-center justify-center p-3 bg-surface-container border-2 border-outline">
					{coverUrl ? (
						<img
							src={coverUrl}
							alt={`${book?.title ?? "Book"} cover`}
							className="max-h-64 w-auto object-contain border border-outline"
						/>
					) : isUploaded ? (
						<Book size={100} />
					) : (
						<Upload size={100} />
					)}
				</div>
				<div className="md:col-span-8 flex flex-col justify-between gap-4">
					<div>
						<div className="flex flex-wrap items-center gap-2 mb-2">
							<span
								className={cn(
									"px-2 py-0.5 bg-tertiary text-on-tertiary text-[10px] font-headline font-bold uppercase border border-outline",
									book?.fileFormat && "bg-emerald-800",
								)}
							>
								{book ? `${book.fileFormat} Detected` : "Awaiting file"}
							</span>
							{book && book.toc.length > 0 ? (
								<span
									className={cn(
										"px-2 py-0.5 bg-primary-container text-on-primary-container text-[10px] font-headline font-bold uppercase border border-outline",
										book.toc && "bg-emerald-800",
									)}
								>
									TOC Extracted · {book.toc.length}
								</span>
							) : null}
						</div>
						<h3 className="font-headline font-bold text-xl uppercase tracking-tight">
							{book ? book.title : "No file loaded"}
						</h3>
						<p className="text-xs text-on-surface-variant font-mono mt-0.5 capitalize">
							{book
								? `Size: ${book.fileSizeMB} MB • ${book.author}${book.publisher ? ` • ${book.publisher}` : ""}${book.date ? ` ${book.date}` : ""}`
								: "Select a .PDF or .EPUB to extract text + TOC"}
						</p>
					</div>
					<div className="grid grid-cols-3 gap-2 py-2">
						<div className="p-2.5 bg-surface border-2 border-outline">
							<span className="block text-[10px] font-headline uppercase font-bold text-on-surface-variant">
								{isEpub ? "Chapters" : "Pages"}
							</span>
							<span className="font-headline font-bold text-lg text-on-surface">
								{book
									? isEpub
										? book.chapterCount
										: (book.pageCount ?? "—")
									: "—"}
							</span>
						</div>
						<div className="p-2.5 bg-surface border-2 border-outline">
							<span className="block text-[10px] font-headline uppercase font-bold text-on-surface-variant">
								Word Count
							</span>
							<span className="font-headline font-bold text-lg text-on-surface">
								{book ? book.wordCountLabel : "—"}
							</span>
						</div>
						<div className="p-2.5 bg-surface border-2 border-outline">
							<span className="block text-[10px] font-headline uppercase font-bold text-secondary">
								Est. Audio
							</span>
							<span className="font-headline font-bold text-lg text-secondary">
								{book ? audioLabel : "—"}
							</span>
						</div>
					</div>
					<label
						htmlFor="book-upload"
						className="border-2 border-dashed border-outline bg-surface-container-low p-3.5 text-center flex flex-col items-center justify-center cursor-pointer hover:bg-surface-container transition-colors"
					>
						<input
							ref={inputRef}
							id="book-upload"
							type="file"
							accept=".epub,.pdf,application/epub+zip,application/pdf"
							className="hidden"
							disabled={isParsing}
							onChange={(e) => {
								void handleFile(e.target.files?.[0]);
							}}
						/>

						<span className="material-symbols-outlined text-xl text-on-surface mb-1">
							upload_file
						</span>

						<p className="text-xs font-headline font-bold uppercase">
							{isParsing
								? "Parsing file…"
								: isUploaded
									? "Upload file to re-parse"
									: "Upload .PDF or .EPUB to parse"}
						</p>

						<p className="text-[10px] text-on-surface-variant font-mono">
							Supports .EPUB, .PDF
						</p>

						{error ? (
							<p
								role="alert"
								className="text-[11px] font-mono text-red-600 mt-1"
							>
								{error}
							</p>
						) : null}
					</label>
				</div>
			</div>
		</section>
	);
}
