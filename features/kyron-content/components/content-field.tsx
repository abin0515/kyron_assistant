import { Badge } from "@/components/ui/badge";
import type { KyronContentField, KyronFieldAccess } from "@/types/api";

const ACCESS: Record<KyronFieldAccess, { label: string; variant: "success" | "neutral" | "outline"; hint: string }> = {
  qa_fixes: {
    label: "QA fixes",
    variant: "success",
    hint: "The QA agent checks this field and writes fixes to Kyron automatically.",
  },
  qa_reads: {
    label: "QA reads",
    variant: "neutral",
    hint: "The QA agent checks this field but does not edit it.",
  },
  not_checked: {
    label: "Not checked",
    variant: "outline",
    hint: "Kyron returns this through MCP; the QA agent does not check it.",
  },
};

// Opens the QA change behind a revised field.
export type ShowRevision = (key: string, versionNumber: number) => void;

export function AccessBadge({ access }: { access: KyronFieldAccess }) {
  const { hint, label, variant } = ACCESS[access];

  return (
    <Badge title={hint} variant={variant}>
      {label}
    </Badge>
  );
}

// One labelled field with what QA may do with it and, when QA changed it,
// a link to that change.
export function ContentField({
  field,
  onShowRevision,
  revisedIn,
}: {
  field: KyronContentField;
  onShowRevision: ShowRevision;
  revisedIn: number | undefined;
}) {
  return (
    <div className="grid content-start gap-1">
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="text-xs font-medium text-muted-foreground">{field.label}</span>
        <AccessBadge access={field.access} />
        {revisedIn && field.key ? (
          <button
            className="rounded-4xl border border-info/30 bg-info/10 px-2 py-0.5 text-xs font-medium text-info-foreground hover:bg-info/20"
            onClick={() => onShowRevision(field.key ?? "", revisedIn)}
            type="button"
          >
            Revised by QA · v{revisedIn}
          </button>
        ) : null}
      </div>
      <p className={field.value ? "text-sm leading-relaxed whitespace-pre-wrap" : "text-sm text-muted-foreground"}>
        {field.value ?? "(empty)"}
      </p>
    </div>
  );
}

// Names the MCP tools a block of content came from.
export function ToolSource({ tools }: { tools: string[] }) {
  return (
    <span className="flex flex-wrap gap-1">
      {tools.map((tool) => (
        <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-[0.7rem] text-muted-foreground" key={tool}>
          {tool}
        </code>
      ))}
    </span>
  );
}
