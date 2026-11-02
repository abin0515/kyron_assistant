import type { ReactNode } from "react";

import { WorkspaceLayout } from "@/components/layout/workspace-layout";
import { QaSubnav } from "@/features/qa/components/qa-subnav";
import { getWorkspaceAccount } from "@/server/identity/current-user";

export default async function QaLayout({ children }: { children: ReactNode }) {
  const account = await getWorkspaceAccount();

  return (
    <WorkspaceLayout>
      <div className="grid gap-6">
        <QaSubnav isAdmin={account?.role === "admin"} />
        {children}
      </div>
    </WorkspaceLayout>
  );
}
