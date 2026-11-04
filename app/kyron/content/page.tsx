import type { Metadata } from "next";

import { KyronDraftListPage } from "@/features/kyron-content/components/kyron-draft-list-page";

export const metadata: Metadata = {
  title: "Course content — Kyron",
};

export default function KyronContentPage() {
  return <KyronDraftListPage />;
}
