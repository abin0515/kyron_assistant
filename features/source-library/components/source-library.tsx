"use client";

import {
  CircleAlert,
  FileStack,
  HardDrive,
  RefreshCw,
  Search,
  Upload,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  deleteSourceFile,
  listSourceFiles,
  listSourceFileUsages,
} from "@/features/source-library/api";
import {
  DeleteSourceFileDialog,
  SourceFileUsageDialog,
} from "@/features/source-library/components/source-file-dialogs";
import { SourceFileList } from "@/features/source-library/components/source-file-list";
import { SourceUploadDialog } from "@/features/source-library/components/source-upload-dialog";
import type {
  SourceFileListRecord,
  SourceFileRecord,
  SourceFileSort,
  SourceFileTypeFilter,
} from "@/features/source-library/types";
import type { SourceFileListItem } from "@/types/api";

export function SourceLibrary() {
  const deleteControllerRef = useRef<AbortController | null>(null);
  const detailsControllerRef = useRef<AbortController | null>(null);
  const refreshControllerRef = useRef<AbortController | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [deleteFile, setDeleteFile] = useState<SourceFileRecord | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [files, setFiles] = useState<SourceFileListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<SourceFileSort>("recent");
  const [typeFilter, setTypeFilter] =
    useState<SourceFileTypeFilter>("all");
  const [uploadOpen, setUploadOpen] = useState(false);
  const [usageFile, setUsageFile] = useState<SourceFileRecord | null>(null);

  const visibleFiles = useMemo(
    () => filterAndSortFiles(files, query, typeFilter, sort),
    [files, query, sort, typeFilter],
  );

  const refreshFiles = useCallback(async () => {
    refreshControllerRef.current?.abort();
    const controller = new AbortController();
    refreshControllerRef.current = controller;
    setErrorMessage(null);
    setLoading(true);

    try {
      const response = await listSourceFiles(controller.signal);

      if (!controller.signal.aborted) {
        setFiles(response.files);
      }
    } catch (error) {
      if (!controller.signal.aborted) {
        setErrorMessage(messageFromError(error));
      }
    } finally {
      if (refreshControllerRef.current === controller) {
        refreshControllerRef.current = null;
        setLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    refreshControllerRef.current = controller;

    async function loadInitialFiles() {
      try {
        const response = await listSourceFiles(controller.signal);

        if (!controller.signal.aborted) {
          setFiles(response.files);
        }
      } catch (error) {
        if (!controller.signal.aborted) {
          setErrorMessage(messageFromError(error));
        }
      } finally {
        if (refreshControllerRef.current === controller) {
          refreshControllerRef.current = null;
          setLoading(false);
        }
      }
    }

    void loadInitialFiles();

    return () => controller.abort();
  }, []);

  useEffect(
    () => () => {
      deleteControllerRef.current?.abort();
      detailsControllerRef.current?.abort();
    },
    [],
  );

  function handleUploaded(uploadedFiles: SourceFileListItem[]) {
    const uploadedIds = new Set(uploadedFiles.map((file) => file.id));

    setFiles((current) => [
      ...uploadedFiles,
      ...current.filter((file) => !uploadedIds.has(file.id)),
    ]);
    setQuery("");
    setSort("recent");
    setTypeFilter("all");
    setFeedback(
      `${uploadedFiles.length} file${uploadedFiles.length === 1 ? "" : "s"} uploaded.`,
    );
  }

  async function handleViewUsage(file: SourceFileListRecord) {
    const detailedFile = await loadFileWithUsages(file);

    if (detailedFile) {
      setUsageFile(detailedFile);
    }
  }

  async function handleDeleteRequest(file: SourceFileListRecord) {
    setDeleteError(null);

    if (file.workspaceCount === 0) {
      setDeleteFile({ ...file, usages: [] });
      return;
    }

    const detailedFile = await loadFileWithUsages(file);

    if (detailedFile) {
      setDeleteFile(detailedFile);
    }
  }

  async function loadFileWithUsages(
    file: SourceFileListRecord,
  ): Promise<SourceFileRecord | null> {
    detailsControllerRef.current?.abort();
    const controller = new AbortController();
    detailsControllerRef.current = controller;
    setErrorMessage(null);

    try {
      const response = await listSourceFileUsages(file.id, controller.signal);

      if (controller.signal.aborted) {
        return null;
      }

      return {
        ...file,
        usages: response.usages.map((usage) => ({
          purpose: usage.purpose,
          workspaceId: usage.workspaceId,
          workspaceTitle: usage.workspaceTitle,
        })),
      };
    } catch (error) {
      if (!controller.signal.aborted) {
        setErrorMessage(messageFromError(error));
      }

      return null;
    } finally {
      if (detailsControllerRef.current === controller) {
        detailsControllerRef.current = null;
      }
    }
  }

  async function handleDelete(id: string) {
    deleteControllerRef.current?.abort();
    const controller = new AbortController();
    deleteControllerRef.current = controller;
    setDeleteError(null);
    setDeleting(true);

    try {
      await deleteSourceFile(id, controller.signal);

      if (!controller.signal.aborted) {
        const fileName = deleteFile?.name ?? "Source file";
        setFiles((current) => current.filter((file) => file.id !== id));
        setDeleteFile(null);
        setFeedback(`${fileName} deleted.`);
      }
    } catch (error) {
      if (!controller.signal.aborted) {
        setDeleteError(messageFromError(error));
      }
    } finally {
      if (deleteControllerRef.current === controller) {
        deleteControllerRef.current = null;
        setDeleting(false);
      }
    }
  }

  return (
    <div className="grid gap-6">
      <header className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div className="grid gap-1.5">
          <h1 className="font-heading text-[1.8rem] leading-tight font-light tracking-[-0.025em]">
            Source Library
          </h1>
          <p className="text-muted-foreground max-w-2xl text-sm">
            Upload reusable course materials and see whether they are linked to
            draft workspaces.
          </p>
        </div>
        <Button onClick={() => setUploadOpen(true)} size="lg" type="button">
          <Upload aria-hidden="true" />
          Upload files
        </Button>
      </header>

      <SourceSummary files={files} />

      <section className="bg-card overflow-hidden rounded-xl ring-1 ring-border">
        <div className="border-border grid gap-4 border-b px-4 py-4 sm:px-5">
          <div className="flex flex-col justify-between gap-3 lg:flex-row lg:items-center">
            <div>
              <h2 className="text-base font-semibold">All source files</h2>
              <p className="text-muted-foreground mt-1 text-xs">
                {visibleFiles.length} of {files.length} files shown
              </p>
            </div>
            <Button
              disabled={loading}
              onClick={() => void refreshFiles()}
              size="sm"
              type="button"
              variant="outline"
            >
              <RefreshCw
                aria-hidden="true"
                className={loading ? "animate-spin" : undefined}
              />
              Refresh
            </Button>
          </div>

          <SourceFileControls
            onQueryChange={setQuery}
            onSortChange={setSort}
            onTypeChange={setTypeFilter}
            query={query}
            sort={sort}
            typeFilter={typeFilter}
          />
        </div>

        {feedback ? (
          <FeedbackMessage
            message={feedback}
            onDismiss={() => setFeedback(null)}
          />
        ) : null}
        {errorMessage ? (
          <ErrorMessage
            message={errorMessage}
            onRetry={() => void refreshFiles()}
          />
        ) : null}

        {loading && files.length === 0 ? (
          <LoadingFiles />
        ) : (
          <SourceFileList
            files={visibleFiles}
            onDelete={(file) => void handleDeleteRequest(file)}
            onViewUsage={(file) => void handleViewUsage(file)}
          />
        )}
      </section>

      <SourceUploadDialog
        existingNames={files.map((file) => file.name)}
        onClose={() => setUploadOpen(false)}
        onOpenExisting={(fileName) => {
          setQuery(fileName);
          setTypeFilter("all");
          setUploadOpen(false);
        }}
        onUpload={handleUploaded}
        open={uploadOpen}
      />
      <SourceFileUsageDialog
        file={usageFile}
        onClose={() => setUsageFile(null)}
        workspaceHref={(workspaceId) => `/drafts/${workspaceId}`}
      />
      <DeleteSourceFileDialog
        busy={deleting}
        errorMessage={deleteError}
        file={deleteFile}
        onClose={() => {
          setDeleteError(null);
          setDeleteFile(null);
        }}
        onConfirm={(id) => void handleDelete(id)}
      />
    </div>
  );
}

function SourceFileControls({
  onQueryChange,
  onSortChange,
  onTypeChange,
  query,
  sort,
  typeFilter,
}: {
  onQueryChange: (query: string) => void;
  onSortChange: (sort: SourceFileSort) => void;
  onTypeChange: (type: SourceFileTypeFilter) => void;
  query: string;
  sort: SourceFileSort;
  typeFilter: SourceFileTypeFilter;
}) {
  return (
    <div className="grid gap-3 md:grid-cols-[minmax(260px,1fr)_180px_190px]">
      <label className="relative block">
        <span className="sr-only">Search source files</span>
        <Search
          aria-hidden="true"
          className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2"
        />
        <Input
          className="h-9 bg-white pl-9"
          onChange={(event) => onQueryChange(event.target.value)}
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
            onTypeChange(event.target.value as SourceFileTypeFilter)
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
          onChange={(event) =>
            onSortChange(event.target.value as SourceFileSort)
          }
          value={sort}
        >
          <option value="recent">Recently uploaded</option>
          <option value="name">File name</option>
          <option value="usage">Most used</option>
        </select>
      </label>
    </div>
  );
}

function SourceSummary({ files }: { files: SourceFileListItem[] }) {
  const totalBytes = files.reduce((total, file) => total + file.size, 0);
  const linkedFiles = files.filter((file) => file.workspaceCount > 0).length;
  const items = [
    {
      icon: <FileStack aria-hidden="true" />,
      label: "Total files",
      value: files.length,
    },
    {
      icon: <HardDrive aria-hidden="true" />,
      label: "Storage used",
      value: formatTotalFileSize(totalBytes),
    },
    {
      icon: <FileStack aria-hidden="true" />,
      label: "Linked to workspaces",
      value: linkedFiles,
    },
  ];

  return (
    <section className="grid gap-3 sm:grid-cols-3">
      {items.map((item) => (
        <div className="bg-card rounded-xl p-4 ring-1 ring-border" key={item.label}>
          <div className="text-muted-foreground [&>svg]:size-4">{item.icon}</div>
          <p className="mt-4 text-2xl font-semibold">{item.value}</p>
          <p className="text-muted-foreground mt-1 text-xs">{item.label}</p>
        </div>
      ))}
    </section>
  );
}

function FeedbackMessage({
  message,
  onDismiss,
}: {
  message: string;
  onDismiss: () => void;
}) {
  return (
    <div
      aria-live="polite"
      className="border-border bg-muted/30 flex items-start gap-2 border-b px-5 py-3 text-xs"
    >
      <span>{message}</span>
      <button
        className="text-muted-foreground hover:text-foreground ml-auto font-medium"
        onClick={onDismiss}
        type="button"
      >
        Dismiss
      </button>
    </div>
  );
}

function ErrorMessage({
  message,
  onRetry,
}: {
  message: string;
  onRetry: () => void;
}) {
  return (
    <div className="border-border text-destructive flex items-start gap-2 border-b px-5 py-3 text-xs">
      <CircleAlert aria-hidden="true" className="mt-0.5 size-3.5 shrink-0" />
      <span>{message}</span>
      <button className="ml-auto font-semibold" onClick={onRetry} type="button">
        Try again
      </button>
    </div>
  );
}

function LoadingFiles() {
  return (
    <div className="grid min-h-56 place-items-center px-5 py-12 text-sm text-muted-foreground">
      <RefreshCw aria-hidden="true" className="mb-3 size-5 animate-spin" />
      Loading source files...
    </div>
  );
}

function filterAndSortFiles(
  files: SourceFileListItem[],
  query: string,
  typeFilter: SourceFileTypeFilter,
  sort: SourceFileSort,
) {
  const normalizedQuery = query.trim().toLocaleLowerCase();

  return files
    .filter((file) =>
      normalizedQuery
        ? file.name.toLocaleLowerCase().includes(normalizedQuery)
        : true,
    )
    .filter((file) => (typeFilter === "all" ? true : file.type === typeFilter))
    .sort((left, right) => compareFiles(left, right, sort));
}

function compareFiles(
  left: SourceFileListItem,
  right: SourceFileListItem,
  sort: SourceFileSort,
) {
  if (sort === "name") {
    return left.name.localeCompare(right.name);
  }

  if (sort === "usage") {
    return right.workspaceCount - left.workspaceCount;
  }

  return new Date(right.uploadedAt).getTime() - new Date(left.uploadedAt).getTime();
}

function formatTotalFileSize(bytes: number) {
  if (bytes < 1_048_576) {
    return `${Math.round(bytes / 1_024)} KB`;
  }

  return `${(bytes / 1_048_576).toFixed(1)} MB`;
}

function messageFromError(error: unknown) {
  return error instanceof Error
    ? error.message
    : "The source files could not be loaded.";
}
