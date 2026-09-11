import { ThemeSelector } from "./theme-selector";

export function Header() {
	return (
		<header className="flex items-center justify-between mb-12 border-b p-8 bg-background dark:bg-secondary-background">
			<h1 className="text-4xl font-bold uppercase">
				Vellichor
				<br />
				EPUB / PDF to Audiobook
			</h1>
			<ThemeSelector />
		</header>
	);
}
