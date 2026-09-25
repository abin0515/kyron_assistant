import * as React from "react";

import { cn } from "@/lib/utils";

function Textarea({
  className,
  ...props
}: React.ComponentProps<"textarea">) {
  return (
    <textarea
      className={cn(
        "border-input bg-card min-h-28 w-full resize-y rounded-lg border px-3.5 py-3 text-sm leading-relaxed shadow-xs outline-none transition-[border-color,box-shadow,background-color] placeholder:text-muted-foreground/70 disabled:pointer-events-none disabled:cursor-not-allowed disabled:bg-muted/50 disabled:opacity-60",
        "focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/20",
        "aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/15",
        className,
      )}
      data-slot="textarea"
      {...props}
    />
  );
}

export { Textarea };
