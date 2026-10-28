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
    <Badge className="shrink-0" variant={details.variant}>
      {details.icon}
      {details.label}
    </Badge>
  );
}

const STATUS_DETAILS: Record<
  DisplayDraftStatus,
  {
    icon: React.ReactNode;
    label: string;
    variant: "neutral" | "info" | "success" | "warning" | "destructive";
  }
> = {
  editing: {
    label: "Editing",
    icon: <PencilLine aria-hidden="true" />,
    variant: "neutral",
  },
  generating: {
    label: "Generating",
    icon: <LoaderCircle aria-hidden="true" className="animate-spin" />,
    variant: "info",
  },
  complete: {
    label: "Complete",
    icon: <CircleCheck aria-hidden="true" />,
    variant: "success",
  },
  attention: {
    label: "Needs attention",
    icon: <TriangleAlert aria-hidden="true" />,
    variant: "warning",
  },
  not_found: {
    label: "Not found in Kyron",
    icon: <CircleX aria-hidden="true" />,
    variant: "destructive",
  },
};
