import type { Metadata } from "next";

import { PageHeader } from "@/components/ui/page-header";
import { KyronToolExplorer } from "@/features/kyron-mcp/components/kyron-tool-explorer";

export const metadata: Metadata = {
  title: "Tools — Kyron",
};

export default function KyronToolsPage() {
  return (
    <div className="grid gap-6">
      <PageHeader
        description="What Kyron MCP offers this account, grouped by area, and how the QA agent uses each tool."
        title="Kyron MCP tools"
      />
      <KyronToolExplorer />
    </div>
  );
}
