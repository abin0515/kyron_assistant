"use client";

import { Download, LoaderCircle, RefreshCw } from "lucide-react";
import { useEffect, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { InlineNotice } from "@/components/ui/inline-notice";
import { Input } from "@/components/ui/input";
import { getKyronCapabilities } from "@/features/kyron-mcp/api";
import { JsonBlock } from "@/components/ui/json-block";
import { KyronToolRunner } from "@/features/kyron-mcp/components/kyron-tool-runner";
import { filterKyronTools, groupKyronTools, QA_USE_LABELS } from "@/features/kyron-mcp/tool-groups";
import { cn } from "@/lib/utils";
import type { KyronMcpCapabilityManifest, KyronMcpToolSummary } from "@/types/api";

type ManifestState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; manifest: KyronMcpCapabilityManifest };

export function KyronToolExplorer() {
  const [state, setState] = useState<ManifestState>({ status: "loading" });
  const [selectedName, setSelectedName] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [query, setQuery] = useState("");
  const [usedByQa, setUsedByQa] = useState(false);

  useEffect(() => {
    const controller = new AbortController();

    async function loadManifest() {
      try {
        const manifest = await getKyronCapabilities(controller.signal);

        if (!controller.signal.aborted) {
          setState({ status: "ready", manifest });
        }
      } catch (error) {
        if (!controller.signal.aborted) {
          setState({
            status: "error",
            message:
              error instanceof Error ? error.message : "The Kyron tools could not be loaded.",
          });
        }
      }
    }

    void loadManifest();

    return () => controller.abort();
  }, [reloadKey]);

  function reload() {
    setState({ status: "loading" });
    setReloadKey((key) => key + 1);
  }

  const manifest = state.status === "ready" ? state.manifest : null;
  const visible = manifest ? filterKyronTools(manifest.tools, { query, usedByQa }) : [];
  // Without a selection, show the first tool of the grouped list.
  const selectedTool =
    visible.find((tool) => tool.name === selectedName) ??
    groupKyronTools(visible)[0]?.tools[0] ??
    null;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Kyron MCP tools</CardTitle>
        <CardDescription>
          Everything Kyron exposes to this account, grouped by area. Only tools
          marked read-only can be run here.
        </CardDescription>
        <CardAction className="flex gap-2">
          <Button
            disabled={state.status === "loading"}
            onClick={reload}
            size="sm"
            type="button"
            variant="outline"
          >
            <RefreshCw aria-hidden="true" />
            Refresh
          </Button>
          {manifest ? <DownloadManifestButton manifest={manifest} /> : null}
        </CardAction>
      </CardHeader>
      <CardContent className="grid gap-4">
        {state.status === "loading" ? (
          <p className="flex items-center gap-2 text-sm text-muted-foreground" role="status">
            <LoaderCircle aria-hidden="true" className="size-4 animate-spin" />
            Asking Kyron which tools it offers…
          </p>
        ) : null}
        {state.status === "error" ? (
          <InlineNotice tone="error">{state.message}</InlineNotice>
        ) : null}
        {manifest ? (
          <>
            <ServerSummary manifest={manifest} />
            <GroupOverview tools={manifest.tools} />
            <div className="flex flex-wrap items-center gap-3">
              <Input
                aria-label="Search tools"
                className="w-64"
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search tools"
                value={query}
              />
              <label className="flex items-center gap-2 text-sm">
                <input checked={usedByQa} onChange={(event) => setUsedByQa(event.target.checked)} type="checkbox" />
                Used by QA only
              </label>
              <span className="text-sm text-muted-foreground">{visible.length} shown</span>
            </div>
            {visible.length === 0 ? (
              <InlineNotice>No tools match.</InlineNotice>
            ) : (
              <div className="grid gap-4 lg:grid-cols-[minmax(16rem,20rem)_1fr]">
                <ToolList
                  onSelect={setSelectedName}
                  selectedName={selectedTool?.name ?? null}
                  tools={visible}
                />
                {selectedTool ? <ToolDetail key={selectedTool.name} tool={selectedTool} /> : null}
              </div>
            )}
          </>
        ) : null}
      </CardContent>
    </Card>
  );
}

function ServerSummary({ manifest }: { manifest: KyronMcpCapabilityManifest }) {
  const readOnlyCount = manifest.tools.filter((tool) => tool.explorerAllowed).length;

  return (
    <div className="grid gap-2 text-sm">
      <p>
        <span className="font-medium">
          {manifest.server?.title ?? manifest.server?.name ?? "Kyron MCP"}
        </span>
        {manifest.server ? ` · version ${manifest.server.version}` : null} ·{" "}
        {manifest.tools.length} tools, {readOnlyCount} runnable here
      </p>
      {manifest.instructions ? (
        <details>
          <summary className="cursor-pointer text-muted-foreground">
            Server instructions
          </summary>
          <JsonBlock className="mt-2" label="Server instructions" value={manifest.instructions} />
        </details>
      ) : null}
    </div>
  );
}

// One row per area: how many tools, how many only read, how many QA uses.
function GroupOverview({ tools }: { tools: KyronMcpToolSummary[] }) {
  return (
    <ul className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
      {groupKyronTools(tools).map((group) => (
        <li className="grid gap-1 rounded-lg border border-border/80 p-3 text-sm" key={group.id}>
          <span className="font-medium">{group.label}</span>
          <span className="text-xs text-muted-foreground">{group.description}</span>
          <span className="text-xs">
            {group.tools.length} tools · {group.tools.filter((tool) => tool.explorerAllowed).length} read-only ·{" "}
            {group.tools.filter((tool) => tool.qaUse !== null).length} used by QA
          </span>
        </li>
      ))}
    </ul>
  );
}

function ToolList({
  onSelect,
  selectedName,
  tools,
}: {
  onSelect: (name: string) => void;
  selectedName: string | null;
  tools: KyronMcpToolSummary[];
}) {
  return (
    <div aria-label="Kyron tools" className="grid max-h-[36rem] content-start gap-3 overflow-auto">
      {groupKyronTools(tools).map((group) => (
        <section className="grid gap-1" key={group.id}>
          <h3 className="px-3 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
            {group.label} ({group.tools.length})
          </h3>
          <ul className="grid gap-1">
            {group.tools.map((tool) => (
              <li key={tool.name}>
                <button
                  aria-current={tool.name === selectedName ? "true" : undefined}
                  className={cn(
                    "grid w-full gap-1 rounded-lg px-3 py-2 text-left text-sm",
                    tool.name === selectedName
                      ? "bg-accent text-foreground"
                      : "text-muted-foreground hover:bg-muted/70 hover:text-foreground",
                  )}
                  onClick={() => onSelect(tool.name)}
                  type="button"
                >
                  <span className="truncate font-mono text-xs">{tool.name}</span>
                  <span className="flex flex-wrap gap-1">
                    <ToolAccessBadge tool={tool} />
                    <QaUseBadge tool={tool} />
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

function QaUseBadge({ tool }: { tool: KyronMcpToolSummary }) {
  if (!tool.qaUse) {
    return null;
  }

  const { label, variant } = QA_USE_LABELS[tool.qaUse];

  return <Badge variant={variant}>{label}</Badge>;
}

function ToolDetail({ tool }: { tool: KyronMcpToolSummary }) {
  return (
    <section aria-label={`Tool ${tool.name}`} className="grid min-w-0 content-start gap-3">
      <div className="grid gap-1">
        <h3 className="font-mono text-sm font-medium break-all">{tool.name}</h3>
        {tool.title ? <p className="text-sm">{tool.title}</p> : null}
        <div className="flex flex-wrap gap-1.5">
          <ToolAccessBadge tool={tool} />
          <QaUseBadge tool={tool} />
          {tool.annotations?.destructiveHint ? (
            <Badge variant="destructive">Destructive</Badge>
          ) : null}
          {tool.annotations?.openWorldHint ? (
            <Badge variant="neutral">External</Badge>
          ) : null}
        </div>
      </div>
      {tool.description ? (
        <p className="text-sm leading-relaxed whitespace-pre-wrap text-muted-foreground">
          {tool.description}
        </p>
      ) : null}
      <details open>
        <summary className="cursor-pointer text-sm font-medium">Input schema</summary>
        <JsonBlock className="mt-2" label="Input schema" value={tool.inputSchema} />
      </details>
      {tool.outputSchema ? (
        <details>
          <summary className="cursor-pointer text-sm font-medium">Output schema</summary>
          <JsonBlock className="mt-2" label="Output schema" value={tool.outputSchema} />
        </details>
      ) : null}
      {tool.explorerAllowed ? (
        <KyronToolRunner toolName={tool.name} />
      ) : (
        <InlineNotice tone="warning">
          This tool is not marked read-only, so the explorer will not run it.
        </InlineNotice>
      )}
    </section>
  );
}

function ToolAccessBadge({ tool }: { tool: KyronMcpToolSummary }) {
  return tool.explorerAllowed ? (
    <Badge variant="success">Read-only</Badge>
  ) : (
    <Badge variant="warning">May change data</Badge>
  );
}

function DownloadManifestButton({ manifest }: { manifest: KyronMcpCapabilityManifest }) {
  function handleDownload() {
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(manifest, null, 2)], { type: "application/json" }),
    );
    const link = document.createElement("a");

    link.href = url;
    link.download = `kyron-mcp-capabilities-${manifest.fetchedAt.slice(0, 10)}.json`;
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <Button onClick={handleDownload} size="sm" type="button" variant="outline">
      <Download aria-hidden="true" />
      Download
    </Button>
  );
}
