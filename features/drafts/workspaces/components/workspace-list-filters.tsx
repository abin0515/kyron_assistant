import type { DisplayDraftStatus } from "@/features/drafts/shared/status";
import type {
  DraftFilter,
  DraftRecord,
} from "@/features/drafts/workspaces/types";

const DRAFT_FILTERS: { label: string; value: DraftFilter }[] = [
  { label: "All", value: "all" },
  { label: "Editing", value: "editing" },
  { label: "In progress", value: "generating" },
  { label: "Complete", value: "complete" },
  { label: "Needs attention", value: "attention" },
];

export function WorkspaceListFilters({
  activeFilter,
  onChange,
  records,
}: {
  activeFilter: DraftFilter;
  onChange: (filter: DraftFilter) => void;
  records: DraftRecord[];
}) {
  return (
    <nav
      aria-label="Draft status filters"
      className="flex gap-2 overflow-x-auto pb-1"
    >
      {DRAFT_FILTERS.map((filter) => {
        const active = filter.value === activeFilter;
        const count = records.filter((record) =>
          matchesDraftFilter(record.status, filter.value),
        ).length;

        return (
          <button
            aria-pressed={active}
            className={
              active
                ? "flex h-9 shrink-0 items-center gap-2 rounded-lg bg-foreground px-3 text-sm font-semibold text-primary-foreground"
                : "flex h-9 shrink-0 items-center gap-2 rounded-lg border border-border bg-card px-3 text-sm font-medium text-secondary-foreground"
            }
            key={filter.value}
            onClick={() => onChange(filter.value)}
            type="button"
          >
            {filter.label}
            <span
              className={
                active
                  ? "text-xs text-primary-foreground/70"
                  : "text-xs text-muted-foreground"
              }
            >
              {count}
            </span>
          </button>
        );
      })}
    </nav>
  );
}

export function matchesDraftFilter(
  status: DisplayDraftStatus,
  filter: DraftFilter,
): boolean {
  if (filter === "all") {
    return true;
  }

  if (filter === "attention") {
    return status === "attention" || status === "not_found";
  }

  return status === filter;
}

export function draftFilterDescription(filter: DraftFilter): string {
  return filter === "all"
    ? "saved drafts"
    : `${draftFilterLabel(filter).toLowerCase()} drafts`;
}

export function draftFilterHeading(filter: DraftFilter): string {
  return `${draftFilterLabel(filter)} drafts`;
}

export function draftFilterLabel(filter: DraftFilter): string {
  return DRAFT_FILTERS.find((item) => item.value === filter)?.label ?? "All";
}
