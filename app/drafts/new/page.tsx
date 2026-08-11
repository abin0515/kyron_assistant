import type { Metadata } from "next";

import { NewDraftWorkspace } from "@/features/drafts/workspaces/components/new-draft-workspace";

export const metadata: Metadata = {
  title: "New draft workspace",
};

export default function NewDraftPage() {
  return <NewDraftWorkspace />;
}
