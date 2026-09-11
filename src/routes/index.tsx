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
import { Footer } from "@/components/footer";

export const Route = createFileRoute("/")({ component: Home });

function Home() {
  return (
    <SynthesisProvider>
      <BookProvider>
        <ChapterSelectionProvider>
          <ChapterAudioProvider>
            <main className="min-h-screen bg-secondary-background text-foreground">
              <Header />
              <div className="grid md:grid-cols-2 gap-6 p-2 md:p-8">
                <BookUpload />
                <Chapters />

                <VoiceSelection />
                <Mixer />
              </div>
              <Footer />
            </main>
          </ChapterAudioProvider>
        </ChapterSelectionProvider>
      </BookProvider>
    </SynthesisProvider>
  );
}
