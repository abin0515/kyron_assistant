import { CheckCircle2, Circle } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { assetAnchor, type ReportTopic } from "@/features/template-review/report";
import type { QaActivity, QaRunDetailResponse } from "@/types/api";

// The generated template as QA last checked it, grouped by topic: every
// asset's scenes (title, on-screen text, narration) and questions.
export function TemplateContent({ detail, topics }: { detail: QaRunDetailResponse; topics: ReportTopic[] }) {
  const activities = new Map((detail.snapshot?.activities ?? []).map((activity) => [activity.id, activity]));

  return (
    <Card>
      <CardHeader>
        <CardTitle>Template</CardTitle>
        <CardDescription>
          The lesson Kyron generated, after QA&apos;s fixes. This is what the videos will narrate and show.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-6">
        {topics.map((topic) => (
          <section className="grid gap-3" key={topic.key}>
            <h3 className="text-base font-medium">{topic.topic}</h3>
            {topic.assets.map((asset) => {
              const activity = activities.get(asset.activityId);

              return activity ? <AssetBlock activity={activity} kindLabel={asset.kindLabel} key={asset.activityId} /> : null;
            })}
          </section>
        ))}
      </CardContent>
    </Card>
  );
}

function AssetBlock({ activity, kindLabel }: { activity: QaActivity; kindLabel: string }) {
  const scenes = activity.scenes ?? [];

  return (
    <article className="grid scroll-mt-24 gap-3 rounded-lg border border-border/80 p-4" id={assetAnchor(activity.id)}>
      <header className="flex flex-wrap items-center gap-2">
        <Badge variant="outline">{kindLabel}</Badge>
        <h4 className="text-sm font-medium">{activity.title ?? `Activity ${activity.id}`}</h4>
      </header>
      {scenes.length > 0 ? (
        <ol className="grid gap-2">
          {scenes.map((scene, index) => (
            <li className="grid gap-1 rounded-md bg-muted/40 p-3 text-sm" key={scene.id}>
              <p className="text-xs font-medium text-muted-foreground">
                Scene {index + 1}
                {scene.title ? ` · ${scene.title}` : ""}
              </p>
              {scene.onScreenText ? (
                <p className="whitespace-pre-wrap">
                  <span className="text-xs font-medium text-muted-foreground">On screen: </span>
                  {scene.onScreenText}
                </p>
              ) : null}
              {scene.narration ? <p className="leading-relaxed whitespace-pre-wrap">{scene.narration}</p> : null}
            </li>
          ))}
        </ol>
      ) : activity.narration ? (
        <p className="text-sm leading-relaxed whitespace-pre-wrap">{activity.narration}</p>
      ) : null}
      {activity.question ? <QuestionBlock activity={activity} /> : null}
    </article>
  );
}

function QuestionBlock({ activity }: { activity: QaActivity }) {
  const question = activity.question;

  if (!question) {
    return null;
  }

  return (
    <div className="grid gap-2 text-sm">
      <p>
        <span className="text-xs font-medium text-muted-foreground">Question: </span>
        {question.prompt}
      </p>
      {question.options.length > 0 ? (
        <ul className="grid gap-1">
          {question.options.map((option) => (
            <li className="flex items-start gap-2" key={option.id}>
              {question.answerKey.includes(option.id) ? (
                <CheckCircle2 aria-label="Correct" className="mt-0.5 size-4 shrink-0 text-success" />
              ) : (
                <Circle aria-label="Incorrect" className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
              )}
              <span>{option.text}</span>
            </li>
          ))}
        </ul>
      ) : null}
      {question.rationale ? (
        <p className="text-muted-foreground">
          <span className="text-xs font-medium">{question.options.length > 0 ? "Explanation" : "Model answer"}: </span>
          {question.rationale}
        </p>
      ) : null}
    </div>
  );
}
