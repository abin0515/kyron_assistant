import { CheckCircle2, Circle } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { KyronContentActivity, KyronContentScene } from "@/types/api";

import { AccessBadge, ContentField, type ShowRevision } from "./content-field";

// One activity as Kyron returns it: its own fields, then each scene grouped
// by the video it belongs to, then questions and tutor knowledge.
export function ActivityCard({
  activity,
  index,
  onShowRevision,
  revisedKeys,
}: {
  activity: KyronContentActivity;
  index: number;
  onShowRevision: ShowRevision;
  revisedKeys: Map<string, number>;
}) {
  const parts = groupScenes(activity.scenes);

  return (
    <Card id={`activity-${activity.id}`}>
      <CardHeader>
        <CardTitle className="flex flex-wrap items-center gap-2">
          <span className="text-muted-foreground">{index + 1}.</span>
          {activity.name || "Untitled activity"}
          <Badge variant="outline">{activity.typeLabel}</Badge>
        </CardTitle>
        <CardDescription>
          Activity {activity.id} · {activity.scenes.length} scene{activity.scenes.length === 1 ? "" : "s"}
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        {activity.fields.map((field) => (
          <ContentField
            field={field}
            key={field.label}
            onShowRevision={onShowRevision}
            revisedIn={field.key ? revisedKeys.get(field.key) : undefined}
          />
        ))}
        <AnswerOptions activity={activity} />
        {parts.map(([partLabel, scenes]) => (
          <section className="grid gap-2" key={partLabel}>
            <h4 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">{partLabel}</h4>
            <ol className="grid gap-2">
              {scenes.map((scene, sceneIndex) => (
                <li key={scene.id}>
                  <SceneRow
                    number={sceneIndex + 1}
                    onShowRevision={onShowRevision}
                    revisedKeys={revisedKeys}
                    scene={scene}
                  />
                </li>
              ))}
            </ol>
          </section>
        ))}
        <ExtraLists activity={activity} />
      </CardContent>
    </Card>
  );
}

function SceneRow({
  number,
  onShowRevision,
  revisedKeys,
  scene,
}: {
  number: number;
  onShowRevision: ShowRevision;
  revisedKeys: Map<string, number>;
  scene: KyronContentScene;
}) {
  return (
    <div className="grid gap-3 rounded-lg border border-border/80 p-3" id={`scene-${scene.id}`}>
      <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
        <span className="font-medium text-foreground">Scene {number}</span>
        <span>· {scene.id}</span>
        {scene.layout ? <span>· {scene.layout} layout</span> : null}
        <Badge variant={scene.hasVideo ? "success" : "neutral"}>{scene.hasVideo ? "Video rendered" : "No video yet"}</Badge>
        {scene.hasCaptions ? <Badge variant="neutral">Captions</Badge> : null}
      </div>
      <div className="grid gap-3 lg:grid-cols-[minmax(10rem,14rem)_minmax(12rem,1fr)_minmax(16rem,1.4fr)]">
        {scene.fields.map((field) => (
          <ContentField
            field={field}
            key={field.label}
            onShowRevision={onShowRevision}
            revisedIn={field.key ? revisedKeys.get(field.key) : undefined}
          />
        ))}
      </div>
    </div>
  );
}

function AnswerOptions({ activity }: { activity: KyronContentActivity }) {
  if (activity.options.length === 0) {
    return null;
  }

  return (
    <div className="grid gap-1">
      <span className="text-xs font-medium text-muted-foreground">Answer options</span>
      <ul className="grid gap-1 text-sm">
        {activity.options.map((option) => (
          <li className="flex items-start gap-2" key={option.id}>
            {option.correct ? (
              <CheckCircle2 aria-label="Correct" className="mt-0.5 size-4 shrink-0 text-success" />
            ) : (
              <Circle aria-label="Incorrect" className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
            )}
            <span>{option.text}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

// Model answers, the question bank and the knowledge a conversation targets.
function ExtraLists({ activity }: { activity: KyronContentActivity }) {
  return (
    <>
      {activity.modelAnswers.length > 0 ? (
        <TextList access="not_checked" items={activity.modelAnswers} title={`Model answers (${activity.modelAnswers.length})`} />
      ) : null}
      {activity.questionBank.length > 0 ? (
        <TextList access="not_checked" items={activity.questionBank} title={`Question bank (${activity.questionBank.length})`} />
      ) : null}
      {activity.knowledge.length > 0 ? (
        <details className="rounded-lg border border-border/80 px-3 py-2 text-sm">
          <summary className="flex cursor-pointer flex-wrap items-center gap-1.5">
            <span className="font-medium">Knowledge and misconceptions ({activity.knowledge.length})</span>
            <AccessBadge access="qa_reads" />
          </summary>
          <ul className="mt-2 grid gap-3">
            {activity.knowledge.map((item) => (
              <li className="grid gap-1" key={item.knowledge}>
                <p>{item.knowledge}</p>
                {item.misconceptions.length > 0 ? (
                  <p className="text-xs text-muted-foreground">Misconceptions: {item.misconceptions.join("; ")}</p>
                ) : null}
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </>
  );
}

function TextList({ access, items, title }: { access: "not_checked"; items: string[]; title: string }) {
  return (
    <details className="rounded-lg border border-border/80 px-3 py-2 text-sm">
      <summary className="flex cursor-pointer flex-wrap items-center gap-1.5">
        <span className="font-medium">{title}</span>
        <AccessBadge access={access} />
      </summary>
      <ol className="mt-2 grid list-decimal gap-1 pl-5">
        {items.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ol>
    </details>
  );
}

function groupScenes(scenes: KyronContentScene[]): Array<[string, KyronContentScene[]]> {
  const groups = new Map<string, KyronContentScene[]>();

  for (const scene of scenes) {
    groups.set(scene.partLabel, [...(groups.get(scene.partLabel) ?? []), scene]);
  }

  return [...groups];
}
