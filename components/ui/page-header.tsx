import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

export function PageHeader({
  actions,
  className,
  description,
  eyebrow,
  title,
}: {
  actions?: ReactNode;
  className?: string;
  description?: ReactNode;
  eyebrow?: ReactNode;
  title: ReactNode;
}) {
  return (
    <header
      className={cn(
        "flex flex-col justify-between gap-5 sm:flex-row sm:items-end",
        className,
      )}
    >
      <div className="min-w-0 max-w-3xl">
        {eyebrow ? <div className="mb-4">{eyebrow}</div> : null}
        <h1 className="font-heading text-[1.875rem] leading-[1.15] font-light tracking-[-0.025em] text-foreground">
          {title}
        </h1>
        {description ? (
          <div className="mt-2 text-sm leading-relaxed text-muted-foreground">
            {description}
          </div>
        ) : null}
      </div>
      {actions ? (
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          {actions}
        </div>
      ) : null}
    </header>
  );
}
