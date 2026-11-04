import type { Metadata } from "next";

import { QaDefectsPage } from "@/features/qa/components/qa-defects-page";

export const metadata: Metadata = {
  title: "Defects — CPE Course Studio",
};

export default function DefectsPage() {
  return <QaDefectsPage />;
}
