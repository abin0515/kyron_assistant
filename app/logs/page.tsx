import type { Metadata } from "next";

import { InlineNotice } from "@/components/ui/inline-notice";
import { LogsPage } from "@/features/logs/components/logs-page";
import { getCurrentUser } from "@/server/identity/current-user";

export const metadata: Metadata = {
  title: "Logs — CPE Course Studio",
};

export default async function Page() {
  const user = await getCurrentUser();

  if (user.role !== "admin" && user.role !== "developer") {
    return <InlineNotice tone="warning">Only the admin and developers can view logs.</InlineNotice>;
  }

  return <LogsPage isAdmin={user.role === "admin"} />;
}
