import type * as React from "react";

import { cn } from "@/lib/utils";

function Input({ className, type, ...props }: React.ComponentProps<"input">) {
	return (
		<input
			type={type}
			data-slot="input"
			className={cn(
				"flex h-10 w-full rounded-base border-2 border-border bg-secondary-background px-3 py-2 font-base text-foreground text-sm selection:bg-main selection:text-main-foreground file:border-0 file:bg-transparent file:font-heading file:text-sm placeholder:text-foreground/50 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-black focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50",
				className,
			)}
			{...props}
		/>
	);
}

export { Input };
