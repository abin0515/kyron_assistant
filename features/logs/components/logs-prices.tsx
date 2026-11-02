"use client";

import { LoaderCircle, Plus, Trash2 } from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { InlineNotice } from "@/components/ui/inline-notice";
import { Input } from "@/components/ui/input";
import { addModelPrice, listModelPrices, purgeLogs } from "@/features/logs/api";
import { formatTime, messageFromError } from "@/features/logs/components/log-format";
import type { ModelPriceItem } from "@/types/api";

export function LogsPrices({ isAdmin }: { isAdmin: boolean }) {
  const [prices, setPrices] = useState<ModelPriceItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();

    async function load() {
      try {
        const result = await listModelPrices(controller.signal);

        if (!controller.signal.aborted) {
          setPrices(result.prices);
        }
      } catch (loadError) {
        if (!controller.signal.aborted) {
          setError(messageFromError(loadError, "Prices could not be loaded."));
        }
      }
    }

    void load();

    return () => controller.abort();
  }, []);

  return (
    <div className="grid gap-6">
      <Card>
        <CardHeader>
          <CardTitle>Model prices</CardTitle>
          <CardDescription>
            USD per 1M tokens. Each model call stores its cost with the price in effect at that
            moment, so adding a new price never changes past costs. Reasoning tokens are billed as
            output.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          {error ? <InlineNotice tone="error">{error}</InlineNotice> : null}
          {prices === null && !error ? (
            <p className="flex items-center gap-2 text-sm text-muted-foreground" role="status">
              <LoaderCircle aria-hidden="true" className="size-4 animate-spin" />
              Loading prices…
            </p>
          ) : null}
          {prices ? <PriceList prices={prices} /> : null}
          {isAdmin ? <AddPriceForm onSaved={setPrices} /> : null}
        </CardContent>
      </Card>
      {isAdmin ? <PurgeCard /> : null}
    </div>
  );
}

function PriceList({ prices }: { prices: ModelPriceItem[] }) {
  return (
    <ul className="grid divide-y divide-border/80 text-sm">
      {prices.map((price) => (
        <li className="grid gap-0.5 py-2" key={price.id}>
          <p className="flex flex-wrap justify-between gap-2">
            <span className="font-mono text-xs">{price.model}</span>
            <span>
              ${price.inputUsdPerMillion} in · ${price.cachedInputUsdPerMillion} cached · $
              {price.outputUsdPerMillion} out
            </span>
          </p>
          <p className="text-xs text-muted-foreground">
            From {formatTime(price.effectiveFrom)}
            {price.note ? ` · ${price.note}` : ""}
          </p>
        </li>
      ))}
    </ul>
  );
}

function AddPriceForm({ onSaved }: { onSaved: (prices: ModelPriceItem[]) => void }) {
  const [fields, setFields] = useState({ model: "", input: "", cached: "", output: "", note: "" });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError(null);

    try {
      const result = await addModelPrice({
        model: fields.model.trim(),
        inputUsdPerMillion: Number(fields.input),
        cachedInputUsdPerMillion: Number(fields.cached || fields.input),
        outputUsdPerMillion: Number(fields.output),
        note: fields.note,
      });

      onSaved(result.prices);
      setFields({ model: "", input: "", cached: "", output: "", note: "" });
    } catch (saveError) {
      setError(messageFromError(saveError, "The price could not be saved."));
    } finally {
      setSaving(false);
    }
  }

  const update = (key: keyof typeof fields) => (value: string) =>
    setFields((current) => ({ ...current, [key]: value }));

  return (
    <form className="grid gap-2 border-t border-border/80 pt-4" onSubmit={(event) => void handleSubmit(event)}>
      <p className="text-sm font-medium">Add a price (takes effect now)</p>
      <div className="flex flex-wrap items-end gap-2">
        <Field label="Model" onChange={update("model")} value={fields.model} width="w-44" />
        <Field label="Input $" onChange={update("input")} value={fields.input} />
        <Field label="Cached $" onChange={update("cached")} value={fields.cached} />
        <Field label="Output $" onChange={update("output")} value={fields.output} />
        <Field label="Note" onChange={update("note")} value={fields.note} width="w-56" />
        <Button disabled={saving || !fields.model || !fields.input || !fields.output} size="sm" type="submit">
          {saving ? <LoaderCircle aria-hidden="true" className="animate-spin" /> : <Plus aria-hidden="true" />}
          Add
        </Button>
      </div>
      {error ? <InlineNotice tone="error">{error}</InlineNotice> : null}
    </form>
  );
}

function PurgeCard() {
  const [days, setDays] = useState("90");
  const [confirming, setConfirming] = useState(false);
  const [working, setWorking] = useState(false);
  const [message, setMessage] = useState<{ tone: "success" | "error"; text: string } | null>(null);

  async function handlePurge() {
    setWorking(true);
    setMessage(null);

    try {
      const result = await purgeLogs({ olderThanDays: Number(days), confirm: true });

      setMessage({
        tone: "success",
        text: `Deleted ${result.deletedEvents} events and ${result.deletedUsage} usage records.`,
      });
      setConfirming(false);
    } catch (purgeError) {
      setMessage({ tone: "error", text: messageFromError(purgeError, "Logs could not be purged.") });
    } finally {
      setWorking(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Purge old logs</CardTitle>
        <CardDescription>Nothing is deleted automatically. This permanently removes older records.</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-3">
        <div className="flex flex-wrap items-end gap-2">
          <Field label="Keep the last (days)" onChange={setDays} value={days} />
          {confirming ? (
            <>
              <Button disabled={working} onClick={() => setConfirming(false)} size="sm" type="button" variant="outline">
                Cancel
              </Button>
              <Button disabled={working} onClick={() => void handlePurge()} size="sm" type="button" variant="destructive">
                {working ? <LoaderCircle aria-hidden="true" className="animate-spin" /> : <Trash2 aria-hidden="true" />}
                Delete logs older than {days} days
              </Button>
            </>
          ) : (
            <Button
              disabled={!/^[1-9]\d*$/.test(days)}
              onClick={() => setConfirming(true)}
              size="sm"
              type="button"
              variant="ghost"
            >
              <Trash2 aria-hidden="true" />
              Purge…
            </Button>
          )}
        </div>
        {message ? <InlineNotice tone={message.tone}>{message.text}</InlineNotice> : null}
      </CardContent>
    </Card>
  );
}

function Field({
  label,
  onChange,
  value,
  width = "w-24",
}: {
  label: string;
  onChange: (value: string) => void;
  value: string;
  width?: string;
}) {
  return (
    <label className="grid gap-1 text-xs font-medium">
      {label}
      <Input className={`h-9 ${width}`} onChange={(event) => onChange(event.target.value)} value={value} />
    </label>
  );
}
