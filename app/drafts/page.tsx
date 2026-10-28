import type { Metadata } from "next";

import { WorkspaceList } from "@/features/drafts/workspaces/components/workspace-list";

export const metadata: Metadata = {
  title: "Drafts",
};

export default function DraftsPage() {
  return <WorkspaceList />;
}
