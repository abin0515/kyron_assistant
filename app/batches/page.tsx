import type { Metadata } from "next";

import { BatchConcept } from "@/features/batches/components/batch-concept";

export const metadata: Metadata = {
  title: "Batch drafts concept — CPE Course Studio",
};

export default function BatchesPage() {
  return <BatchConcept />;
}
