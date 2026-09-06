import { ThemeSelector } from "./theme-selector";

export function Header() {
	return (
		<header className="flex items-center justify-between mb-12">
			<h1 className="text-4xl font-bold uppercase">
				Page Voice
				<br />
				EPUB / PDF to Audiobook Studio
			</h1>
			<ThemeSelector />
		</header>
	);
}
