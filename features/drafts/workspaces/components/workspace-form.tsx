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
import { courseSetupsMatch } from "@/lib/course-setup";
import {
  COURSE_FIELD_LIMITS,
  type AssetType,
  type DraftWorkspace,
  type Duration,
  type KyronDestination,
} from "@/types/api";

type WorkspaceFormProps = {
  destinationDisabled: boolean;
  disabled: boolean;
  fieldErrors: Record<string, string[]>;
  onDestinationChange: (destination: KyronDestination) => Promise<void>;
  onChange: (workspace: DraftWorkspace) => void;
  workspace: DraftWorkspace;
};

export function WorkspaceForm({
  destinationDisabled,
  disabled,
  fieldErrors,
  onDestinationChange,
  onChange,
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
              Review course setup
            </CardTitle>
            <p className="text-xs leading-relaxed text-muted-foreground">
              Review and edit every field before creating the course draft.
            </p>
          </div>
        </div>
        <GenerationState workspace={workspace} />
      </CardHeader>
      <CardContent className="min-w-0 grid gap-5 px-5 py-5 sm:grid-cols-2 sm:px-6 sm:py-6">
        <FormGroupLabel>Content</FormGroupLabel>
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

        <TextField
          className="sm:col-span-2"
          error={fieldErrors.learningObjective?.[0]}
          label="Learning objective"
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

        <FormGroupLabel>Format</FormGroupLabel>
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

        <TextField label="Duration">
          <select
            className="h-10 w-full rounded-lg border border-input bg-card px-3.5 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/20 disabled:bg-muted/50 disabled:opacity-60"
            disabled={disabled}
            id="duration"
            onChange={(event) =>
              onChange({
                ...workspace,
                duration: Number(event.currentTarget.value) as Duration,
              })
            }
            value={workspace.duration}
          >
            <option value="480">8 minutes</option>
            <option value="900">15 minutes</option>
            <option value="1800">30 minutes</option>
            <option value="3600">60 minutes</option>
          </select>
        </TextField>

        <FormGroupLabel>Delivery</FormGroupLabel>
        <WorkspaceDraftAttachment
          disabled={disabled}
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

function FormGroupLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="border-b border-border/70 pb-2 text-xs font-semibold tracking-[0.08em] text-muted-foreground uppercase sm:col-span-2">
      {children}
    </p>
  );
}

function GenerationState({ workspace }: { workspace: DraftWorkspace }) {
  const calibration = workspace.courseSetupCalibration;

  if (!calibration) {
    return null;
  }

  const edited = !courseSetupsMatch(workspace, calibration.generatedSetup);

  return (
    <Badge className="border-border bg-card text-foreground" variant="outline">
      <Sparkles aria-hidden="true" />
      {edited ? "AI generated · Edited" : "AI generated"}
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
