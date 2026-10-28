import type { Metadata } from "next";

import { SourceLibrary } from "@/features/source-library/components/source-library";

export const metadata: Metadata = {
  title: "Source Library — CPE Course Studio",
};

export default function SourcesPage() {
  return <SourceLibrary />;
}
