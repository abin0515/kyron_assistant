"use client";

import { useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { recordQaHumanCheck } from "@/features/qa/api";
import { formatDateTime, messageFromError } from "@/features/qa/labels";
import type { QaHumanCheck, QaRun, QaRunDetailResponse } from "@/types/api";

export function QaHumanChecksPanel({
  isAdmin,
  onChanged,
  run,
}: {
  isAdmin: boolean;
  onChanged: (detail: QaRunDetailResponse) => void;
  run: QaRun;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Human checks</CardTitle>
        <CardDescription>
          The tutor runtime and rendered visuals cannot be tested automatically yet. A person
          records them after previewing the lesson in Kyron.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-3">
        {run.humanChecks.map((check) => (
          <HumanCheckRow check={check} isAdmin={isAdmin} key={check.criterionId} onChanged={onChanged} runId={run.id} />
        ))}
      </CardContent>
    </Card>
  );
}

function HumanCheckRow({
  check,
  isAdmin,
  onChanged,
  runId,
}: {
  check: QaHumanCheck;
  isAdmin: boolean;
  onChanged: (detail: QaRunDetailResponse) => void;
  runId: string;
}) {
  const [note, setNote] = useState(check.note ?? "");
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function record(status: "pass" | "fail") {
    setWorking(true);
    setError(null);

    try {
      onChanged(await recordQaHumanCheck(runId, check.criterionId, { status, note }));
    } catch (recordError) {
      setError(messageFromError(recordError, "The check could not be saved."));
    } finally {
      setWorking(false);
    }
  }

  return (
    <div className="grid gap-2 rounded-lg border border-border/80 p-3 text-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="font-medium">{check.title}</p>
        <Badge variant={check.status === "pass" ? "success" : check.status === "fail" ? "destructive" : "warning"}>
          {check.status === "pending" ? "Not done" : check.status === "pass" ? "Pass" : "Fail"}
        </Badge>
      </div>
      {check.decidedBy ? (
        <p className="text-xs text-muted-foreground">
          {check.decidedBy}, {formatDateTime(check.decidedAt)}
          {check.note ? `: ${check.note}` : ""}
        </p>
      ) : null}
      {isAdmin ? (
        <div className="flex flex-wrap items-center gap-2">
          <Input
            aria-label={`Note for ${check.title}`}
            className="h-9 min-w-0 flex-1"
            onChange={(event) => setNote(event.target.value)}
            placeholder="What you tested (optional)"
            value={note}
          />
          <Button disabled={working} onClick={() => void record("pass")} size="sm" type="button" variant="outline">
            Pass
          </Button>
          <Button disabled={working} onClick={() => void record("fail")} size="sm" type="button" variant="ghost">
            Fail
          </Button>
        </div>
      ) : null}
      {error ? <p className="text-xs text-destructive" role="alert">{error}</p> : null}
    </div>
  );
}
