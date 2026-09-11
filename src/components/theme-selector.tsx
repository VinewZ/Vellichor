import { Monitor, Moon, Sun } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Theme } from "@/providers/theme-provider";
import { useTheme } from "@/providers/theme-provider";

const OPTIONS: Array<{
	value: Theme;
	label: string;
	icon: typeof Sun;
}> = [
	{ value: "light", label: "Light", icon: Sun },
	{ value: "dark", label: "Dark", icon: Moon },
	{ value: "system", label: "System", icon: Monitor },
];

export function ThemeSelector({ className }: { className?: string }) {
	const { theme, setTheme } = useTheme();

	return (
		<div
			className={cn(
				"inline-flex items-center gap-1 rounded-base border-2 border-border bg-secondary-background p-1 shadow-shadow",
				className,
			)}
		>
			{OPTIONS.map(({ value, label, icon: Icon }) => {
				const active = theme === value;
				return (
					<button
						key={value}
						type="button"
						title={`${label} theme`}
						aria-label={`${label} theme`}
						aria-pressed={active}
						onClick={() => setTheme(value)}
						className={cn(
							"flex cursor-pointer items-center gap-1.5 rounded-base px-3 py-1.5 font-base text-sm transition-colors",
							active
								? "bg-main text-main-foreground"
								: "text-foreground hover:bg-main/15",
						)}
					>
						<Icon className="size-4" aria-hidden />
						<span className="hidden sm:inline">{label}</span>
					</button>
				);
			})}
		</div>
	);
}
