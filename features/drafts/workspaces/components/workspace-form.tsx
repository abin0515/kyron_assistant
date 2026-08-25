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
import {
  COURSE_FIELD_LIMITS,
  type AssetType,
  type DraftWorkspace,
  type Duration,
} from "@/types/api";

type WorkspaceFormProps = {
  disabled: boolean;
  fieldErrors: Record<string, string[]>;
  generated: boolean;
  onChange: (workspace: DraftWorkspace) => void;
  workspace: DraftWorkspace;
};

export function WorkspaceForm({
  disabled,
  fieldErrors,
  generated,
  onChange,
  workspace,
}: WorkspaceFormProps) {
  return (
    <Card className="gap-0 rounded-xl border-border py-0 ring-1 ring-border">
      <CardHeader className="flex flex-row items-start justify-between gap-4 border-b border-border px-5 py-4">
        <div className="grid gap-1">
          <CardTitle className="text-base font-light">
            2. Review course setup
          </CardTitle>
          <p className="text-xs text-muted-foreground">
            Review and edit every field before creating the course draft.
          </p>
        </div>
        {generated ? (
          <Badge className="border-border bg-card text-foreground" variant="outline">
            <Sparkles aria-hidden="true" />
            AI generated
          </Badge>
        ) : null}
      </CardHeader>
      <CardContent className="grid gap-5 px-5 py-5 sm:grid-cols-2">
        <TextField
          className="sm:col-span-2"
          error={fieldErrors.name?.[0]}
          label="Title"
        >
          <Input
            className="h-10 rounded-lg bg-card"
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
            className="min-h-28 rounded-lg bg-card"
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
            className="min-h-28 rounded-lg bg-card"
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
            className="h-10 rounded-lg bg-card"
            disabled={disabled}
            id="audience"
            maxLength={COURSE_FIELD_LIMITS.audience}
            onChange={(event) =>
              onChange({ ...workspace, audience: event.currentTarget.value })
            }
            value={workspace.audience}
          />
        </TextField>

        <TextField label="Asset type">
          <select
            className="h-10 w-full rounded-lg border border-border bg-card px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-55"
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
            className="h-10 w-full rounded-lg border border-border bg-card px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-55"
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

        <WorkspaceDraftAttachment
          disabled={disabled}
          workspaceId={workspace.id}
        />
      </CardContent>
    </Card>
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
        <span className="text-xs text-primary" role="alert">
          {error}
        </span>
      ) : null}
    </label>
  );
}
