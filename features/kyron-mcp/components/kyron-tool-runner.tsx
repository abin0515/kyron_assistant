"use client";

import { LoaderCircle, Play } from "lucide-react";
import { useEffect, useRef, useState, type FormEvent } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { InlineNotice } from "@/components/ui/inline-notice";
import { Textarea } from "@/components/ui/textarea";
import { runKyronTool } from "@/features/kyron-mcp/api";
import { JsonBlock } from "@/components/ui/json-block";
import type { KyronMcpContentItem, KyronMcpToolCallResponse } from "@/types/api";

type RunState =
  | { status: "idle" }
  | { status: "running" }
  | { status: "error"; message: string }
  | { status: "done"; response: KyronMcpToolCallResponse };

export function KyronToolRunner({ toolName }: { toolName: string }) {
  const controllerRef = useRef<AbortController | null>(null);
  const [argumentsText, setArgumentsText] = useState("{}");
  const [state, setState] = useState<RunState>({ status: "idle" });

  useEffect(() => () => controllerRef.current?.abort(), []);

  async function handleRun(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const args = parseArguments(argumentsText);

    if (!args) {
      setState({ status: "error", message: "Arguments must be a JSON object, such as {}." });
      return;
    }

    const controller = new AbortController();
    controllerRef.current?.abort();
    controllerRef.current = controller;
    setState({ status: "running" });

    try {
      const response = await runKyronTool({ name: toolName, arguments: args }, controller.signal);

      if (!controller.signal.aborted) {
        setState({ status: "done", response });
      }
    } catch (error) {
      if (!controller.signal.aborted) {
        setState({
          status: "error",
          message: error instanceof Error ? error.message : "The tool could not be run.",
        });
      }
    }
  }

  return (
    <form className="grid gap-3" onSubmit={(event) => void handleRun(event)}>
      <label className="grid gap-1.5 text-sm font-medium" htmlFor={`arguments-${toolName}`}>
        Arguments (JSON)
        <Textarea
          className="min-h-24 font-mono text-xs"
          id={`arguments-${toolName}`}
          onChange={(event) => setArgumentsText(event.target.value)}
          spellCheck={false}
          value={argumentsText}
        />
      </label>
      <div>
        <Button disabled={state.status === "running"} size="sm" type="submit">
          {state.status === "running" ? (
            <LoaderCircle aria-hidden="true" className="animate-spin" />
          ) : (
            <Play aria-hidden="true" />
          )}
          Run read-only tool
        </Button>
      </div>
      {state.status === "error" ? <InlineNotice tone="error">{state.message}</InlineNotice> : null}
      {state.status === "done" ? <ToolResult response={state.response} /> : null}
    </form>
  );
}

function ToolResult({ response }: { response: KyronMcpToolCallResponse }) {
  const { result } = response;

  return (
    <section aria-label="Tool result" className="grid gap-2">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="font-medium">Result</span>
        {result.isError ? (
          <Badge variant="destructive">Tool reported an error</Badge>
        ) : (
          <Badge variant="success">OK</Badge>
        )}
        <span className="text-muted-foreground">{response.durationMs} ms</span>
      </div>
      {result.truncated ? (
        <InlineNotice tone="warning">
          The result was long, so only the first part is shown.
        </InlineNotice>
      ) : null}
      {result.content.map((item, index) => (
        <ContentItem item={item} key={index} />
      ))}
      {result.structuredContent ? (
        <JsonBlock label="Structured content" value={result.structuredContent} />
      ) : null}
    </section>
  );
}

function ContentItem({ item }: { item: KyronMcpContentItem }) {
  switch (item.type) {
    case "text":
      return <JsonBlock label="Text content" value={formatMaybeJson(item.text)} />;
    case "image":
    case "audio":
      return (
        <p className="text-sm text-muted-foreground">
          {item.type === "image" ? "Image" : "Audio"} ({item.mimeType || "unknown type"},{" "}
          {item.byteLength.toLocaleString()} bytes)
        </p>
      );
    case "resource_link":
      return (
        <p className="text-sm break-all">
          Link: <code>{item.uri}</code>
          {item.name ? ` (${item.name})` : null}
          {item.mimeType ? ` · ${item.mimeType}` : null}
        </p>
      );
    case "resource":
      return (
        <div className="grid gap-1 text-sm">
          <p className="break-all">
            Resource: <code>{item.uri}</code>
            {item.mimeType ? ` · ${item.mimeType}` : null}
            {item.byteLength !== null ? ` · ${item.byteLength.toLocaleString()} bytes` : null}
          </p>
          {item.text ? <JsonBlock label="Resource text" value={formatMaybeJson(item.text)} /> : null}
        </div>
      );
    default:
      return <JsonBlock label="Unrecognized content" value={item.raw} />;
  }
}

function parseArguments(text: string): Record<string, unknown> | null {
  try {
    const value: unknown = JSON.parse(text.trim() || "{}");

    return typeof value === "object" && value !== null && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

function formatMaybeJson(text: string): string {
  try {
    return JSON.stringify(JSON.parse(text), null, 2);
  } catch {
    return text;
  }
}
