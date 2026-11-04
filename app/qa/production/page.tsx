import type { Metadata } from "next";

import { QaProductionPage } from "@/features/qa/components/qa-production-page";

export const metadata: Metadata = {
  title: "Production — CPE Course Studio",
};

export default function ProductionPage() {
  return <QaProductionPage />;
}
