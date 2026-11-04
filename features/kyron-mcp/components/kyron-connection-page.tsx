"use client";

import { ArrowRight, LoaderCircle } from "lucide-react";
import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { InlineNotice } from "@/components/ui/inline-notice";
import { PageHeader } from "@/components/ui/page-header";
import { KyronClientSetupCard } from "@/features/kyron-mcp/components/kyron-client-setup-card";
import { KyronConnectionCard } from "@/features/kyron-mcp/components/kyron-connection-card";
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
        description="Sign in to Kyron so the QA agent can read generated lessons and write its fixes through Kyron MCP. Development setup: the sign-in is stored encrypted on this computer."
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
            <ConnectedNextSteps />
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

function ConnectedNextSteps() {
  const links = [
    {
      href: "/kyron/content",
      title: "Course content",
      text: "Each draft as Kyron MCP returns it, and every change the QA agent made.",
    },
    {
      href: "/kyron/tools",
      title: "Tools",
      text: "Everything Kyron MCP offers, grouped by area, with how QA uses each tool.",
    },
  ];

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {links.map((link) => (
        <Link className="rounded-xl border border-border/80 bg-card p-4 hover:bg-muted/50" href={link.href} key={link.href}>
          <span className="flex items-center gap-1 text-sm font-medium">
            {link.title}
            <ArrowRight aria-hidden="true" className="size-4" />
          </span>
          <span className="mt-1 block text-sm text-muted-foreground">{link.text}</span>
        </Link>
      ))}
    </div>
  );
}
