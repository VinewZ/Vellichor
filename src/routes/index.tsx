import { createFileRoute } from "@tanstack/react-router";
import { BookUpload } from "@/components/book-upload";
import { Chapters } from "@/components/chapters";
import { Header } from "@/components/header";
import { Mixer } from "@/components/mixer";
import { VoiceSelection } from "@/components/voice-selection";
import { BookProvider } from "@/hooks/useBook";
import { ChapterSelectionProvider } from "@/hooks/useChapterSelection";
import { SynthesisProvider } from "@/hooks/useSynthesis";

export const Route = createFileRoute("/")({ component: Home });

function Home() {
	return (
		<SynthesisProvider>
			<BookProvider>
				<ChapterSelectionProvider>
					<div className="min-h-screen bg-background p-8 text-foreground">
						<Header />
						<main className="flex flex-col gap-4">
							<div className="grid grid-cols-2 gap-6">
								<div className="flex flex-col gap-4">
									<BookUpload />
									<VoiceSelection />
								</div>

								<div className="flex flex-col gap-4">
									<Chapters />
								</div>
							</div>

							<div>
								<Mixer />
							</div>
						</main>
					</div>
				</ChapterSelectionProvider>
			</BookProvider>
		</SynthesisProvider>
	);
}
