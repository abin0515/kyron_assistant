"use client";

import {
  ChevronRight,
  CircleCheck,
  Folder,
  FolderOpen,
  FolderPlus,
  Info,
  LoaderCircle,
  X,
} from "lucide-react";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DraftApiError } from "@/features/drafts/shared/api-response";
import {
  createKyronFolder,
  listKyronFolders,
} from "@/features/drafts/workspaces/kyron-folder-api";
import { cn } from "@/lib/utils";
import type {
  KyronAssetFolderItem,
  KyronDestination,
  KyronFolderPathItem,
  PaginationMeta,
} from "@/types/api";

type KyronDestinationFieldProps = {
  className?: string;
  description?: string;
  destination: KyronDestination;
  disabled?: boolean;
  label?: string;
  onChange: (destination: KyronDestination) => Promise<void> | void;
};

export function KyronDestinationField({
  className,
  description = "Choose where this asset will be created in the shared Kyron Studio library.",
  destination,
  disabled = false,
  label = "Kyron destination",
  onChange,
}: KyronDestinationFieldProps) {
  const [open, setOpen] = useState(false);

  return (
    <section
      className={cn("grid gap-3 border-t border-border pt-5", className)}
    >
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
        <div className="grid gap-1">
          <p className="text-sm font-semibold">{label}</p>
          <p className="max-w-xl text-xs text-muted-foreground">
            {description}
          </p>
        </div>
        {!disabled ? (
          <Button
            className="w-fit"
            onClick={() => setOpen(true)}
            type="button"
            variant="outline"
          >
            <FolderOpen aria-hidden="true" />
            Change folder
          </Button>
        ) : null}
      </div>

      <div className="flex items-center gap-3 rounded-xl border border-border bg-card px-4 py-3">
        <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-muted">
          <Folder aria-hidden="true" className="size-4" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold">
            {formatDestination(destination)}
          </p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {destination.folderId === null
              ? "The asset will be created at the top level."
              : "This destination is saved with the workspace until submission."}
          </p>
        </div>
        <CircleCheck
          aria-label="Destination selected"
          className="size-4 shrink-0 text-emerald-700"
        />
      </div>

      {disabled ? (
        <p className="text-xs text-muted-foreground">
          The destination cannot be changed after Kyron submission starts.
        </p>
      ) : null}

      {open ? (
        <KyronFolderPickerDialog
          initialPath={destination.path}
          onClose={() => setOpen(false)}
          onSelect={onChange}
        />
      ) : null}
    </section>
  );
}

function KyronFolderPickerDialog({
  initialPath,
  onClose,
  onSelect,
}: {
  initialPath: KyronFolderPathItem[];
  onClose: () => void;
  onSelect: (destination: KyronDestination) => Promise<void> | void;
}) {
  const [browsePath, setBrowsePath] =
    useState<KyronFolderPathItem[]>(initialPath);
  const [folders, setFolders] = useState<KyronAssetFolderItem[]>([]);
  const [pagination, setPagination] = useState<PaginationMeta | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [saving, setSaving] = useState(false);
  const [creating, setCreating] = useState(false);
  const [creatingFolder, setCreatingFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
  const [error, setError] = useState("");
  const parentId = browsePath.at(-1)?.id ?? null;

  useEffect(() => {
    const controller = new AbortController();

    void listKyronFolders(parentId, 1, controller.signal)
      .then((result) => {
        if (!controller.signal.aborted) {
          setFolders(result.folders);
          setPagination(result.pagination);
        }
      })
      .catch((loadError) => {
        if (!controller.signal.aborted) {
          setFolders([]);
          setPagination(null);
          setError(folderErrorMessage(loadError));
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      });

    return () => controller.abort();
  }, [parentId]);

  useEffect(() => {
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape" && !saving && !creatingFolder) {
        onClose();
      }
    }

    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [creatingFolder, onClose, saving]);

  async function loadMore() {
    if (!pagination || pagination.page >= pagination.totalPages || loadingMore) {
      return;
    }

    setLoadingMore(true);
    setError("");
    try {
      const result = await listKyronFolders(parentId, pagination.page + 1);
      setFolders((current) => [
        ...current,
        ...result.folders.filter(
          (folder) => !current.some((item) => item.id === folder.id),
        ),
      ]);
      setPagination(result.pagination);
    } catch (loadError) {
      setError(folderErrorMessage(loadError));
    } finally {
      setLoadingMore(false);
    }
  }

  async function saveDestination(
    destination: KyronDestination,
    createdInKyron: boolean,
  ) {
    setSaving(true);
    setError("");
    try {
      await onSelect(destination);
      onClose();
    } catch (saveError) {
      setError(
        createdInKyron
          ? "The folder was created in Kyron, but the workspace destination was not saved. Choose this folder again to retry saving."
          : messageFromError(
              saveError,
              "The Kyron destination could not be saved.",
            ),
      );
    } finally {
      setSaving(false);
    }
  }

  async function createFolder() {
    const name = newFolderName.trim();

    if (!name) {
      setError("Enter a folder name.");
      return;
    }

    if (
      folders.some(
        (folder) => folder.name.toLocaleLowerCase() === name.toLocaleLowerCase(),
      )
    ) {
      setError("A folder with this name already exists in the current location.");
      return;
    }

    setCreatingFolder(true);
    setError("");
    try {
      const folder = await createKyronFolder(name, parentId);
      const nextPath = [...browsePath, { id: folder.id, name: folder.name }];
      setLoading(true);
      setBrowsePath(nextPath);
      setCreating(false);
      setNewFolderName("");
      await saveDestination(
        { folderId: folder.id, path: nextPath },
        true,
      );
    } catch (createError) {
      setError(folderErrorMessage(createError));
    } finally {
      setCreatingFolder(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-black/45 p-4"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !saving && !creatingFolder) {
          onClose();
        }
      }}
    >
      <section
        aria-labelledby="kyron-folder-picker-title"
        aria-modal="true"
        className="flex max-h-[88vh] w-full max-w-2xl flex-col overflow-hidden rounded-xl bg-card ring-1 ring-black/10"
        role="dialog"
      >
        <header className="flex items-start justify-between gap-4 border-b border-border px-5 py-4">
          <div>
            <h2 className="text-lg font-bold" id="kyron-folder-picker-title">
              Choose Kyron destination
            </h2>
            <p className="mt-1 text-xs text-muted-foreground">
              Browse nested folders or create a folder in the current location.
            </p>
          </div>
          <Button
            aria-label="Close Kyron folder picker"
            disabled={saving || creatingFolder}
            onClick={onClose}
            size="icon-sm"
            type="button"
            variant="ghost"
          >
            <X aria-hidden="true" />
          </Button>
        </header>

        <div className="border-b border-border bg-amber-50 px-5 py-3 text-amber-950">
          <p className="flex items-start gap-2 text-xs leading-5">
            <Info aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
            Changes made here affect the shared Kyron Studio library used by
            the internal team.
          </p>
        </div>

        <div className="flex flex-col gap-3 border-b border-border px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
          <FolderBreadcrumb
            path={browsePath}
            onBrowse={(index) => {
              setLoading(true);
              setBrowsePath(index < 0 ? [] : browsePath.slice(0, index + 1));
              setCreating(false);
              setError("");
            }}
          />
          <Button
            className="w-fit"
            disabled={loading || saving || creatingFolder}
            onClick={() => {
              setCreating(true);
              setError("");
            }}
            size="sm"
            type="button"
            variant="outline"
          >
            <FolderPlus aria-hidden="true" />
            {browsePath.length === 0 ? "New folder" : "New subfolder"}
          </Button>
        </div>

        {creating ? (
          <div className="grid gap-2 border-b border-border bg-muted/25 px-5 py-4">
            <label className="text-sm font-semibold" htmlFor="new-kyron-folder-name">
              {browsePath.length === 0 ? "New folder" : "New subfolder"} in{" "}
              {currentLocationName(browsePath)}
            </label>
            <div className="flex flex-col gap-2 sm:flex-row">
              <Input
                autoFocus
                className="h-9 bg-white"
                disabled={creatingFolder}
                id="new-kyron-folder-name"
                maxLength={255}
                onChange={(event) => {
                  setNewFolderName(event.target.value);
                  setError("");
                }}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    void createFolder();
                  }
                }}
                placeholder="Example: Module 3"
                value={newFolderName}
              />
              <div className="flex gap-2">
                <Button
                  disabled={creatingFolder}
                  onClick={() => void createFolder()}
                  size="sm"
                  type="button"
                >
                  {creatingFolder ? "Creating…" : "Create and select"}
                </Button>
                <Button
                  disabled={creatingFolder}
                  onClick={() => {
                    setCreating(false);
                    setError("");
                    setNewFolderName("");
                  }}
                  size="sm"
                  type="button"
                  variant="ghost"
                >
                  Cancel
                </Button>
              </div>
            </div>
          </div>
        ) : null}

        {error ? (
          <div className="border-b border-destructive/20 bg-destructive/5 px-5 py-3">
            <p className="text-xs text-destructive" role="alert">
              {error}
            </p>
            {error.includes("not found") || error.includes("no longer") ? (
              <Button
                className="mt-2"
                onClick={() => {
                  setLoading(true);
                  setError("");
                  setBrowsePath([]);
                }}
                size="sm"
                type="button"
                variant="outline"
              >
                Return to top-level Library
              </Button>
            ) : null}
          </div>
        ) : null}

        <div className="min-h-56 flex-1 overflow-y-auto p-4">
          {loading ? (
            <PickerMessage icon="loading" message="Loading folders…" />
          ) : folders.length > 0 ? (
            <div className="grid gap-3">
              <div className="flex items-center justify-between gap-3 px-1">
                <p className="text-xs font-semibold">
                  {browsePath.length === 0
                    ? "Top-level folders"
                    : `Subfolders in ${currentLocationName(browsePath)}`}
                </p>
                <p className="text-xs text-muted-foreground">
                  {pagination?.totalCount ?? folders.length} total
                </p>
              </div>
              <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border">
                {folders.map((folder) => (
                  <li key={folder.id}>
                    <button
                      className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-muted/35"
                      onClick={() => {
                        setLoading(true);
                        setBrowsePath((current) => [
                          ...current,
                          { id: folder.id, name: folder.name },
                        ]);
                        setCreating(false);
                        setError("");
                      }}
                      type="button"
                    >
                      <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-muted">
                        <Folder aria-hidden="true" className="size-4" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-semibold">
                          {folder.name}
                        </span>
                        <span className="mt-0.5 block text-xs text-muted-foreground">
                          Open folder
                        </span>
                      </span>
                      <ChevronRight
                        aria-hidden="true"
                        className="size-4 text-muted-foreground"
                      />
                    </button>
                  </li>
                ))}
              </ul>
              {pagination && pagination.page < pagination.totalPages ? (
                <Button
                  className="justify-self-center"
                  disabled={loadingMore}
                  onClick={() => void loadMore()}
                  size="sm"
                  type="button"
                  variant="outline"
                >
                  {loadingMore ? "Loading…" : "Load more folders"}
                </Button>
              ) : null}
            </div>
          ) : (
            <PickerMessage
              icon="empty"
              message="This folder is empty"
              supporting="You can select it now or create a subfolder."
            />
          )}
        </div>

        <footer className="flex flex-col-reverse gap-3 border-t border-border px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="min-w-0 truncate text-xs text-muted-foreground">
            Current location: {formatPath(browsePath)}
            {browsePath.length === 0 ? " (top level)" : ""}
          </p>
          <div className="flex shrink-0 justify-end gap-2">
            <Button
              disabled={saving || creatingFolder}
              onClick={onClose}
              type="button"
              variant="outline"
            >
              Cancel
            </Button>
            <Button
              disabled={loading || saving || creatingFolder}
              onClick={() =>
                void saveDestination(
                  {
                    folderId: browsePath.at(-1)?.id ?? null,
                    path: browsePath,
                  },
                  false,
                )
              }
              type="button"
            >
              {saving
                ? "Saving…"
                : browsePath.length === 0
                  ? "Choose top-level Library"
                  : "Choose this folder"}
            </Button>
          </div>
        </footer>
      </section>
    </div>
  );
}

function FolderBreadcrumb({
  path,
  onBrowse,
}: {
  path: KyronFolderPathItem[];
  onBrowse: (index: number) => void;
}) {
  const locations = [{ id: null, name: "Library" }, ...path];

  return (
    <nav
      aria-label="Current folder path"
      className="flex min-w-0 flex-wrap items-center gap-1 text-sm"
    >
      {locations.map((location, index) => (
        <span className="flex min-w-0 items-center gap-1" key={location.id ?? "root"}>
          {index > 0 ? (
            <ChevronRight
              aria-hidden="true"
              className="size-3.5 shrink-0 text-muted-foreground"
            />
          ) : null}
          <button
            className={
              index === locations.length - 1
                ? "max-w-44 truncate font-semibold"
                : "max-w-36 truncate text-muted-foreground hover:text-foreground"
            }
            onClick={() => onBrowse(index - 1)}
            type="button"
          >
            {location.name}
          </button>
        </span>
      ))}
    </nav>
  );
}

function PickerMessage({
  icon,
  message,
  supporting,
}: {
  icon: "empty" | "loading";
  message: string;
  supporting?: string;
}) {
  return (
    <div className="grid min-h-52 place-items-center rounded-xl border border-dashed border-border text-center">
      <div className="grid max-w-xs justify-items-center gap-2 px-6">
        {icon === "loading" ? (
          <LoaderCircle
            aria-hidden="true"
            className="size-5 animate-spin text-muted-foreground"
          />
        ) : (
          <FolderOpen
            aria-hidden="true"
            className="size-6 text-muted-foreground"
          />
        )}
        <p className="text-sm font-semibold">{message}</p>
        {supporting ? (
          <p className="text-xs text-muted-foreground">{supporting}</p>
        ) : null}
      </div>
    </div>
  );
}

function formatDestination(destination: KyronDestination): string {
  return formatPath(destination.path);
}

function formatPath(path: KyronFolderPathItem[]): string {
  return ["Library", ...path.map((location) => location.name)].join(" / ");
}

function currentLocationName(path: KyronFolderPathItem[]): string {
  return path.at(-1)?.name ?? "Library";
}

function folderErrorMessage(error: unknown): string {
  if (error instanceof DraftApiError && error.code === "KYRON_CONFLICT") {
    return "A folder with this name already exists in the current location.";
  }

  if (error instanceof DraftApiError && error.code === "KYRON_NOT_FOUND") {
    return "This Kyron folder was not found or is no longer available to the configured API key.";
  }

  return messageFromError(error, "The Kyron folders could not be loaded.");
}

function messageFromError(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}
