"use client";

import { ArrowLeft, FileText, Layers3, Plus, X } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { createBatch } from "@/features/batches/api";
import { BatchSourcePicker } from "@/features/batches/components/batch-source-picker";
import { listSourceFiles } from "@/features/source-library/api";
import type { SourceFileListItem } from "@/types/api";

export function NewBatchPage() {
  const router = useRouter();
  const [sourceFiles, setSourceFiles] = useState<SourceFileListItem[]>([]);
  const [batchName, setBatchName] = useState("");
  const [error, setError] = useState("");
  const [loadingFiles, setLoadingFiles] = useState(true);
  const [creating, setCreating] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [selectedSourceIds, setSelectedSourceIds] = useState<string[]>([]);
  const selectedSources = sourceFiles.filter((file) =>
    selectedSourceIds.includes(file.id),
  );
  const canCreate = Boolean(batchName.trim() && selectedSources.length > 0);

  useEffect(() => {
    const controller = new AbortController();

    void listSourceFiles(controller.signal)
      .then((response) => setSourceFiles(response.files))
      .catch((loadError) => {
        if (!controller.signal.aborted) {
          setError(errorMessage(loadError, "Source files could not be loaded."));
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setLoadingFiles(false);
        }
      });

    return () => controller.abort();
  }, []);

  async function handleCreate() {
    if (!canCreate || creating) {
      return;
    }

    setCreating(true);
    setError("");
    try {
      const batch = await createBatch({
        name: batchName,
        sourceFileIds: selectedSourceIds,
      });
      router.push(`/batches/${batch.id}`);
    } catch (createError) {
      setError(errorMessage(createError, "The batch could not be created."));
      setCreating(false);
    }
  }

  return (
    <div className="grid gap-6">
      <header className="grid gap-4">
        <Link
          className="inline-flex w-fit items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground"
          href="/batches"
        >
          <ArrowLeft aria-hidden="true" className="size-4" />
          Back to batches
        </Link>
        <h1 className="text-[1.8rem] leading-tight font-bold tracking-[-0.025em]">
          New batch
        </h1>
        <p className="max-w-2xl text-sm text-muted-foreground">
          Select reusable source files. Each file will create one Draft
          Workspace inside the new batch.
        </p>
      </header>

      {error ? (
        <p className="rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive" role="alert">
          {error}
        </p>
      ) : null}

      <section className="overflow-hidden rounded-xl bg-card ring-1 ring-border">
        <div className="border-b border-border px-5 py-4">
          <h2 className="text-base font-bold">Set up the batch</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            The new batch is saved as a group before automatic setup generation
            begins.
          </p>
        </div>

        <div className="grid gap-6 p-5">
          <label className="grid max-w-xl gap-2 text-sm font-semibold">
            Batch name
            <Input
              maxLength={120}
              onChange={(event) => setBatchName(event.target.value)}
              placeholder="e.g. EM 612 Module 2"
              value={batchName}
            />
          </label>

          <section className="grid gap-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="text-sm font-bold">Source Library files</h3>
                <p className="mt-1 text-xs text-muted-foreground">
                  One selected file creates one independently managed workspace.
                </p>
              </div>
              <Button
                disabled={loadingFiles}
                onClick={() => setPickerOpen(true)}
                type="button"
                variant="outline"
              >
                <Plus aria-hidden="true" />
                Select source files
              </Button>
            </div>

            {selectedSources.length > 0 ? (
              <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border">
                {selectedSources.map((file) => (
                  <li className="flex items-center gap-3 px-4 py-3" key={file.id}>
                    <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-muted">
                      <FileText aria-hidden="true" className="size-4" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold">
                        {file.name}
                      </span>
                      <span className="mt-0.5 block text-xs text-muted-foreground">
                        {file.type.toUpperCase()} · {formatFileSize(file.size)}
                      </span>
                    </span>
                    <Badge variant="outline">
                      {file.type === "docx" ? "AI only" : "Optional attachment"}
                    </Badge>
                    <Button
                      aria-label={`Remove ${file.name}`}
                      onClick={() =>
                        setSelectedSourceIds((current) =>
                          current.filter((id) => id !== file.id),
                        )
                      }
                      size="icon-sm"
                      type="button"
                      variant="ghost"
                    >
                      <X aria-hidden="true" />
                    </Button>
                  </li>
                ))}
              </ul>
            ) : (
              <button
                className="grid min-h-36 place-items-center rounded-xl border border-dashed border-border bg-muted/25 px-5 text-center hover:bg-muted/40"
                onClick={() => setPickerOpen(true)}
                type="button"
              >
                <span>
                  <Layers3
                    aria-hidden="true"
                    className="mx-auto size-6 text-muted-foreground"
                  />
                  <span className="mt-2 block text-sm font-bold">
                    {loadingFiles ? "Loading Source Library…" : "No source files selected"}
                  </span>
                  <span className="mt-1 block text-xs text-muted-foreground">
                    Choose reusable files already saved in Source Library.
                  </span>
                </span>
              </button>
            )}
          </section>

          <CreationFlow selectedCount={selectedSources.length} />
        </div>

        <footer className="flex flex-col justify-between gap-3 border-t border-border bg-muted/20 px-5 py-4 sm:flex-row sm:items-center">
          <p className="text-xs text-muted-foreground">
            {selectedSources.length} workspace
            {selectedSources.length === 1 ? "" : "s"} will be created. AI
            setup generation starts automatically.
          </p>
          <div className="flex gap-2">
            <Link
              className={buttonVariants({ variant: "outline" })}
              href="/batches"
            >
              Cancel
            </Link>
            <Button disabled={!canCreate || creating} onClick={handleCreate} type="button">
              {creating ? "Creating…" : "Create batch"}
            </Button>
          </div>
        </footer>
      </section>

      {pickerOpen ? (
        <BatchSourcePicker
          files={sourceFiles}
          initialSelectedIds={selectedSourceIds}
          onApply={(ids) => {
            setSelectedSourceIds(ids);
            setPickerOpen(false);
          }}
          onClose={() => setPickerOpen(false)}
        />
      ) : null}
    </div>
  );
}

function CreationFlow({ selectedCount }: { selectedCount: number }) {
  const steps = [
    {
      description: `${selectedCount} selected source file${selectedCount === 1 ? "" : "s"}`,
      label: "Create workspaces",
    },
    {
      description: "Runs independently for every workspace",
      label: "Generate AI setups",
    },
    {
      description: "Edit the suggested fields and choose an attachment",
      label: "Human review",
    },
    {
      description: "Submit only the workspaces that are ready",
      label: "Create drafts",
    },
  ];

  return (
    <section className="grid gap-3 rounded-xl border border-border bg-muted/20 p-4">
      <div>
        <h3 className="text-sm font-bold">Batch workflow</h3>
        <p className="mt-1 text-xs text-muted-foreground">
          A Batch is the management group; every item inside it is a normal Draft
          Workspace.
        </p>
      </div>
      <ol className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {steps.map((step, index) => (
          <li className="flex gap-3" key={step.label}>
            <span className="grid size-6 shrink-0 place-items-center rounded-full bg-foreground text-xs font-bold text-background">
              {index + 1}
            </span>
            <span>
              <span className="block text-xs font-bold">{step.label}</span>
              <span className="mt-0.5 block text-xs leading-relaxed text-muted-foreground">
                {step.description}
              </span>
            </span>
          </li>
        ))}
      </ol>
    </section>
  );
}

function formatFileSize(bytes: number): string {
  if (bytes < 1_048_576) {
    return `${Math.max(1, Math.round(bytes / 1_024))} KB`;
  }

  return `${(bytes / 1_048_576).toFixed(1)} MB`;
}

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}
