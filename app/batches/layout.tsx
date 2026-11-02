import type { ReactNode } from "react";

import { WorkspaceLayout } from "@/components/layout/workspace-layout";

export default function BatchesLayout({ children }: { children: ReactNode }) {
  return <WorkspaceLayout>{children}</WorkspaceLayout>;
}
