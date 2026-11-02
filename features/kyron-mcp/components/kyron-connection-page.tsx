"use client";

import { LoaderCircle } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { InlineNotice } from "@/components/ui/inline-notice";
import { PageHeader } from "@/components/ui/page-header";
import { KyronClientSetupCard } from "@/features/kyron-mcp/components/kyron-client-setup-card";
import { KyronConnectionCard } from "@/features/kyron-mcp/components/kyron-connection-card";
import { KyronToolExplorer } from "@/features/kyron-mcp/components/kyron-tool-explorer";
import { useKyronConnection } from "@/features/kyron-mcp/hooks/use-kyron-connection";
import type { KyronClientMetadataSetup } from "@/types/api";

type PageOutcome = { tone: "success" | "error"; message: string } | null;

export function KyronConnectionPage({
  outcome,
  setup,
}: {
  outcome: PageOutcome;
  setup: KyronClientMetadataSetup;
}) {
  const { state, reload, replaceConnection } = useKyronConnection();

  return (
    <div className="grid gap-6">
      <PageHeader
        description="Sign in to Kyron so the QA agent can read lessons and generated content through Kyron MCP. Development setup: the sign-in is stored encrypted on this computer."
        eyebrow={<Badge variant="info">Admin</Badge>}
        title="Kyron connection"
      />

      {outcome ? (
        <InlineNotice tone={outcome.tone}>{outcome.message}</InlineNotice>
      ) : null}

      {state.status === "loading" ? (
        <p
          className="flex items-center gap-2 text-sm text-muted-foreground"
          role="status"
        >
          <LoaderCircle aria-hidden="true" className="size-4 animate-spin" />
          Checking the Kyron connection…
        </p>
      ) : null}

      {state.status === "error" ? (
        <InlineNotice tone="error">{state.message}</InlineNotice>
      ) : null}

      {state.status === "ready" ? (
        <>
          <KyronConnectionCard
            connection={state.connection}
            onChanged={replaceConnection}
            onRetry={reload}
          />
          {state.connection.status === "connected" ? (
            <KyronToolExplorer />
          ) : (
            <KyronClientSetupCard
              configured={state.connection.status !== "not_configured"}
              setup={setup}
            />
          )}
        </>
      ) : null}
    </div>
  );
}
