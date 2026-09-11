# Vellichor — frontend for Kokoro TTS

Turn PDF / EPUB books into chapter-by-chapter audiobooks and a tagged `.m4b`.

This is a web frontend for [Kokoro TTS](https://github.com/hwdsl2/docker-kokoro) — it does no inference itself, it only sends text chunks to a running Kokoro server (`POST /v1/audio/speech`) and assembles the returned audio.

Upload a book → pick a voice → render chapters server-side → preview per-chapter audio → export a single M4B with chapter marks, book metadata, and cover art.

## Features

- **Book parsing (client-side):**
  - PDF via `pdfjs-dist` (title/author, outline → chapters, first page → cover JPEG).
  - EPUB via `jszip` (dc:title/creator/publisher/date, nav/NCX → TOC, cover-image lookup).
  - 100 MB limit, word count + audio ETA, fingerprint `fileName--sizeMB` for disk cache.
- **Voices & synthesis:**
  - Voice list + preview (`/api/voices`, `/api/speech`), model / speed / volume / format controls.
- **Chapter rendering (server-side):**
  - Sentence-aware chunking (`Intl.Segmenter` + line-break preservation, ~3800 chars, Kokoro 4000-char hard limit).
  - Sequential render per chapter, chunk → Kokoro `POST /v1/audio/speech` → concat → `ch-XX.mp3`.
  - Disk layout: `data/books/<fingerprint>/ch-*.mp3 + manifest.json`.
  - Resume done chapters, poll job status, cancel, clear render (`DELETE /api/render?fingerprint=`).
- **M4B export:**
  - `ffprobe` durations → `chapters.meta` (`FFMETADATA1` + `[CHAPTER]`).
  - Global tags: `title / artist / album / album_artist / author / publisher / date / year / comment`.
  - Cover: client blob → base64 (≤5 MB, JPEG/PNG only, SVG skipped) → `cover.jpg/png` → ffmpeg `-disposition:v attached_pic`. Falls back to audio-only on bad cover.
  - `ffmpeg -f concat + -map_metadata 1 -c:a aac 128k -movflags +faststart book.m4b`.

## Getting Started

```bash
bun install
bun run dev   # vite dev --port 3000
```

Requires for render/export:

- [Kokoro TTS](https://github.com/hwdsl2/docker-kokoro) reachable at `KOKORO_BASE_URL` (default `http://127.0.0.1:8880`).
- `ffmpeg` + `ffprobe` on PATH (or via `FFMPEG_PATH` / `FFPROBE_PATH`).

```bash
KOKORO_BASE_URL=http://127.0.0.1:8880 \
DATA_DIR=./data \
FFMPEG_PATH=ffmpeg FFPROBE_PATH=ffprobe \
bun run dev
```

## Building For Production

```bash
bun run build
bun run preview
```

## API Routes (`src/routes/api/`)

- `POST /api/render` — `{ fingerprint, fileName, voice, synthesis, chapters[] }` → `{ jobId }`. Restores done chapters from `manifest.json`.
- `GET /api/render?id=<jobId>` — job snapshot. `GET /api/render?fingerprint=` — manifest read.
- `DELETE /api/render?id=` — cancel. `DELETE /api/render?fingerprint=` — abort + `rm -rf bookDir`.
- `POST /api/export` — `{ fingerprint, title, metadata {title, author?, publisher?, date?, fileName?}, cover? {dataBase64, mime} }` → `audio/mp4` download. Cover must be JPEG/PNG base64 ≤ ~7 MB string.
- `GET /api/files?fingerprint=&chapter=` — stream chapter MP3. Also `/api/speech`, `/api/voices` (Kokoro proxy).

Verify an export:

```bash
ffprobe -show_entries format_tags -show_entries stream=codec_name,disposition book.m4b
```

## Project Layout

- `src/lib/parse-pdf.ts`, `parse-epub.ts`, `book.ts` — parsing + `ParsedBook` / `ExportMetadata` types.
- `src/lib/chapter-audio.ts`, `synthesis.ts` — chunking, locale map, speech request builder.
- `src/lib/server/render-jobs.ts` — job runner, manifest, `exportM4b()`.
- `src/hooks/useBook.tsx`, `useChapterSelection.tsx`, `useSynthesis.tsx`, `useChapterAudio.tsx` — app state.
- `src/components/book-upload.tsx`, `voice-selection.tsx`, `chapters.tsx`, `mixer.tsx`, `synthesis-controls.tsx` — UI.
- `src/routes/api/` — TanStack Start server handlers.
