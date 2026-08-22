import { FileText, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import type { SourceFileListRecord } from "@/features/source-library/types";

type SourceFileListProps = {
  files: SourceFileListRecord[];
  onDelete?: (file: SourceFileListRecord) => void;
  onViewUsage?: (file: SourceFileListRecord) => void;
};

export function SourceFileList({
  files,
  onDelete,
  onViewUsage,
}: SourceFileListProps) {
  if (files.length === 0) {
    return (
      <div className="grid min-h-56 place-items-center px-5 py-12 text-center">
        <div>
          <FileText
            aria-hidden="true"
            className="text-muted-foreground mx-auto size-8"
          />
          <h3 className="mt-3 text-sm font-bold">No matching source files</h3>
          <p className="text-muted-foreground mt-1 text-xs">
            Change the filters or upload a new file.
          </p>
        </div>
      </div>
    );
  }

  return (
    <>
      <DesktopFileTable
        files={files}
        onDelete={onDelete}
        onViewUsage={onViewUsage}
      />
      <MobileFileCards
        files={files}
        onDelete={onDelete}
        onViewUsage={onViewUsage}
      />
    </>
  );
}

function DesktopFileTable(props: SourceFileListProps) {
  return (
    <div className="hidden overflow-x-auto md:block">
      <table className="w-full min-w-[850px] border-collapse text-left">
        <thead>
          <tr className="border-border text-muted-foreground border-b text-xs">
            <th className="px-5 py-3 font-semibold">File</th>
            <th className="px-4 py-3 font-semibold">Used by</th>
            <th className="px-4 py-3 font-semibold">Uploaded</th>
            {props.onDelete ? (
              <th className="px-5 py-3 text-right font-semibold">Actions</th>
            ) : null}
          </tr>
        </thead>
        <tbody>
          {props.files.map((file) => (
            <tr className="border-border border-b last:border-b-0" key={file.id}>
              <td className="px-5 py-4">
                <FileIdentity file={file} />
              </td>
              <td className="px-4 py-4">
                <UsageLink file={file} onViewUsage={props.onViewUsage} />
              </td>
              <td className="text-muted-foreground px-4 py-4 text-xs">
                {formatDate(file.uploadedAt)}
              </td>
              {props.onDelete ? (
                <td className="px-5 py-4">
                  <FileActions file={file} onDelete={props.onDelete} />
                </td>
              ) : null}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function MobileFileCards(props: SourceFileListProps) {
  return (
    <div className="divide-border grid divide-y md:hidden">
      {props.files.map((file) => (
        <article className="grid gap-4 p-4" key={file.id}>
          <div className="flex items-start justify-between gap-3">
            <FileIdentity file={file} />
          </div>
          <div className="flex items-center justify-between gap-3">
            <UsageLink file={file} onViewUsage={props.onViewUsage} />
            <span className="text-muted-foreground text-xs">
              {formatDate(file.uploadedAt)}
            </span>
          </div>
          {props.onDelete ? (
            <FileActions file={file} onDelete={props.onDelete} />
          ) : null}
        </article>
      ))}
    </div>
  );
}

function FileIdentity({ file }: { file: SourceFileListRecord }) {
  return (
    <div className="flex min-w-0 items-start gap-3">
      <span className="bg-muted grid size-9 shrink-0 place-items-center rounded-lg">
        <FileText aria-hidden="true" className="size-4" />
      </span>
      <div className="min-w-0">
        <p className="truncate text-sm font-semibold">{file.name}</p>
        <p className="text-muted-foreground mt-1 text-xs uppercase">
          {file.type} · {formatFileSize(file.size)}
        </p>
      </div>
    </div>
  );
}

function UsageLink({
  file,
  onViewUsage,
}: {
  file: SourceFileListRecord;
  onViewUsage?: (file: SourceFileListRecord) => void;
}) {
  const workspaceCount = file.workspaceCount;

  if (workspaceCount === 0) {
    return <span className="text-muted-foreground text-xs">Not used</span>;
  }

  return onViewUsage ? (
    <button
      className="hover:text-primary text-left text-xs font-medium underline-offset-4 hover:underline"
      onClick={() => onViewUsage(file)}
      type="button"
    >
      {workspaceCount} workspace{workspaceCount === 1 ? "" : "s"}
    </button>
  ) : (
    <span className="text-xs">
      {workspaceCount} workspace{workspaceCount === 1 ? "" : "s"}
    </span>
  );
}

function FileActions({
  file,
  onDelete,
}: {
  file: SourceFileListRecord;
  onDelete: (file: SourceFileListRecord) => void;
}) {
  return (
    <div className="flex flex-wrap justify-end gap-2 md:flex-nowrap">
      <Button
        aria-label={`Delete ${file.name}`}
        onClick={() => onDelete(file)}
        size="icon-sm"
        type="button"
        variant="ghost"
      >
        <Trash2 aria-hidden="true" />
      </Button>
    </div>
  );
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(value));
}

function formatFileSize(bytes: number): string {
  if (bytes < 1_048_576) {
    return `${Math.max(1, Math.round(bytes / 1_024))} KB`;
  }

  return `${(bytes / 1_048_576).toFixed(1)} MB`;
}
