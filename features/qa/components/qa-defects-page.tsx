"use client";

import { Download, LoaderCircle } from "lucide-react";
import Link from "next/link";
import { useEffect, useState, type FormEvent } from "react";

import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { InlineNotice } from "@/components/ui/inline-notice";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/ui/page-header";
import { Textarea } from "@/components/ui/textarea";
import { createQaDefect, defectsExportUrl, listQaDefects } from "@/features/qa/api";
import { SeverityBadge } from "@/features/qa/components/qa-badges";
import { formatDateTime, messageFromError } from "@/features/qa/labels";
import type { CreateQaDefectRequest, QaDefect, QaDefectCategory, QaDefectStage, QaSeverity } from "@/types/api";

const CATEGORIES: Record<QaDefectCategory, string> = {
  qa_missed: "QA missed a problem",
  false_alarm: "False alarm",
  wrong_fix: "Wrong or harmful fix",
  harness_bug: "Harness bug",
  kyron_output: "Kyron generation error",
  source_problem: "Source or extraction problem",
  cost_or_performance: "Cost or performance",
};
const STAGES: Record<QaDefectStage, string> = {
  setup: "Course setup",
  lesson: "Generated lesson",
  video: "Video",
  harness: "Harness",
};
const SELECT_CLASS = "h-9 rounded-md border border-input bg-background px-2 text-sm";

type DefectsState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; defects: QaDefect[] };

// The defect library: problems found while testing, logged by reviewers or
// captured from rejected findings and failed audits. Exported, it becomes
// the testing sets.
export function QaDefectsPage() {
  const [state, setState] = useState<DefectsState>({ status: "loading" });
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    const controller = new AbortController();

    async function load() {
      try {
        const { defects } = await listQaDefects(controller.signal);

        if (!controller.signal.aborted) {
          setState({ status: "ready", defects });
        }
      } catch (error) {
        if (!controller.signal.aborted) {
          setState({ status: "error", message: messageFromError(error, "Defects could not be loaded.") });
        }
      }
    }

    void load();

    return () => controller.abort();
  }, [refreshKey]);

  return (
    <div className="grid gap-6">
      <PageHeader
        description="Every problem found while testing the harness: what QA missed, false alarms, wrong fixes, harness bugs and Kyron output errors. Rejected findings and failed audits are added automatically."
        title="Defects"
      />
      <DefectForm onCreated={() => setRefreshKey((key) => key + 1)} />
      <div className="flex justify-end gap-2">
        <a className={buttonVariants({ size: "sm", variant: "outline" })} href={defectsExportUrl("csv")}>
          <Download aria-hidden="true" />
          CSV
        </a>
        <a className={buttonVariants({ size: "sm", variant: "outline" })} href={defectsExportUrl("json")}>
          <Download aria-hidden="true" />
          JSON
        </a>
      </div>
      {state.status === "loading" ? (
        <p className="flex items-center gap-2 text-sm text-muted-foreground" role="status">
          <LoaderCircle aria-hidden="true" className="size-4 animate-spin" />
          Loading defects…
        </p>
      ) : null}
      {state.status === "error" ? <InlineNotice tone="error">{state.message}</InlineNotice> : null}
      {state.status === "ready" ? (
        <Card>
          <CardContent>
            {state.defects.length === 0 ? (
              <p className="text-sm text-muted-foreground">No defects logged yet.</p>
            ) : (
              <ul className="grid divide-y divide-border/80">
                {state.defects.map((defect) => (
                  <DefectRow defect={defect} key={defect.id} />
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}

function DefectRow({ defect }: { defect: QaDefect }) {
  return (
    <li className="grid gap-1 py-3 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        <SeverityBadge severity={defect.severity} />
        <Badge variant="outline">{CATEGORIES[defect.category]}</Badge>
        <Badge variant="neutral">{STAGES[defect.stage]}</Badge>
        <span className="font-medium">{defect.title}</span>
      </div>
      {defect.expected || defect.actual ? (
        <p className="text-muted-foreground">
          {defect.expected ? `Expected: ${defect.expected} ` : ""}
          {defect.actual ? `Actual: ${defect.actual}` : ""}
        </p>
      ) : null}
      {defect.evidence ? <p className="text-xs text-muted-foreground">Evidence: {defect.evidence}</p> : null}
      <p className="flex flex-wrap gap-3 text-xs text-muted-foreground">
        <span>
          {defect.origin === "reviewer" ? `Logged by ${defect.createdBy}` : defect.origin === "audit" ? "From an audit" : "From a rejected finding"} ·{" "}
          {formatDateTime(defect.createdAt)}
        </span>
        {defect.runId ? (
          <Link className="text-primary hover:underline" href={`/qa/runs/${defect.runId}`}>
            QA run
          </Link>
        ) : null}
      </p>
    </li>
  );
}

function DefectForm({ onCreated }: { onCreated: () => void }) {
  const [form, setForm] = useState<CreateQaDefectRequest>({
    stage: "lesson",
    category: "qa_missed",
    severity: "major",
    title: "",
    expected: "",
    actual: "",
    evidence: "",
    workspaceId: null,
    runId: null,
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = <K extends keyof CreateQaDefectRequest>(key: K, value: CreateQaDefectRequest[K]) =>
    setForm((current) => ({ ...current, [key]: value }));

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!form.title.trim()) {
      setError("Give the defect a short title.");
      return;
    }

    setSaving(true);
    setError(null);

    try {
      await createQaDefect(form);
      setForm((current) => ({ ...current, title: "", expected: "", actual: "", evidence: "", runId: null }));
      onCreated();
    } catch (caught) {
      setError(messageFromError(caught, "The defect could not be saved."));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Log a defect</CardTitle>
        <CardDescription>For problems a reviewer finds that QA missed or got wrong.</CardDescription>
      </CardHeader>
      <CardContent>
        <form className="grid gap-3" onSubmit={(event) => void handleSubmit(event)}>
          <div className="grid gap-3 sm:grid-cols-3">
            <label className="grid gap-1 text-sm font-medium">
              Stage
              <select className={SELECT_CLASS} onChange={(event) => set("stage", event.target.value as QaDefectStage)} value={form.stage}>
                {Object.entries(STAGES).map(([value, label]) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </select>
            </label>
            <label className="grid gap-1 text-sm font-medium">
              Category
              <select className={SELECT_CLASS} onChange={(event) => set("category", event.target.value as QaDefectCategory)} value={form.category}>
                {Object.entries(CATEGORIES).map(([value, label]) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </select>
            </label>
            <label className="grid gap-1 text-sm font-medium">
              Severity
              <select className={SELECT_CLASS} onChange={(event) => set("severity", event.target.value as QaSeverity)} value={form.severity}>
                <option value="critical">Critical</option>
                <option value="major">Major</option>
                <option value="minor">Minor</option>
              </select>
            </label>
          </div>
          <label className="grid gap-1 text-sm font-medium">
            Title
            <Input maxLength={200} onChange={(event) => set("title", event.target.value)} value={form.title} />
          </label>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="grid gap-1 text-sm font-medium">
              Expected
              <Textarea onChange={(event) => set("expected", event.target.value)} value={form.expected} />
            </label>
            <label className="grid gap-1 text-sm font-medium">
              Actual
              <Textarea onChange={(event) => set("actual", event.target.value)} value={form.actual} />
            </label>
          </div>
          <label className="grid gap-1 text-sm font-medium">
            Evidence (quote, content version or QA run)
            <Input onChange={(event) => set("evidence", event.target.value)} value={form.evidence} />
          </label>
          <label className="grid gap-1 text-sm font-medium">
            QA run ID (optional)
            <Input
              onChange={(event) => set("runId", /^[0-9a-f-]{36}$/i.test(event.target.value.trim()) ? event.target.value.trim() : null)}
              placeholder="e.g. ad7fdfe6-07e9-45d5-9665-526bc1e75b16"
            />
          </label>
          {error ? <p className="text-sm text-destructive">{error}</p> : null}
          <div>
            <Button disabled={saving} size="sm" type="submit">
              {saving ? <LoaderCircle aria-hidden="true" className="animate-spin" /> : null}
              Log defect
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
