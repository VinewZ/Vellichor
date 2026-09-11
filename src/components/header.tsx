import { ThemeSelector } from "./theme-selector";

export function Header() {
	return (
		<header className="mb-12 flex flex-col items-center justify-center gap-5 border-b bg-background p-8 text-center md:flex-row md:justify-between md:text-left dark:bg-secondary-background">
			<h1 className="font-bold text-4xl uppercase">
				Vellichor
				<br />
				EPUB / PDF to Audiobook
			</h1>
			<ThemeSelector />
		</header>
	);
}
