import type { Metadata } from "next";

import { NewBatchPage } from "@/features/batches/components/new-batch-page";

export const metadata: Metadata = {
  title: "New batch — CPE Course Studio",
};

export default function NewBatchRoute() {
  return <NewBatchPage />;
}
