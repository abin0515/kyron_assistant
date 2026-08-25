import "server-only";

import {
  listWorkspaceSourceFiles,
  replaceWorkspaceSourceFiles,
} from "@/server/drafts/workspace-source-files/repository";
import type { WorkspaceSourceFile } from "@/server/drafts/workspace-source-files/types";
import { getDraftWorkspaceById } from "@/server/drafts/workspaces/repository";
import { getCurrentUser } from "@/server/identity/current-user";
import { getSourceFileById } from "@/server/source-files/repository";
import type { SourceFile } from "@/server/source-files/types";
import type { SourceFileUsagePurpose } from "@/types/api";

export async function listCurrentWorkspaceSourceFiles(
  workspaceId: string,
): Promise<WorkspaceSourceFile[] | null> {
  const user = await getCurrentUser();
  const workspace = await getDraftWorkspaceById(workspaceId, user.id);

  if (!workspace) {
    return null;
  }

  return listWorkspaceSourceFiles(workspaceId, user.id);
}

export async function updateCurrentWorkspaceSourceFiles(
  workspaceId: string,
  purpose: SourceFileUsagePurpose,
  sourceFileIds: string[],
): Promise<WorkspaceSourceFile[] | null> {
  const user = await getCurrentUser();
  const workspace = await getDraftWorkspaceById(workspaceId, user.id);

  if (!workspace) {
    return null;
  }

  if (
    workspace.kyronDraftId ||
    !["editing", "error"].includes(workspace.status)
  ) {
    throw new WorkspaceSourceFilesLockedError();
  }

  if (purpose === "kyron_attachment" && sourceFileIds.length > 1) {
    throw new WorkspaceSourceFilesValidationError(
      "Only one source file can be attached to a Kyron draft.",
    );
  }

  const sourceFiles = await loadOwnedSourceFiles(sourceFileIds, user.id);

  if (
    purpose === "kyron_attachment" &&
    sourceFiles.some((file) =>
      file.contentType.includes("wordprocessingml.document"),
    )
  ) {
    throw new WorkspaceSourceFilesValidationError(
      "Only PDF and PPTX files can be attached to a Kyron draft.",
    );
  }

  await replaceWorkspaceSourceFiles(
    workspaceId,
    user.id,
    purpose,
    sourceFileIds,
  );

  return listWorkspaceSourceFiles(workspaceId, user.id);
}

export class WorkspaceSourceFilesLockedError extends Error {
  constructor() {
    super("Submitted draft workspaces cannot change source files.");
    this.name = "WorkspaceSourceFilesLockedError";
  }
}

export class WorkspaceSourceFilesValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WorkspaceSourceFilesValidationError";
  }
}

async function loadOwnedSourceFiles(
  sourceFileIds: string[],
  userId: string,
): Promise<SourceFile[]> {
  const sourceFiles = await Promise.all(
    sourceFileIds.map((id) => getSourceFileById(id, userId)),
  );

  if (sourceFiles.some((sourceFile) => !sourceFile)) {
    throw new WorkspaceSourceFilesValidationError(
      "One or more selected source files could not be found.",
    );
  }

  return sourceFiles as SourceFile[];
}
