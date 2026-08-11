import type { Metadata } from "next";

import { WorkspaceEditor } from "@/features/drafts/workspaces/components/workspace-editor";

export const metadata: Metadata = {
  title: "Draft workspace",
};

type DraftWorkspacePageProps = {
  params: Promise<{
    id: string;
  }>;
};

export default async function DraftWorkspacePage({
  params,
}: DraftWorkspacePageProps) {
  const { id } = await params;

  return <WorkspaceEditor workspaceId={id} />;
}
