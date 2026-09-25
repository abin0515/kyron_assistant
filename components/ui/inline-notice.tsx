import {
  CircleAlert,
  CircleCheck,
  Info,
  TriangleAlert,
} from "lucide-react";
import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

const noticeStyles = {
  error: {
    icon: CircleAlert,
    style: "border-destructive/20 bg-destructive/5 text-destructive",
  },
  info: {
    icon: Info,
    style: "border-info/20 bg-info/5 text-info-foreground",
  },
  success: {
    icon: CircleCheck,
    style: "border-success/20 bg-success/5 text-success-foreground",
  },
  warning: {
    icon: TriangleAlert,
    style: "border-warning/25 bg-warning/5 text-warning-foreground",
  },
} as const;

export function InlineNotice({
  actions,
  children,
  className,
  tone = "info",
}: {
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
  tone?: keyof typeof noticeStyles;
}) {
  const config = noticeStyles[tone];
  const Icon = config.icon;

  return (
    <div
      className={cn(
        "flex items-start gap-2.5 rounded-lg border px-4 py-3 text-sm",
        config.style,
        className,
      )}
      role={tone === "error" ? "alert" : "status"}
    >
      <Icon aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
      <div className="min-w-0 flex-1 leading-relaxed">{children}</div>
      {actions ? <div className="shrink-0">{actions}</div> : null}
    </div>
  );
}
