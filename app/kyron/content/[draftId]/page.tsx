import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { KyronDraftPage } from "@/features/kyron-content/components/kyron-draft-page";
import { parseKyronDraftId } from "@/server/kyron-content/draft-id";

export const metadata: Metadata = {
  title: "Kyron draft — Course content",
};

type DraftPageProps = {
  params: Promise<{ draftId: string }>;
  searchParams: Promise<{ tab?: string }>;
};

export default async function KyronDraftContentPage({ params, searchParams }: DraftPageProps) {
  const draftId = parseKyronDraftId((await params).draftId);

  if (!draftId) {
    notFound();
  }

  const { tab } = await searchParams;

  return <KyronDraftPage draftId={draftId} initialTab={tab === "revisions" ? "revisions" : "content"} />;
}
