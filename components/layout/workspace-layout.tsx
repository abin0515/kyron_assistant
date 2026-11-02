import { redirect } from "next/navigation";
import type { ReactNode } from "react";

import { WorkspaceShell } from "@/components/layout/workspace-shell";
import { getWorkspaceAccount } from "@/server/identity/current-user";

export async function WorkspaceLayout({ children }: { children: ReactNode }) {
  const account = await getWorkspaceAccount();

  if (!account) {
    redirect("/sign-in");
  }

  return <WorkspaceShell account={account}>{children}</WorkspaceShell>;
}
