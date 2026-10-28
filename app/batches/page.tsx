import type { Metadata } from "next";

import { BatchListPage } from "@/features/batches/components/batch-list-page";

export const metadata: Metadata = {
  title: "Batch drafts — CPE Course Studio",
};

export default function BatchesPage() {
  return <BatchListPage />;
}
