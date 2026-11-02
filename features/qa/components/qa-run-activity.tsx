import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatDateTime, formatTokens } from "@/features/qa/labels";
import { cn } from "@/lib/utils";
import type { QaActivity, QaRunDetailResponse } from "@/types/api";

export function QaRunActivity({ detail }: { detail: QaRunDetailResponse }) {
  const { run, snapshot } = detail;
  const purposes = Object.entries(run.usageByPurpose);

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle>Timeline</CardTitle>
        </CardHeader>
        <CardContent>
          <ol className="grid max-h-96 gap-2 overflow-auto text-sm">
            {[...run.events].reverse().map((event, index) => (
              <li className="grid gap-0.5" key={`${event.at}-${index}`}>
                <span className="text-xs text-muted-foreground">{formatDateTime(event.at)}</span>
                <span
                  className={cn(
                    event.level === "error" && "text-destructive",
                    event.level === "warn" && "text-warning-foreground",
                  )}
                >
                  {event.message}
                </span>
              </li>
            ))}
          </ol>
          {purposes.length > 0 ? (
            <div className="mt-4 grid gap-1 border-t border-border/80 pt-3 text-xs text-muted-foreground">
              <p className="font-medium text-foreground">Model usage by step</p>
              {purposes.map(([purpose, usage]) => (
                <p key={purpose}>
                  {purpose}: {usage.calls} call(s), {formatTokens(usage.inputTokens)} in /{" "}
                  {formatTokens(usage.outputTokens)} out
                </p>
              ))}
            </div>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Lesson snapshot</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-2 text-sm">
          {snapshot ? (
            <>
              <p className="text-xs text-muted-foreground">
                {snapshot.activities.length} activities · {snapshot.references.length} reference(s) ·
                imported {formatDateTime(snapshot.createdAt)} · hash {snapshot.contentHash.slice(0, 10)}
              </p>
              {snapshot.missingFields.length > 0 ? (
                <p className="text-xs text-warning-foreground">
                  Missing: {snapshot.missingFields.map((field) => `${field.activityId ?? "lesson"} ${field.field}`).join(", ")}
                </p>
              ) : null}
              {snapshot.activities.map((activity) => (
                <ActivityDetails activity={activity} key={activity.id} />
              ))}
            </>
          ) : (
            <p className="text-muted-foreground">The lesson has not been read yet.</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function ActivityDetails({ activity }: { activity: QaActivity }) {
  return (
    <details className="rounded-lg border border-border/80 px-3 py-2">
      <summary className="cursor-pointer">
        <span className="font-mono text-xs">{activity.id}</span> · {activity.type}
        {activity.title ? ` · ${activity.title}` : ""}
      </summary>
      <dl className="mt-2 grid gap-1.5">
        {activity.narration ? <Field label="Narration" text={activity.narration} /> : null}
        {activity.onScreenText ? <Field label="On-screen text" text={activity.onScreenText} /> : null}
        {activity.question ? (
          <Field
            label="Question"
            text={[
              activity.question.prompt,
              ...activity.question.options.map((option) => `${option.id}. ${option.text}`),
              `Key: ${activity.question.answerKey.join(", ") || "none"}`,
            ].join("\n")}
          />
        ) : null}
        {activity.tutorGuidance ? <Field label="Tutor guidance" text={activity.tutorGuidance} /> : null}
      </dl>
    </details>
  );
}

function Field({ label, text }: { label: string; text: string }) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="whitespace-pre-wrap">{text}</dd>
    </div>
  );
}
