import { ThemeSelector } from "./theme-selector";

export function Header() {
	return (
		<header className="mb-12 flex flex-col gap-5 md:flex-row md:text-left md:justify-between items-center justify-center text-center border-b bg-background p-8 dark:bg-secondary-background">
			<h1 className="font-bold text-4xl uppercase">
				Vellichor
				<br />
				EPUB / PDF to Audiobook
			</h1>
			<ThemeSelector />
		</header>
	);
}
