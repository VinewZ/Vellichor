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
	const { book, isParsing, error, parseFile, preloadParsers } = useBook();
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
		<section className="relative border-2 border-outline bg-background p-6 shadow-section">
			<div className="mb-6 flex items-center justify-between border-outline border-b-2 pb-4">
				<div className="flex items-center gap-2">
					<h2 className="font-bold font-headline text-lg uppercase tracking-tight">
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
			<div className="grid grid-cols-1 gap-5 md:grid-cols-12">
				<div className="flex flex-col items-center justify-center border-2 border-outline p-3 md:col-span-4">
					{coverUrl ? (
						<img
							src={coverUrl}
							alt={`${book?.title ?? "Book"} cover`}
							className="max-h-64 w-auto border border-outline object-contain"
						/>
					) : isUploaded ? (
						<Book size={100} />
					) : (
						<Upload size={100} />
					)}
				</div>
				<div className="flex flex-col justify-between gap-4 md:col-span-8">
					<div>
						<div className="mb-2 flex flex-wrap items-center gap-2">
							<span
								className={cn(
									"border border-outline px-2 py-0.5 font-bold font-headline text-[10px] text-on-tertiary uppercase",
									book?.fileFormat && "bg-emerald-800",
								)}
							>
								{book ? `${book.fileFormat} Detected` : "Awaiting file"}
							</span>
							{book && book.toc.length > 0 ? (
								<span
									className={cn(
										"border border-outline px-2 py-0.5 font-bold font-headline text-[10px] uppercase",
										book.toc && "bg-emerald-800",
									)}
								>
									TOC Extracted · {book.toc.length}
								</span>
							) : null}
						</div>
						<h3 className="font-bold font-headline text-xl uppercase tracking-tight">
							{book ? book.title : "No file loaded"}
						</h3>
						<p className="mt-0.5 font-mono text-on-surface-variant text-xs capitalize">
							{book
								? `Size: ${book.fileSizeMB} MB • ${book.author}${book.publisher ? ` • ${book.publisher}` : ""}${book.date ? ` ${book.date}` : ""}`
								: "Select a .PDF or .EPUB to extract text + TOC"}
						</p>
					</div>
					<div className="grid grid-cols-3 gap-2 py-2">
						<div className="border-2 border-outline p-2.5">
							<span className="block font-bold font-headline text-[10px] text-on-surface-variant uppercase">
								{isEpub ? "Chapters" : "Pages"}
							</span>
							<span className="font-bold font-headline text-lg text-on-surface">
								{book
									? isEpub
										? book.chapterCount
										: (book.pageCount ?? "—")
									: "—"}
							</span>
						</div>
						<div className="border-2 border-outline p-2.5">
							<span className="block font-bold font-headline text-[10px] text-on-surface-variant uppercase">
								Word Count
							</span>
							<span className="font-bold font-headline text-lg text-on-surface">
								{book ? book.wordCountLabel : "—"}
							</span>
						</div>
						<div className="border-2 border-outline p-2.5">
							<span className="block font-bold font-headline text-[10px] text-secondary uppercase">
								Est. Audio
							</span>
							<span className="font-bold font-headline text-lg text-secondary">
								{book ? audioLabel : "—"}
							</span>
						</div>
					</div>
					<label
						htmlFor="book-upload"
						onMouseEnter={preloadParsers}
						onFocus={preloadParsers}
						className="flex cursor-pointer flex-col items-center justify-center border-2 border-outline border-dashed p-3.5 text-center transition-colors"
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

						<span className="material-symbols-outlined mb-1 text-on-surface text-xl">
							upload_file
						</span>

						<p className="font-bold font-headline text-xs uppercase">
							{isParsing
								? "Parsing file…"
								: isUploaded
									? "Upload file to re-parse"
									: "Upload .PDF or .EPUB to parse"}
						</p>

						<p className="font-mono text-[10px] text-on-surface-variant">
							Supports .EPUB, .PDF
						</p>

						{error ? (
							<p
								role="alert"
								className="mt-1 font-mono text-[11px] text-red-600"
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
