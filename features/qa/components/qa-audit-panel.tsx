"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import { InlineNotice } from "@/components/ui/inline-notice";
import { Input } from "@/components/ui/input";
import { recordQaAudit } from "@/features/qa/api";
import { formatDateTime, messageFromError } from "@/features/qa/labels";
import type { QaRun, QaRunDetailResponse } from "@/types/api";

// Randomly sampled passing runs get a full human review so missed defects
// in the "passed" stream can be measured.
export function QaAuditPanel({
  isAdmin,
  onChanged,
  run,
}: {
  isAdmin: boolean;
  onChanged: (detail: QaRunDetailResponse) => void;
  run: QaRun;
}) {
  const [note, setNote] = useState("");
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (run.audit.outcome && run.audit.outcome !== "pending") {
    return (
      <InlineNotice tone={run.audit.outcome === "pass" ? "success" : "warning"}>
        Audit: {run.audit.outcome === "pass" ? "no defects found" : "defect found"} by{" "}
        {run.audit.decidedBy} on {formatDateTime(run.audit.decidedAt)}
        {run.audit.note ? `: ${run.audit.note}` : ""}
      </InlineNotice>
    );
  }

  async function record(outcome: "pass" | "defect_found") {
    setWorking(true);
    setError(null);

    try {
      onChanged(await recordQaAudit(run.id, { outcome, note }));
    } catch (auditError) {
      setError(messageFromError(auditError, "The audit could not be saved."));
      setWorking(false);
    }
  }

  return (
    <InlineNotice tone="info">
      <div className="grid gap-2">
        <p>
          This run was selected for a random audit. Review the whole lesson in Kyron, including
          parts the agent passed, and record what you found.
        </p>
        {isAdmin ? (
          <div className="flex flex-wrap items-center gap-2">
            <Input
              aria-label="Audit note"
              className="h-9 min-w-0 flex-1 bg-card"
              onChange={(event) => setNote(event.target.value)}
              placeholder="Defect found, or what you reviewed"
              value={note}
            />
            <Button disabled={working} onClick={() => void record("pass")} size="sm" type="button" variant="outline">
              No defects
            </Button>
            <Button disabled={working} onClick={() => void record("defect_found")} size="sm" type="button" variant="outline">
              Defect found
            </Button>
          </div>
        ) : null}
        {error ? <p className="text-xs text-destructive" role="alert">{error}</p> : null}
      </div>
    </InlineNotice>
  );
}
