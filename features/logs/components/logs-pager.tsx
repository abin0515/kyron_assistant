import { Button } from "@/components/ui/button";
import type { PaginationMeta } from "@/types/api";

export function LogsPager({
  onPage,
  pagination,
}: {
  onPage: (page: number) => void;
  pagination: PaginationMeta;
}) {
  if (pagination.totalPages <= 1) {
    return null;
  }

  return (
    <div className="mt-3 flex items-center justify-between gap-2 border-t border-border/80 pt-3 text-sm">
      <span className="text-muted-foreground">
        Page {pagination.page} of {pagination.totalPages} · {pagination.totalCount} total
      </span>
      <div className="flex gap-2">
        <Button
          disabled={pagination.page <= 1}
          onClick={() => onPage(pagination.page - 1)}
          size="sm"
          type="button"
          variant="outline"
        >
          Newer
        </Button>
        <Button
          disabled={pagination.page >= pagination.totalPages}
          onClick={() => onPage(pagination.page + 1)}
          size="sm"
          type="button"
          variant="outline"
        >
          Older
        </Button>
      </div>
    </div>
  );
}
