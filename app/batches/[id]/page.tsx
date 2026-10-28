import type { Metadata } from "next";

import { BatchDetailPage } from "@/features/batches/components/batch-detail-page";

export const metadata: Metadata = {
  title: "Batch details — CPE Course Studio",
};

type BatchPageProps = {
  params: Promise<{ id: string }>;
};

export default async function BatchPage({ params }: BatchPageProps) {
  const { id } = await params;

  return <BatchDetailPage batchId={id} />;
}
