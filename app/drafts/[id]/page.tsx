import type { Metadata } from "next";

import { WorkspaceEditor } from "@/features/drafts/workspaces/components/workspace-editor";

export const metadata: Metadata = {
  title: "Draft workspace",
};

type DraftWorkspacePageProps = {
  params: Promise<{
    id: string;
  }>;
  searchParams: Promise<{
    generate?: string | string[];
  }>;
};

// ?generate=plan: opened from the new-draft prompt box, so the plan is
// drafted right away.
export default async function DraftWorkspacePage({
  params,
  searchParams,
}: DraftWorkspacePageProps) {
  const { id } = await params;
  const { generate } = await searchParams;

  return <WorkspaceEditor autoGenerate={generate === "plan"} workspaceId={id} />;
}
