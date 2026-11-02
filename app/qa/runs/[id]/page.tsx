import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { QaRunPage } from "@/features/qa/components/qa-run-page";
import { getCurrentUser } from "@/server/identity/current-user";

export const metadata: Metadata = {
  title: "QA run — CPE Course Studio",
};

type RunPageProps = {
  params: Promise<{ id: string }>;
};

export default async function RunPage({ params }: RunPageProps) {
  const { id } = await params;

  if (!/^[0-9a-f-]{36}$/i.test(id)) {
    notFound();
  }

  const user = await getCurrentUser();

  return <QaRunPage isAdmin={user.role === "admin"} runId={id} />;
}
