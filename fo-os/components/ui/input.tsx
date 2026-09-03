import * as React from "react";
import { cn } from "@/lib/utils";

export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(({ className, ...props }, ref) => (
  <input
    ref={ref}
    className={cn(
      "h-8 w-full rounded-md border border-border bg-card px-3 text-[13px] text-foreground placeholder:text-muted-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-strong",
      className,
    )}
    {...props}
  />
));
Input.displayName = "Input";

export function NativeSelect({ className, ...props }: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      className={cn(
        "h-8 rounded-md border border-border bg-card px-2.5 pr-7 text-[13px] text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-strong",
        className,
      )}
      {...props}
    />
  );
}
