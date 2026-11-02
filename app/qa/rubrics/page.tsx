import type { Metadata } from "next";

import { QaRubricsPage } from "@/features/qa/components/qa-rubrics-page";
import { getCurrentUser } from "@/server/identity/current-user";

export const metadata: Metadata = {
  title: "Rubrics — QA agent",
};

export default async function RubricsPage() {
  const user = await getCurrentUser();

  return <QaRubricsPage isAdmin={user.role === "admin"} />;
}
