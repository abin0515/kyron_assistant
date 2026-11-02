"use client";

import { useState } from "react";

import { PageHeader } from "@/components/ui/page-header";
import { LogsContentVersions } from "@/features/logs/components/logs-content-versions";
import { LogsEvents } from "@/features/logs/components/logs-events";
import { LogsOverview } from "@/features/logs/components/logs-overview";
import { LogsPrices } from "@/features/logs/components/logs-prices";
import { LogsUsage } from "@/features/logs/components/logs-usage";
import { cn } from "@/lib/utils";

const TABS = [
  { id: "overview", label: "Overview" },
  { id: "events", label: "Events" },
  { id: "usage", label: "AI usage" },
  { id: "versions", label: "Content versions" },
  { id: "prices", label: "Prices" },
] as const;

type TabId = (typeof TABS)[number]["id"];

export function LogsPage({ isAdmin }: { isAdmin: boolean }) {
  const [tab, setTab] = useState<TabId>("overview");

  return (
    <div className="grid gap-6">
      <PageHeader
        description="What the launcher and its QA agent did and what it cost: sign-ins, Kyron calls, every model call with tokens and estimated cost, QA steps, content versions and errors. Secrets are removed before anything is stored."
        title="Logs"
      />
      <div aria-label="Log views" className="flex flex-wrap gap-1 border-b border-border/80 pb-px" role="tablist">
        {TABS.map((item) => (
          <button
            aria-selected={tab === item.id}
            className={cn(
              "-mb-px border-b-2 px-3 py-2 text-sm font-medium",
              tab === item.id
                ? "border-primary text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground",
            )}
            key={item.id}
            onClick={() => setTab(item.id)}
            role="tab"
            type="button"
          >
            {item.label}
          </button>
        ))}
      </div>
      {tab === "overview" ? <LogsOverview /> : null}
      {tab === "events" ? <LogsEvents /> : null}
      {tab === "usage" ? <LogsUsage /> : null}
      {tab === "versions" ? <LogsContentVersions /> : null}
      {tab === "prices" ? <LogsPrices isAdmin={isAdmin} /> : null}
    </div>
  );
}
