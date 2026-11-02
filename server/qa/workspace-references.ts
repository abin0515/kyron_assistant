import "server-only";

import { listWorkspaceSourceFiles } from "@/server/drafts/workspace-source-files/repository";
import { getSourceFilesByIds } from "@/server/source-files/repository";
import type { QaReference } from "@/types/api";

// The workspace's own inputs are the approved references for its QA: the
// pasted source text plus the extracted text of every linked source file.
// Uses owner-scoped repositories so the worker can call it without a session.
export async function loadWorkspaceReferences({
  ownerId,
  sourceText,
  workspaceId,
}: {
  ownerId: string;
  sourceText: string;
  workspaceId: string;
}): Promise<QaReference[]> {
  const references: QaReference[] = [];

  if (sourceText.trim()) {
    references.push({ title: "Workspace source text", text: sourceText });
  }

  const links = await listWorkspaceSourceFiles(workspaceId, ownerId);
  const files = await getSourceFilesByIds([...new Set(links.map((link) => link.id))], ownerId);

  for (const file of files) {
    if (file.extractedText?.trim()) {
      references.push({ title: file.originalName, text: file.extractedText });
    }
  }

  return references;
}
