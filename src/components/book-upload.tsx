import { Book, Upload } from "lucide-react";
import { Button } from "./ui/button";

export function BookUpload() {
	const isUploaded = false;
	const fileFormat = "pdf";
	const title = "Dune_Final_master";
	const fileSize = "4.2";
	const author = "Frank Herbert";
	const publisher = "Chilton Books";
	const date = "1965";
	const pages = "412";
	const wCount = "~187k";
	const ETA = "14h 22m";
	return (
		<section className="bg-surface-bright border-2 border-outline p-6 shadow-section relative">
			<div className="flex items-center justify-between pb-4 border-b-2 border-outline mb-6">
				<div className="flex items-center gap-2">
					<h2 className="font-headline font-bold text-lg uppercase tracking-tight">
						01. Source Document &amp; Parsing.
					</h2>
				</div>
				<Button>Replace File</Button>
			</div>
			<div className="grid grid-cols-1 md:grid-cols-12 gap-5">
				<div className="md:col-span-4 flex flex-col items-center justify-center p-3 bg-surface-container border-2 border-outline">
					{isUploaded ? <Book size={100} /> : <Upload size={100} />}
				</div>
				<div className="md:col-span-8 flex flex-col justify-between gap-4">
					<div>
						<div className="flex flex-wrap items-center gap-2 mb-2">
							<span className="px-2 py-0.5 bg-tertiary text-on-tertiary text-[10px] font-headline font-bold uppercase border border-outline">
								{fileFormat} Detected
							</span>
							<span className="px-2 py-0.5 bg-primary-container text-on-primary-container text-[10px] font-headline font-bold uppercase border border-outline">
								TOC Extracted
							</span>
						</div>
						<h3 className="font-headline font-bold text-xl uppercase tracking-tight">
							{title}.{fileFormat}
						</h3>
						<p className="text-xs text-on-surface-variant font-mono mt-0.5 capitalize">
							Size: {fileSize} MB • {author} • {publisher} {date}
						</p>
					</div>
					<div className="grid grid-cols-3 gap-2 py-2">
						<div className="p-2.5 bg-surface border-2 border-outline">
							<span className="block text-[10px] font-headline uppercase font-bold text-on-surface-variant">
								Pages
							</span>
							<span className="font-headline font-bold text-lg text-on-surface">
								{pages}
							</span>
						</div>
						<div className="p-2.5 bg-surface border-2 border-outline">
							<span className="block text-[10px] font-headline uppercase font-bold text-on-surface-variant">
								Word Count
							</span>
							<span className="font-headline font-bold text-lg text-on-surface">
								{wCount}
							</span>
						</div>
						<div className="p-2.5 bg-surface border-2 border-outline">
							<span className="block text-[10px] font-headline uppercase font-bold text-secondary">
								Est. Audio
							</span>
							<span className="font-headline font-bold text-lg text-secondary">
								{ETA}
							</span>
						</div>
					</div>
					<div className="border-2 border-dashed border-outline bg-surface-container-low p-3.5 text-center flex flex-col items-center justify-center cursor-pointer hover:bg-surface-container transition-colors">
						<span className="material-symbols-outlined text-xl text-on-surface mb-1">
							upload_file
						</span>
						<p className="text-xs font-headline font-bold uppercase">
							Drag new file to re-parse
						</p>
						<p className="text-[10px] text-on-surface-variant font-mono">
							Supports .EPUB, .PDF, .MOBI
						</p>
					</div>
				</div>
			</div>
		</section>
	);
}
