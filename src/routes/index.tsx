import { createFileRoute } from "@tanstack/react-router";
import { BookUpload } from "@/components/book-upload";
import { Chapters } from "@/components/chapters";
import { Header } from "@/components/header";
import { Mixer } from "@/components/mixer";
import { VoiceSelection } from "@/components/voice-selection";
import { BookProvider } from "@/hooks/useBook";
import { ChapterAudioProvider } from "@/hooks/useChapterAudio";
import { ChapterSelectionProvider } from "@/hooks/useChapterSelection";
import { SynthesisProvider } from "@/hooks/useSynthesis";

export const Route = createFileRoute("/")({ component: Home });

function Home() {
	return (
		<SynthesisProvider>
			<BookProvider>
				<ChapterSelectionProvider>
					<ChapterAudioProvider>
						<main className="min-h-screen bg-background p-8 text-foreground">
							<Header />
							<div className="grid grid-cols-2 gap-6">
								<div className="flex flex-col gap-4">
									<BookUpload />
									<VoiceSelection />
								</div>

								<div className="flex flex-col gap-4">
									<Chapters />
									<Mixer />
								</div>
							</div>
						</main>
					</ChapterAudioProvider>
				</ChapterSelectionProvider>
			</BookProvider>
		</SynthesisProvider>
	);
}
