import type { ReactNode } from "react";

import { WorkspaceShell } from "@/components/layout/workspace-shell";

export default function BatchesLayout({ children }: { children: ReactNode }) {
  return <WorkspaceShell>{children}</WorkspaceShell>;
}
