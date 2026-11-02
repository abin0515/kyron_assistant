import { cn } from "@/lib/utils";

export function JsonBlock({
  className,
  label,
  value,
}: {
  className?: string;
  label: string;
  value: unknown;
}) {
  const text = typeof value === "string" ? value : JSON.stringify(value, null, 2);

  return (
    <pre
      aria-label={label}
      className={cn(
        "max-h-96 overflow-auto rounded-lg border border-border/80 bg-surface-subtle p-3 font-mono text-xs leading-relaxed whitespace-pre-wrap break-words",
        className,
      )}
      tabIndex={0}
    >
      {text}
    </pre>
  );
}
