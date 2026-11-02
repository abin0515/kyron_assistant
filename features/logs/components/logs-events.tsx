"use client";

import { Download, LoaderCircle } from "lucide-react";
import { useEffect, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { InlineNotice } from "@/components/ui/inline-notice";
import { Input } from "@/components/ui/input";
import { JsonBlock } from "@/components/ui/json-block";
import { exportUrl, listLogEvents, type EventQuery } from "@/features/logs/api";
import { LogsPager } from "@/features/logs/components/logs-pager";
import { formatTime, messageFromError } from "@/features/logs/components/log-format";
import type { LogEventItem, LogEventListResponse } from "@/types/api";

const CATEGORIES = ["", "auth", "openai", "kyron_api", "kyron_mcp", "qa", "draft", "system"];
const LEVELS = ["", "info", "warn", "error"];

type EventsState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; result: LogEventListResponse };

export function LogsEvents() {
  const [query, setQuery] = useState<EventQuery>({ category: "", level: "", search: "", page: 1 });
  const [searchText, setSearchText] = useState("");
  const [state, setState] = useState<EventsState>({ status: "loading" });

  useEffect(() => {
    const controller = new AbortController();

    async function load() {
      try {
        const result = await listLogEvents(query, controller.signal);

        if (!controller.signal.aborted) {
          setState({ status: "ready", result });
        }
      } catch (error) {
        if (!controller.signal.aborted) {
          setState({ status: "error", message: messageFromError(error, "Events could not be loaded.") });
        }
      }
    }

    void load();

    return () => controller.abort();
  }, [query]);

  return (
    <div className="grid gap-4">
      <form
        className="flex flex-wrap items-end gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          setQuery((current) => ({ ...current, search: searchText, page: 1 }));
        }}
      >
        <FilterSelect label="Category" onChange={(category) => setQuery((current) => ({ ...current, category, page: 1 }))} options={CATEGORIES} value={query.category} />
        <FilterSelect label="Level" onChange={(level) => setQuery((current) => ({ ...current, level, page: 1 }))} options={LEVELS} value={query.level} />
        <label className="grid gap-1 text-xs font-medium">
          Search
          <Input className="h-9 w-56" onChange={(event) => setSearchText(event.target.value)} placeholder="Message or event" value={searchText} />
        </label>
        <div className="ml-auto flex gap-2">
          <a className={buttonVariants({ size: "sm", variant: "outline" })} href={exportUrl("events", "csv")}>
            <Download aria-hidden="true" />
            CSV
          </a>
          <a className={buttonVariants({ size: "sm", variant: "outline" })} href={exportUrl("events", "json")}>
            <Download aria-hidden="true" />
            JSON
          </a>
        </div>
      </form>

      {state.status === "loading" ? (
        <p className="flex items-center gap-2 text-sm text-muted-foreground" role="status">
          <LoaderCircle aria-hidden="true" className="size-4 animate-spin" />
          Loading events…
        </p>
      ) : null}
      {state.status === "error" ? <InlineNotice tone="error">{state.message}</InlineNotice> : null}
      {state.status === "ready" ? (
        <Card>
          <CardContent>
            {state.result.events.length === 0 ? (
              <p className="text-sm text-muted-foreground">No events match.</p>
            ) : (
              <ul className="grid divide-y divide-border/80">
                {state.result.events.map((event) => (
                  <EventRow event={event} key={event.id} />
                ))}
              </ul>
            )}
            <LogsPager
              onPage={(page) => setQuery((current) => ({ ...current, page }))}
              pagination={state.result.pagination}
            />
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}

function EventRow({ event }: { event: LogEventItem }) {
  return (
    <li className="py-2 text-sm">
      <details>
        <summary className="flex cursor-pointer flex-wrap items-center gap-2">
          <span className="text-xs text-muted-foreground">{formatTime(event.occurredAt)}</span>
          <Badge variant={event.level === "error" ? "destructive" : event.level === "warn" ? "warning" : "neutral"}>
            {event.level}
          </Badge>
          <Badge variant="outline">{event.category}</Badge>
          <span className="min-w-0 flex-1">{event.message}</span>
          {event.durationMs !== null ? (
            <span className="text-xs text-muted-foreground">{event.durationMs} ms</span>
          ) : null}
        </summary>
        <JsonBlock
          className="mt-2"
          label="Event details"
          value={{
            event: event.event,
            actor: event.actorId,
            role: event.actorRole,
            qaRunId: event.qaRunId,
            workspaceId: event.workspaceId,
            kyronDraftId: event.kyronDraftId,
            data: event.data,
          }}
        />
      </details>
    </li>
  );
}

function FilterSelect({
  label,
  onChange,
  options,
  value,
}: {
  label: string;
  onChange: (value: string) => void;
  options: string[];
  value: string;
}) {
  return (
    <label className="grid gap-1 text-xs font-medium">
      {label}
      <select
        className="h-9 rounded-lg border border-input bg-card px-2 text-sm"
        onChange={(event) => onChange(event.target.value)}
        value={value}
      >
        {options.map((option) => (
          <option key={option} value={option}>
            {option || "All"}
          </option>
        ))}
      </select>
    </label>
  );
}
