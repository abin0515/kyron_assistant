import { AlertTriangle, Check } from "lucide-react";
import Link from "next/link";

import type { CourseStep } from "@/features/template-review/steps";
import { cn } from "@/lib/utils";

// The five steps of a course: upload and prompt → plan → Kyron template →
// review and approve → video.
export function CourseStepBar({ steps }: { steps: CourseStep[] }) {
  return (
    <nav aria-label="Course steps">
      <ol className="grid gap-2 sm:grid-cols-5">
        {steps.map((step, index) => (
          <li key={step.key}>
            <Link
              aria-current={step.state === "current" ? "step" : undefined}
              className={cn(
                "grid h-full gap-1 rounded-lg border px-3 py-2 text-sm hover:bg-muted/50",
                step.state === "current" && "border-primary/60 bg-accent",
                step.state === "attention" && "border-warning/40 bg-warning/5",
                step.state !== "current" && step.state !== "attention" && "border-border/80",
              )}
              href={step.href}
            >
              <span className="flex items-center gap-2 font-medium">
                <StepMarker index={index} state={step.state} />
                {step.label}
              </span>
              <span className="text-xs text-muted-foreground">{step.detail}</span>
            </Link>
          </li>
        ))}
      </ol>
    </nav>
  );
}

function StepMarker({ index, state }: { index: number; state: CourseStep["state"] }) {
  if (state === "done") {
    return (
      <span className="grid size-5 shrink-0 place-items-center rounded-full bg-success/15 text-success-foreground">
        <Check aria-label="Done" className="size-3" />
      </span>
    );
  }

  if (state === "attention") {
    return (
      <span className="grid size-5 shrink-0 place-items-center rounded-full bg-warning/15 text-warning-foreground">
        <AlertTriangle aria-label="Needs attention" className="size-3" />
      </span>
    );
  }

  return (
    <span
      className={cn(
        "grid size-5 shrink-0 place-items-center rounded-full text-[0.7rem] font-semibold",
        state === "current" ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground",
      )}
    >
      {index + 1}
    </span>
  );
}
