import type { Metadata } from "next";

import { InlineNotice } from "@/components/ui/inline-notice";
import { QaEscalationsPage } from "@/features/qa/components/qa-escalations-page";
import { getCurrentUser } from "@/server/identity/current-user";

export const metadata: Metadata = {
  title: "Escalations — QA agent",
};

export default async function EscalationsPage() {
  const user = await getCurrentUser();

  if (user.role !== "admin") {
    return <InlineNotice tone="warning">Only the admin can decide escalated findings.</InlineNotice>;
  }

  return <QaEscalationsPage />;
}
