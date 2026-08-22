"use client";

import {
  CircleCheck,
  FileStack,
  HardDrive,
  Info,
  Link2,
  RotateCcw,
  Search,
  Unlink,
  Upload,
} from "lucide-react";
import { useMemo, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DeleteSourceFileDialog,
  SourceFileUsageDialog,
} from "@/features/source-library/components/source-file-dialogs";
import { SourceFileList } from "@/features/source-library/components/source-file-list";
import { SourceUploadDialog } from "@/features/source-library/components/source-upload-dialog";
import {
  createSampleSourceFiles,
  getSourceFileType,
} from "@/features/source-library/sample-data";
import type {
  SourceFileRecord,
  SourceFileSort,
  SourceFileTypeFilter,
} from "@/features/source-library/types";
import type { SourceFileListItem } from "@/types/api";

/**
 * Interactive design prototype only. All files and state live in browser memory;
 * this component never calls Blob, database, extraction, or deletion APIs.
 */
export function SourceLibraryConcept() {
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [files, setFiles] = useState<SourceFileRecord[]>(createSampleSourceFiles);
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<SourceFileSort>("recent");
  const [typeFilter, setTypeFilter] =
    useState<SourceFileTypeFilter>("all");
  const [uploadOpen, setUploadOpen] = useState(false);
  const [usageId, setUsageId] = useState<string | null>(null);

  const deleteFile = files.find((file) => file.id === deleteId) ?? null;
  const usageFile = files.find((file) => file.id === usageId) ?? null;
  const visibleFiles = useMemo(
    () => filterAndSortFiles(files, query, typeFilter, sort),
    [files, query, sort, typeFilter],
  );

  function handleUpload(uploadedFiles: SourceFileListItem[]) {
    const newFiles = uploadedFiles.map((file) => ({
      ...file,
      usages: [],
    }));

    setFiles((current) => [...newFiles, ...current]);
    setTypeFilter("all");
    setQuery("");
    setFeedback(
      `${newFiles.length} file${newFiles.length === 1 ? "" : "s"} added to the prototype library.`,
    );
  }

  function handleDelete(id: string) {
    const fileName = files.find((file) => file.id === id)?.name;

    setFiles((current) => current.filter((file) => file.id !== id));
    setDeleteId(null);
    setUsageId((current) => (current === id ? null : current));
    setFeedback(`${fileName ?? "Source file"} deleted from the prototype library.`);
  }

  function handleReset() {
    setFiles(createSampleSourceFiles());
    setDeleteId(null);
    setQuery("");
    setSort("recent");
    setTypeFilter("all");
    setUsageId(null);
    setFeedback("Sample Source Library restored.");
  }

  return (
    <div className="grid gap-6">
      <header className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div className="grid gap-1.5">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-[1.8rem] leading-tight font-bold tracking-[-0.025em]">
              Source Library
            </h1>
            <Badge className="border-primary/25 bg-[#FFF0F2] text-primary" variant="outline">
              Concept
            </Badge>
          </div>
          <p className="text-muted-foreground max-w-2xl text-sm">
            Upload reusable source material, see which workspaces use it, and
            protect active workspaces from broken file references.
          </p>
        </div>
        <Button className="sm:self-end" onClick={() => setUploadOpen(true)} type="button">
          <Upload aria-hidden="true" />
          Upload files
        </Button>
      </header>

      <ConceptNotice />
      <SourceSummary files={files} />

      <section className="bg-card overflow-hidden rounded-xl ring-1 ring-border">
        <div className="border-border grid gap-4 border-b px-4 py-4 sm:px-5">
          <div className="flex flex-col justify-between gap-3 lg:flex-row lg:items-center">
            <div>
              <h2 className="text-base font-bold">All source files</h2>
              <p className="text-muted-foreground mt-1 text-xs">
                {visibleFiles.length} of {files.length} files shown
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button onClick={handleReset} size="sm" type="button" variant="ghost">
                <RotateCcw aria-hidden="true" />
                Reset demo
              </Button>
              <Button onClick={() => setUploadOpen(true)} size="sm" type="button" variant="outline">
                <Upload aria-hidden="true" />
                Upload
              </Button>
            </div>
          </div>

          <div className="grid gap-3 md:grid-cols-[minmax(260px,1fr)_180px_190px]">
            <label className="relative block">
              <span className="sr-only">Search source files</span>
              <Search
                aria-hidden="true"
                className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2"
              />
              <Input
                className="h-9 bg-white pl-9"
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search by file name"
                type="search"
                value={query}
              />
            </label>
            <label>
              <span className="sr-only">Filter by file type</span>
              <select
                className="border-border h-9 w-full rounded-lg border bg-white px-3 text-sm outline-none focus:border-ring focus:ring-3 focus:ring-ring/30"
                onChange={(event) =>
                  setTypeFilter(event.target.value as SourceFileTypeFilter)
                }
                value={typeFilter}
              >
                <option value="all">All file types</option>
                <option value="pdf">PDF</option>
                <option value="pptx">PPTX</option>
                <option value="docx">DOCX</option>
              </select>
            </label>
            <label>
              <span className="sr-only">Sort source files</span>
              <select
                className="border-border h-9 w-full rounded-lg border bg-white px-3 text-sm outline-none focus:border-ring focus:ring-3 focus:ring-ring/30"
                onChange={(event) => setSort(event.target.value as SourceFileSort)}
                value={sort}
              >
                <option value="recent">Recently uploaded</option>
                <option value="name">File name</option>
                <option value="usage">Most used</option>
              </select>
            </label>
          </div>
        </div>

        {feedback ? (
          <div aria-live="polite" className="border-border bg-muted/30 flex items-start gap-2 border-b px-5 py-3 text-xs">
            <CircleCheck aria-hidden="true" className="mt-0.5 size-3.5 shrink-0" />
            <span>{feedback}</span>
            <button
              className="text-muted-foreground hover:text-foreground ml-auto shrink-0 font-medium"
              onClick={() => setFeedback(null)}
              type="button"
            >
              Dismiss
            </button>
          </div>
        ) : null}

        <SourceFileList
          files={visibleFiles}
          onDelete={(file) => setDeleteId(file.id)}
          onViewUsage={(file) => setUsageId(file.id)}
        />
      </section>

      <SourceUploadDialog
        existingNames={files.map((file) => file.name)}
        onClose={() => setUploadOpen(false)}
        onOpenExisting={(fileName) => {
          setQuery(fileName);
          setTypeFilter("all");
          setFeedback("Showing the existing file with the same name.");
        }}
        onUpload={handleUpload}
        open={uploadOpen}
        uploadFile={simulateFileUpload}
      />
      <SourceFileUsageDialog
        file={usageFile}
        onClose={() => setUsageId(null)}
      />
      <DeleteSourceFileDialog
        file={deleteFile}
        onClose={() => setDeleteId(null)}
        onConfirm={handleDelete}
      />
    </div>
  );
}

async function simulateFileUpload(
  file: File,
  options?: {
    signal?: AbortSignal;
    onProgress?: (progress: {
      loaded: number;
      total: number;
      percentage: number;
    }) => void;
  },
) {
  for (const percentage of [25, 60, 100]) {
    await waitForDemoProgress(options?.signal);
    options?.onProgress?.({
      loaded: Math.round((file.size * percentage) / 100),
      total: file.size,
      percentage,
    });
  }

  const type = getSourceFileType(file.name);

  if (!type) {
    throw new Error("Unsupported demo file type.");
  }

  const timestamp = new Date().toISOString();

  return {
    id: crypto.randomUUID(),
    name: file.name,
    size: file.size,
    type,
    workspaceCount: 0,
    uploadedAt: timestamp,
    updatedAt: timestamp,
  } satisfies SourceFileListItem;
}

function waitForDemoProgress(signal?: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    const timeout = window.setTimeout(resolve, 250);

    signal?.addEventListener(
      "abort",
      () => {
        window.clearTimeout(timeout);
        reject(new DOMException("Upload canceled.", "AbortError"));
      },
      { once: true },
    );
  });
}

function ConceptNotice() {
  return (
    <section className="border-border bg-card flex items-start gap-3 rounded-xl border px-4 py-3">
      <Info aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
      <p className="text-muted-foreground text-xs leading-relaxed">
        Prototype only: uploads, usage links, and deletion happen locally. No
        file bytes leave the browser and no records are saved.
      </p>
    </section>
  );
}

function SourceSummary({ files }: { files: SourceFileRecord[] }) {
  const items = [
    {
      label: "Total files",
      value: files.length,
      icon: <FileStack aria-hidden="true" />,
    },
    {
      label: "Storage used",
      value: formatTotalFileSize(files),
      icon: <HardDrive aria-hidden="true" />,
    },
    {
      label: "Used files",
      value: files.filter((file) => file.usages.length > 0).length,
      icon: <Link2 aria-hidden="true" />,
    },
    {
      label: "Unused files",
      value: files.filter((file) => file.usages.length === 0).length,
      icon: <Unlink aria-hidden="true" />,
    },
  ];

  return (
    <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {items.map((item) => (
        <div className="bg-card rounded-xl p-4 ring-1 ring-border" key={item.label}>
          <div className="text-muted-foreground [&>svg]:size-4">{item.icon}</div>
          <p className="mt-4 text-2xl font-bold">{item.value}</p>
          <p className="text-muted-foreground mt-1 text-xs">{item.label}</p>
        </div>
      ))}
    </section>
  );
}

function filterAndSortFiles(
  files: SourceFileRecord[],
  query: string,
  typeFilter: SourceFileTypeFilter,
  sort: SourceFileSort,
): SourceFileRecord[] {
  const normalizedQuery = normalizeName(query);

  return files
    .filter((file) =>
      normalizedQuery ? normalizeName(file.name).includes(normalizedQuery) : true,
    )
    .filter((file) => (typeFilter === "all" ? true : file.type === typeFilter))
    .sort((left, right) => compareFiles(left, right, sort));
}

function compareFiles(
  left: SourceFileRecord,
  right: SourceFileRecord,
  sort: SourceFileSort,
): number {
  if (sort === "name") {
    return left.name.localeCompare(right.name);
  }

  if (sort === "usage") {
    return right.usages.length - left.usages.length;
  }

  return new Date(right.uploadedAt).getTime() - new Date(left.uploadedAt).getTime();
}

function normalizeName(value: string): string {
  return value.trim().toLocaleLowerCase();
}

function formatTotalFileSize(files: SourceFileRecord[]): string {
  const totalBytes = files.reduce((total, file) => total + file.size, 0);

  return `${(totalBytes / 1_048_576).toFixed(1)} MB`;
}
