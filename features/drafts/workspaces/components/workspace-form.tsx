import { Sparkles } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { WorkspaceDraftAttachment } from "@/features/drafts/workspaces/components/workspace-draft-attachment";
import { KyronDestinationField } from "@/features/drafts/workspaces/components/kyron-destination-field";
import { setupChanges, type QaSetupValues } from "@/lib/course-setup-changes";
import {
  durationForLevel,
  LENGTH_LEVEL_LABELS,
  levelForDuration,
  levelTargetsSummary,
} from "@/lib/length-targets";
import {
  COURSE_FIELD_LIMITS,
  type AssetType,
  type DraftWorkspace,
  type Duration,
  type KyronDestination,
  LENGTH_LEVELS,
  type LengthLevel,
} from "@/types/api";

type WorkspaceFormProps = {
  // Changes when step 1 linked an attachment, so the field reloads.
  attachmentRefreshKey: number;
  destinationDisabled: boolean;
  disabled: boolean;
  fieldErrors: Record<string, string[]>;
  onDestinationChange: (destination: KyronDestination) => Promise<void>;
  onChange: (workspace: DraftWorkspace) => void;
  // What the QA agent last wrote to the setup, to tell its fixes from edits.
  qaValues: QaSetupValues;
  workspace: DraftWorkspace;
};

export function WorkspaceForm({
  attachmentRefreshKey,
  destinationDisabled,
  disabled,
  fieldErrors,
  onDestinationChange,
  onChange,
  qaValues,
  workspace,
}: WorkspaceFormProps) {
  return (
    <Card className="min-w-0 gap-0 py-0">
      <CardHeader className="flex flex-row items-start justify-between gap-4 border-b border-border/80 px-5 py-5 sm:px-6">
        <div className="flex items-start gap-3">
          <span className="grid size-7 shrink-0 place-items-center rounded-full bg-accent text-xs font-semibold text-primary">
            2
          </span>
          <div className="grid gap-1">
            <CardTitle className="text-base font-medium">
              Plan the course
            </CardTitle>
            <p className="text-xs leading-relaxed text-muted-foreground">
              The outcome, audience and length Kyron generates the template from. Review and edit every field.
            </p>
          </div>
        </div>
        <GenerationState qaValues={qaValues} workspace={workspace} />
      </CardHeader>
      <CardContent className="min-w-0 grid gap-5 px-5 py-5 sm:grid-cols-2 sm:px-6 sm:py-6">
        <FormGroupLabel>Outcome and audience</FormGroupLabel>
        <TextField
          className="sm:col-span-2"
          error={fieldErrors.learningObjective?.[0]}
          label="Outcome (learning objective)"
        >
          <Textarea
            className="min-h-28"
            disabled={disabled}
            id="learningObjective"
            maxLength={COURSE_FIELD_LIMITS.learningObjective}
            onChange={(event) =>
              onChange({
                ...workspace,
                learningObjective: event.currentTarget.value,
              })
            }
            value={workspace.learningObjective}
          />
        </TextField>
        <TextField
          className="sm:col-span-2"
          error={fieldErrors.audience?.[0]}
          label="Audience"
        >
          <Input
            disabled={disabled}
            id="audience"
            maxLength={COURSE_FIELD_LIMITS.audience}
            onChange={(event) =>
              onChange({ ...workspace, audience: event.currentTarget.value })
            }
            value={workspace.audience}
          />
        </TextField>

        <FormGroupLabel>Length and format</FormGroupLabel>
        <LengthField
          disabled={disabled}
          onChange={(duration) => onChange({ ...workspace, duration })}
          value={workspace.duration}
        />

        <TextField label="Asset type">
          <select
            className="h-10 w-full rounded-lg border border-input bg-card px-3.5 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/20 disabled:bg-muted/50 disabled:opacity-60"
            disabled={disabled}
            id="assetType"
            onChange={(event) =>
              onChange({
                ...workspace,
                assetType: event.currentTarget.value as AssetType,
              })
            }
            value={workspace.assetType}
          >
            <option value="lesson">Lesson</option>
            <option value="practice">Practice</option>
            <option value="scenario">Scenario</option>
          </select>
        </TextField>

        <FormGroupLabel>Course</FormGroupLabel>
        <TextField
          className="sm:col-span-2"
          error={fieldErrors.name?.[0]}
          label="Title"
        >
          <Input
            disabled={disabled}
            id="name"
            maxLength={COURSE_FIELD_LIMITS.name}
            onChange={(event) =>
              onChange({ ...workspace, name: event.currentTarget.value })
            }
            value={workspace.name}
          />
        </TextField>

        <TextField
          className="sm:col-span-2"
          error={fieldErrors.description?.[0]}
          label="Description"
        >
          <Textarea
            className="min-h-28"
            disabled={disabled}
            id="description"
            maxLength={COURSE_FIELD_LIMITS.description}
            onChange={(event) =>
              onChange({
                ...workspace,
                description: event.currentTarget.value,
              })
            }
            value={workspace.description}
          />
        </TextField>







        <FormGroupLabel>Delivery</FormGroupLabel>
        <WorkspaceDraftAttachment
          disabled={disabled}
          key={attachmentRefreshKey}
          workspaceId={workspace.id}
        />

        <KyronDestinationField
          className="sm:col-span-2"
          destination={workspace.kyronDestination}
          disabled={destinationDisabled}
          onChange={onDestinationChange}
        />

      </CardContent>
    </Card>
  );
}

// Brief / Normal / Detailed, stored as the Kyron lesson length it maps to.
function LengthField({
  disabled,
  onChange,
  value,
}: {
  disabled: boolean;
  onChange: (duration: Duration) => void;
  value: Duration;
}) {
  const level = levelForDuration(value) ?? "brief";

  return (
    <TextField label="Length">
      <select
        className="h-10 w-full rounded-lg border border-input bg-card px-3.5 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/20 disabled:bg-muted/50 disabled:opacity-60"
        disabled={disabled}
        id="lengthLevel"
        onChange={(event) => onChange(durationForLevel(event.currentTarget.value as LengthLevel))}
        value={level}
      >
        {LENGTH_LEVELS.map((option) => (
          <option key={option} value={option}>
            {LENGTH_LEVEL_LABELS[option]} ({durationForLevel(option) / 60} min lesson)
          </option>
        ))}
      </select>
      <span className="text-xs leading-relaxed text-muted-foreground">
        {levelTargetsSummary(level)}. QA checks each asset against these.
      </span>
    </TextField>
  );
}

function FormGroupLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="border-b border-border/70 pb-2 text-xs font-semibold tracking-[0.08em] text-muted-foreground uppercase sm:col-span-2">
      {children}
    </p>
  );
}

// "AI generated", plus "QA fixed" while a field holds the QA agent's fix and
// "Edited" when a person changed something.
function GenerationState({ qaValues, workspace }: { qaValues: QaSetupValues; workspace: DraftWorkspace }) {
  const calibration = workspace.courseSetupCalibration;

  if (!calibration) {
    return null;
  }

  const { edited, qaFixed } = setupChanges(workspace, calibration.generatedSetup, qaValues);
  const label = ["AI generated", qaFixed ? "QA fixed" : null, edited ? "Edited" : null].filter(Boolean).join(" · ");

  return (
    <Badge className="border-border bg-card text-foreground" variant="outline">
      <Sparkles aria-hidden="true" />
      {label}
    </Badge>
  );
}

function TextField({
  children,
  className,
  error,
  label,
}: {
  children: React.ReactNode;
  className?: string;
  error?: string;
  label: string;
}) {
  return (
    <label className={`grid gap-1.5 ${className ?? ""}`}>
      <span className="text-sm font-semibold">{label}</span>
      {children}
      {error ? (
        <span className="text-xs text-destructive" role="alert">
          {error}
        </span>
      ) : null}
    </label>
  );
}
