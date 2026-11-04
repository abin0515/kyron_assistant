import type { ReactNode } from "react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { KyronDraftContentResponse } from "@/types/api";

import { ActivityCard } from "./activity-card";
import { AccessBadge, ContentField, type ShowRevision, ToolSource } from "./content-field";

// Tab A: the draft as read through Kyron MCP, block by block, each naming the
// tools it came from and what the QA agent may do with each field.
export function DraftContentPanel({
  content,
  onShowRevision,
  revisedKeys,
}: {
  content: KyronDraftContentResponse;
  onShowRevision: ShowRevision;
  revisedKeys: Map<string, number>;
}) {
  const fieldProps = { onShowRevision, revisedKeys };

  return (
    <div className="grid gap-4">
      <Block source={["get_lesson_collection", "get_lesson", "get_lesson_lock_version"]} title="Lesson">
        <div className="grid gap-4 md:grid-cols-2">
          {content.lessonFields.map((field) => (
            <ContentField
              field={field}
              key={field.label}
              onShowRevision={onShowRevision}
              revisedIn={field.key ? revisedKeys.get(field.key) : undefined}
            />
          ))}
        </div>
      </Block>

      <Block badge={<AccessBadge access="not_checked" />} source={["get_lesson"]} title="Presentation">
        <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2 lg:grid-cols-3">
          {content.presentation.map((item) => (
            <div className="grid gap-0.5" key={item.label}>
              <dt className="text-xs text-muted-foreground">{item.label}</dt>
              <dd>{item.value}</dd>
            </div>
          ))}
        </dl>
      </Block>

      <Block source={["list_lesson_sections"]} title={`Sections (${content.sections.length})`}>
        <SectionList content={content} />
      </Block>

      {content.misconceptions.length > 0 ? (
        <Block
          badge={<AccessBadge access="not_checked" />}
          source={["get_lesson"]}
          title={`Lesson misconceptions (${content.misconceptions.length})`}
        >
          <MisconceptionList content={content} />
        </Block>
      ) : null}

      <div className="grid gap-1">
        <h2 className="text-base font-medium">Activities ({content.activities.length})</h2>
        <ToolSource tools={["list_lesson_activities", "get_lesson_activity"]} />
      </div>
      {content.activities.map((activity, index) => (
        <ActivityCard activity={activity} index={index} key={activity.id} {...fieldProps} />
      ))}

      <Block source={["list_vocabulary_items"]} title={`Vocabulary (${content.vocabulary.length})`}>
        {content.vocabulary.length === 0 ? (
          <p className="text-sm text-muted-foreground">Kyron returned no vocabulary for this lesson.</p>
        ) : (
          <ul className="grid gap-3">
            {content.vocabulary.map((entry) => (
              <li className="grid gap-2 rounded-lg border border-border/80 p-3 md:grid-cols-[minmax(10rem,16rem)_1fr]" key={entry.id}>
                <ContentField field={entry.term} onShowRevision={onShowRevision} revisedIn={revisedKeys.get(entry.term.key ?? "")} />
                <ContentField
                  field={entry.definition}
                  onShowRevision={onShowRevision}
                  revisedIn={revisedKeys.get(entry.definition.key ?? "")}
                />
              </li>
            ))}
          </ul>
        )}
      </Block>

      <Block source={["validate_lesson"]} title="Kyron's publish check">
        {content.publishCheck.length === 0 ? (
          <p className="text-sm text-muted-foreground">Kyron reports nothing blocking publication.</p>
        ) : (
          <ul className="grid gap-1 text-sm">
            {content.publishCheck.map((problem) => (
              <li className="flex flex-wrap items-center gap-2" key={problem.name}>
                <Badge variant="warning">{problem.name}</Badge>
                <span className="text-muted-foreground">
                  {problem.activityCount} activit{problem.activityCount === 1 ? "y" : "ies"}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Block>

      <Block title="Not available through MCP">
        <ul className="grid list-disc gap-1 pl-5 text-sm text-muted-foreground">
          <li>
            Lesson segments and their transcripts: <code>get_lesson_segment</code> and{" "}
            <code>get_lesson_segment_transcript</code> answer “Access forbidden” for this account.
          </li>
          <li>Video, image and caption files: Kyron sends signed links that expire. They are never stored or shown here.</li>
        </ul>
      </Block>
    </div>
  );
}

function Block({
  badge,
  children,
  source,
  title,
}: {
  badge?: ReactNode;
  children: ReactNode;
  source?: string[];
  title: string;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex flex-wrap items-center gap-2">
          {title}
          {badge}
        </CardTitle>
        {source ? (
          <CardDescription>
            <ToolSource tools={source} />
          </CardDescription>
        ) : null}
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

function SectionList({ content }: { content: KyronDraftContentResponse }) {
  return (
    <ol className="grid gap-4">
      {content.sections.map((section) => (
        <li className="grid gap-2 text-sm" key={section.id}>
          <p className="font-medium">
            {section.position}. {section.topic ?? `Section ${section.id}`}
          </p>
          <LabelledList access="qa_reads" items={section.objectives} label="Learning objectives" />
          <LabelledList access="not_checked" items={section.understandings} label="Enduring understandings" />
          <LabelledList access="not_checked" items={section.essentialQuestions} label="Essential questions" />
        </li>
      ))}
    </ol>
  );
}

function LabelledList({
  access,
  items,
  label,
}: {
  access: "qa_reads" | "not_checked";
  items: string[];
  label: string;
}) {
  if (items.length === 0) {
    return null;
  }

  return (
    <div className="grid gap-1">
      <span className="flex flex-wrap items-center gap-1.5 text-xs font-medium text-muted-foreground">
        {label}
        <AccessBadge access={access} />
      </span>
      <ul className="grid list-disc gap-1 pl-5">
        {items.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    </div>
  );
}

function MisconceptionList({ content }: { content: KyronDraftContentResponse }) {
  const mainPath = new Set(content.activities.map((activity) => Number(activity.id)));

  return (
    <ul className="grid gap-2 text-sm">
      {content.misconceptions.map((item) => (
        <li className="grid gap-0.5" key={`${item.name}-${item.targetActivityId}`}>
          <span className="font-medium">{item.name}</span>
          <span className="text-muted-foreground">
            {item.description ?? ""}
            {item.targetActivityId
              ? ` · remediation activity ${item.targetActivityId}${mainPath.has(item.targetActivityId) ? "" : " (alternate path, not read by QA)"}`
              : ""}
          </span>
        </li>
      ))}
    </ul>
  );
}
