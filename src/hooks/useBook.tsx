import {
	createContext,
	useCallback,
	useContext,
	useMemo,
	useRef,
	useState,
} from "react";
import { type ParsedBook, revokeCoverUrl } from "@/lib/book";

interface BookContextValue {
	book: ParsedBook | null;
	isParsing: boolean;
	error: string | null;
	parseFile: (file: File | undefined) => void;
	clearBook: () => void;
}

const BookContext = createContext<BookContextValue | null>(null);

const MAX_FILE_BYTES = 100 * 1024 * 1024;

export function BookProvider({ children }: { children: React.ReactNode }) {
	const [book, setBook] = useState<ParsedBook | null>(null);
	const [isParsing, setIsParsing] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const parsingRef = useRef(false);

	const parseFile = useCallback((file: File | undefined) => {
		if (!file || parsingRef.current) return;
		const ext = file.name.split(".").pop()?.toLowerCase();
		const isPdf = ext === "pdf" || file.type === "application/pdf";
		const isEpubFile = ext === "epub" || file.type === "application/epub+zip";
		if (!isPdf && !isEpubFile) {
			setError("Only .pdf and .epub files are supported.");
			return;
		}
		if (file.size > MAX_FILE_BYTES) {
			setError("File is too large. Max 100 MB.");
			return;
		}
		parsingRef.current = true;
		setError(null);
		setIsParsing(true);
		(isPdf
			? import("@/lib/parse-pdf").then((m) => m.parsePdf(file))
			: import("@/lib/parse-epub").then((m) => m.parseEpub(file))
		)
			.then(
				(parsed) => {
					setBook((prev) => {
						revokeCoverUrl(prev?.coverUrl);
						return parsed;
					});
				},
				(e: unknown) => {
					setError(e instanceof Error ? e.message : "Could not parse file.");
				},
			)
			.finally(() => {
				parsingRef.current = false;
				setIsParsing(false);
			});
	}, []);

	const clearBook = useCallback(() => {
		setBook((prev) => {
			revokeCoverUrl(prev?.coverUrl);
			return null;
		});
		setError(null);
	}, []);

	const value = useMemo(
		() => ({ book, isParsing, error, parseFile, clearBook }),
		[book, isParsing, error, parseFile, clearBook],
	);

	return <BookContext.Provider value={value}>{children}</BookContext.Provider>;
}

export function useBook(): BookContextValue {
	const ctx = useContext(BookContext);
	if (!ctx) throw new Error("useBook must be used within a BookProvider");
	return ctx;
}
