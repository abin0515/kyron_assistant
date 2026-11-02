import type { Metadata } from "next";

import { QaDashboard } from "@/features/qa/components/qa-dashboard";

export const metadata: Metadata = {
  title: "QA agent — CPE Course Studio",
};

export default function QaPage() {
  return <QaDashboard />;
}
