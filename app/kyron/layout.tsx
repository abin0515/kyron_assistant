import type { ReactNode } from "react";

import { WorkspaceLayout } from "@/components/layout/workspace-layout";
import { InlineNotice } from "@/components/ui/inline-notice";
import { PageHeader } from "@/components/ui/page-header";
import { KyronSubnav } from "@/features/kyron-mcp/components/kyron-subnav";
import { getWorkspaceAccount } from "@/server/identity/current-user";

// Every Kyron page is for the admin only.
export default async function KyronLayout({ children }: { children: ReactNode }) {
  const account = await getWorkspaceAccount();

  return (
    <WorkspaceLayout>
      {account?.role === "admin" ? (
        <div className="grid gap-6">
          <KyronSubnav />
          {children}
        </div>
      ) : (
        <div className="grid gap-6">
          <PageHeader title="Kyron" />
          <InlineNotice tone="warning">Only the admin can manage the Kyron connection and review Kyron content.</InlineNotice>
        </div>
      )}
    </WorkspaceLayout>
  );
}
