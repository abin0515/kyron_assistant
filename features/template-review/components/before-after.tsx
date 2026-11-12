import { diffWords, type DiffPart } from "@/features/kyron-content/word-diff";

// A change's text before and after, with the changed words marked.
export function BeforeAfter({ after, before }: { after: string; before: string | null }) {
  const parts = diffWords(before ?? "", after);

  return (
    <div className="grid gap-2 md:grid-cols-2">
      <Side label="Before" parts={parts.filter((part) => part.kind !== "added")} tone="removed" />
      <Side label="After" parts={parts.filter((part) => part.kind !== "removed")} tone="added" />
    </div>
  );
}

function Side({ label, parts, tone }: { label: string; parts: DiffPart[]; tone: "removed" | "added" }) {
  const box = tone === "removed" ? "border-destructive/20 bg-destructive/5" : "border-success/25 bg-success/5";
  const mark =
    tone === "removed"
      ? "rounded-sm bg-destructive/15 text-destructive line-through decoration-destructive/60"
      : "rounded-sm bg-success/20 font-medium text-success-foreground";

  return (
    <div className={`rounded-md border p-2 ${box}`}>
      <p className="mb-1 text-xs font-medium text-muted-foreground">{label}</p>
      <p className="text-sm leading-relaxed whitespace-pre-wrap">
        {parts.length === 0 ? <span className="text-muted-foreground">(empty)</span> : null}
        {parts.map((part, index) =>
          part.kind === "same" ? (
            <span key={index}>{part.text}</span>
          ) : (
            <mark className={mark} key={index}>
              {part.text}
            </mark>
          ),
        )}
      </p>
    </div>
  );
}
