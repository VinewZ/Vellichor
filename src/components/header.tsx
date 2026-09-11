import { ThemeSelector } from "./theme-selector";

export function Header() {
	return (
		<header className="mb-12 flex items-center justify-between border-b bg-background p-8 dark:bg-secondary-background">
			<h1 className="font-bold text-4xl uppercase">
				Vellichor
				<br />
				EPUB / PDF to Audiobook
			</h1>
			<ThemeSelector />
		</header>
	);
}
