import type { ReactNode } from "react";

import { WorkspaceLayout } from "@/components/layout/workspace-layout";

export default function KyronLayout({ children }: { children: ReactNode }) {
  return <WorkspaceLayout>{children}</WorkspaceLayout>;
}
