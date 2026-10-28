"use client";

import {
  FileStack,
  HardDrive,
  RefreshCw,
  Search,
  Upload,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { InlineNotice } from "@/components/ui/inline-notice";
import { PageHeader } from "@/components/ui/page-header";
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
import type {
  PaginationMeta,
  SourceFileListItem,
  SourceFileListResponse,
} from "@/types/api";

const EMPTY_PAGINATION: PaginationMeta = {
  page: 1,
  perPage: 25,
  totalCount: 0,
  totalPages: 0,
};

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
  const [loadingMore, setLoadingMore] = useState(false);
  const [pagination, setPagination] = useState(EMPTY_PAGINATION);
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<SourceFileSort>("recent");
  const [typeFilter, setTypeFilter] =
    useState<SourceFileTypeFilter>("all");
  const [uploadOpen, setUploadOpen] = useState(false);
  const [usageFile, setUsageFile] = useState<SourceFileRecord | null>(null);
  const [summary, setSummary] = useState<SourceFileListResponse["summary"]>({
    totalBytes: 0,
    linkedFiles: 0,
  });

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
      const response = await listSourceFiles({ page: 1 }, controller.signal);

      if (!controller.signal.aborted) {
        setFiles(response.files);
        setPagination(response.pagination);
        setSummary(response.summary);
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
        const response = await listSourceFiles({ page: 1 }, controller.signal);

        if (!controller.signal.aborted) {
          setFiles(response.files);
          setPagination(response.pagination);
          setSummary(response.summary);
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
    setPagination((current) => ({
      ...current,
      totalCount: current.totalCount + uploadedFiles.length,
      totalPages: Math.ceil(
        (current.totalCount + uploadedFiles.length) / current.perPage,
      ),
    }));
    setSummary((current) => ({
      ...current,
      totalBytes:
        current.totalBytes +
        uploadedFiles.reduce((total, file) => total + file.size, 0),
    }));
    setQuery("");
    setSort("recent");
    setTypeFilter("all");
    setFeedback(
      `${uploadedFiles.length} file${uploadedFiles.length === 1 ? "" : "s"} uploaded.`,
    );
    void refreshFiles();
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
          state: usage.state,
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
        setPagination((current) => {
          const totalCount = Math.max(0, current.totalCount - 1);

          return {
            ...current,
            totalCount,
            totalPages:
              totalCount === 0 ? 0 : Math.ceil(totalCount / current.perPage),
          };
        });
        setSummary((current) => ({
          totalBytes: Math.max(
            0,
            current.totalBytes - (deleteFile?.size ?? 0),
          ),
          linkedFiles: Math.max(
            0,
            current.linkedFiles - (deleteFile?.workspaceCount ? 1 : 0),
          ),
        }));
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

  async function loadMoreFiles() {
    if (loadingMore || pagination.page >= pagination.totalPages) {
      return;
    }

    setLoadingMore(true);
    setErrorMessage(null);

    try {
      const response = await listSourceFiles({
        page: pagination.page + 1,
      });
      setFiles((current) => {
        const existingIds = new Set(current.map((file) => file.id));

        return [
          ...current,
          ...response.files.filter((file) => !existingIds.has(file.id)),
        ];
      });
      setPagination(response.pagination);
      setSummary(response.summary);
    } catch (error) {
      setErrorMessage(messageFromError(error));
    } finally {
      setLoadingMore(false);
    }
  }

  return (
    <div className="grid gap-6">
      <PageHeader
        actions={
          <Button onClick={() => setUploadOpen(true)} size="lg" type="button">
            <Upload aria-hidden="true" />
            Upload files
          </Button>
        }
        description="Upload reusable course materials and see whether they are linked to draft workspaces."
        title="Source Library"
      />

      <SourceSummary
        linkedFiles={summary.linkedFiles}
        totalBytes={summary.totalBytes}
        totalFiles={pagination.totalCount}
      />

      <section className="overflow-hidden rounded-xl border border-border/90 bg-card">
        <div className="grid gap-4 border-b border-border/80 px-4 py-5 sm:px-5">
          <div className="flex flex-col justify-between gap-3 lg:flex-row lg:items-center">
            <div>
              <h2 className="text-base font-semibold">All source files</h2>
              <p className="text-muted-foreground mt-1 text-xs">
                {visibleFiles.length} shown · {files.length} of {pagination.totalCount} loaded
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
        {pagination.page < pagination.totalPages ? (
          <div className="border-border flex justify-center border-t px-5 py-4">
            <Button
              disabled={loadingMore}
              onClick={() => void loadMoreFiles()}
              size="sm"
              type="button"
              variant="outline"
            >
              <RefreshCw
                aria-hidden="true"
                className={loadingMore ? "animate-spin" : undefined}
              />
              Load more
            </Button>
          </div>
        ) : null}
      </section>

      <SourceUploadDialog
        allowFolderSelection
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
          className="pl-9"
          onChange={(event) => onQueryChange(event.target.value)}
          placeholder="Search by file name"
          type="search"
          value={query}
        />
      </label>
      <label>
        <span className="sr-only">Filter by file type</span>
        <select
          className="h-10 w-full rounded-lg border border-input bg-card px-3.5 text-sm shadow-xs outline-none focus:border-ring focus:ring-3 focus:ring-ring/20"
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
          className="h-10 w-full rounded-lg border border-input bg-card px-3.5 text-sm shadow-xs outline-none focus:border-ring focus:ring-3 focus:ring-ring/20"
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

function SourceSummary({
  linkedFiles,
  totalBytes,
  totalFiles,
}: {
  linkedFiles: number;
  totalBytes: number;
  totalFiles: number;
}) {
  const items = [
    {
      icon: <FileStack aria-hidden="true" />,
      label: "Total files",
      value: totalFiles,
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
    <section className="grid overflow-hidden rounded-xl border border-border/90 bg-card sm:grid-cols-3 sm:divide-x sm:divide-border/80">
      {items.map((item) => (
        <div className="flex items-center gap-3 border-b border-border/80 p-4 last:border-b-0 sm:border-b-0 sm:px-5" key={item.label}>
          <span className="grid size-9 place-items-center rounded-lg bg-muted text-muted-foreground [&>svg]:size-4">
            {item.icon}
          </span>
          <div>
            <p className="text-lg font-semibold leading-none">{item.value}</p>
            <p className="mt-1.5 text-xs text-muted-foreground">{item.label}</p>
          </div>
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
    <InlineNotice
      actions={
        <button className="font-medium" onClick={onDismiss} type="button">
          Dismiss
        </button>
      }
      className="rounded-none border-x-0 border-t-0 text-xs"
      tone="success"
    >
      {message}
    </InlineNotice>
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
    <InlineNotice
      actions={
        <button className="font-semibold" onClick={onRetry} type="button">
          Try again
        </button>
      }
      className="rounded-none border-x-0 border-t-0 text-xs"
      tone="error"
    >
      {message}
    </InlineNotice>
  );
}

function LoadingFiles() {
  return (
    <div className="grid gap-3 px-5 py-6" aria-label="Loading source files">
      {[0, 1, 2, 3].map((item) => (
        <div className="h-14 animate-pulse rounded-lg bg-muted/70" key={item} />
      ))}
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
