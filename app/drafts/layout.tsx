import type { ReactNode } from "react";

import { WorkspaceLayout } from "@/components/layout/workspace-layout";

export default function DraftsLayout({ children }: { children: ReactNode }) {
  return <WorkspaceLayout>{children}</WorkspaceLayout>;
}
