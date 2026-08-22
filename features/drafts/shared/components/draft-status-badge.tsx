import {
  CircleCheck,
  CircleX,
  LoaderCircle,
  PencilLine,
  TriangleAlert,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import type { DisplayDraftStatus } from "@/features/drafts/shared/status";

export function DraftStatusBadge({
  status,
}: {
  status: DisplayDraftStatus;
}) {
  const details = STATUS_DETAILS[status];

  return (
    <Badge className={`${details.className} shrink-0`} variant="outline">
      {details.icon}
      {details.label}
    </Badge>
  );
}

const STATUS_DETAILS: Record<
  DisplayDraftStatus,
  { className: string; icon: React.ReactNode; label: string }
> = {
  editing: {
    label: "Editing",
    icon: <PencilLine aria-hidden="true" />,
    className: "border-transparent bg-muted text-secondary-foreground",
  },
  generating: {
    label: "Generating",
    icon: <LoaderCircle aria-hidden="true" className="animate-spin" />,
    className:
      "border-transparent bg-secondary-foreground text-primary-foreground",
  },
  complete: {
    label: "Complete",
    icon: <CircleCheck aria-hidden="true" />,
    className: "border-foreground bg-card text-foreground",
  },
  attention: {
    label: "Needs attention",
    icon: <TriangleAlert aria-hidden="true" />,
    className: "border-primary bg-card text-primary",
  },
  not_found: {
    label: "Not found in Kyron",
    icon: <CircleX aria-hidden="true" />,
    className: "border-primary bg-card text-primary",
  },
};
