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
import { useEffect, useMemo, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type FolderId = number | "root";

type FolderNode = {
  id: FolderId;
  name: string;
  children: FolderNode[];
};

type FolderLocation = Pick<FolderNode, "id" | "name">;

const PAGE_SIZE = 6;

/**
 * Interactive design prototype only. Folder browsing and creation stay in
 * memory and never call Kyron or save a workspace.
 */
export function KyronFolderPickerConcept({
  disabled = false,
}: {
  disabled?: boolean;
}) {
  const [folderTree, setFolderTree] = useState<FolderNode>(createFolderTree);
  const [selectedPath, setSelectedPath] = useState<FolderLocation[]>([
    { id: "root", name: "Library" },
  ]);
  const [browsePath, setBrowsePath] = useState<FolderLocation[]>(selectedPath);
  const [open, setOpen] = useState(false);

  function openPicker() {
    setBrowsePath(selectedPath);
    setOpen(true);
  }

  return (
    <section className="border-border grid gap-3 border-t pt-5 sm:col-span-2">
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
        <div className="grid gap-1">
          <p className="text-sm font-semibold">Kyron destination</p>
          <p className="text-muted-foreground max-w-xl text-xs">
            Choose where this asset will be created in the shared Kyron Studio
            library.
          </p>
        </div>
        {!disabled ? (
          <Button
            className="w-fit"
            onClick={openPicker}
            type="button"
            variant="outline"
          >
            <FolderOpen aria-hidden="true" />
            Change folder
          </Button>
        ) : null}
      </div>

      <div className="border-border flex items-center gap-3 rounded-xl border bg-white px-4 py-3">
        <span className="bg-muted grid size-9 shrink-0 place-items-center rounded-lg">
          <Folder aria-hidden="true" className="size-4" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold">{formatPath(selectedPath)}</p>
          <p className="text-muted-foreground mt-0.5 text-xs">
            {selectedPath.length === 1
              ? "The asset will be created at the top level."
              : "The destination is saved with this workspace until submission."}
          </p>
        </div>
        <CircleCheck
          aria-label="Destination selected"
          className="size-4 shrink-0 text-emerald-700"
        />
      </div>

      {disabled ? (
        <p className="text-muted-foreground text-xs">
          The destination cannot be changed after Kyron generation starts.
        </p>
      ) : null}

      {open ? (
        <FolderPickerDialog
          browsePath={browsePath}
          folderTree={folderTree}
          onBrowsePathChange={setBrowsePath}
          onClose={() => setOpen(false)}
          onCreateFolder={(parentId, folder) => {
            setFolderTree((current) => addFolder(current, parentId, folder));
            const nextPath = [...browsePath, folder];
            setBrowsePath(nextPath);
            setSelectedPath(nextPath);
            setOpen(false);
          }}
          onSelect={() => {
            setSelectedPath(browsePath);
            setOpen(false);
          }}
        />
      ) : null}
    </section>
  );
}

function FolderPickerDialog({
  browsePath,
  folderTree,
  onBrowsePathChange,
  onClose,
  onCreateFolder,
  onSelect,
}: {
  browsePath: FolderLocation[];
  folderTree: FolderNode;
  onBrowsePathChange: (path: FolderLocation[]) => void;
  onClose: () => void;
  onCreateFolder: (parentId: FolderId, folder: FolderNode) => void;
  onSelect: () => void;
}) {
  const nextFolderId = useRef(10_000);
  const [creating, setCreating] = useState(false);
  const [creationError, setCreationError] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const currentFolder = useMemo(
    () => findFolder(folderTree, browsePath.at(-1)?.id ?? "root") ?? folderTree,
    [browsePath, folderTree],
  );
  const visibleFolders = currentFolder.children.slice(0, visibleCount);

  useEffect(() => {
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        onClose();
      }
    }

    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [onClose]);

  function browseTo(folder: FolderNode) {
    setCreationError("");
    setCreating(false);
    setIsLoading(true);

    window.setTimeout(() => {
      onBrowsePathChange([...browsePath, folderLocation(folder)]);
      setVisibleCount(PAGE_SIZE);
      setIsLoading(false);
    }, 250);
  }

  function browseToAncestor(index: number) {
    onBrowsePathChange(browsePath.slice(0, index + 1));
    setVisibleCount(PAGE_SIZE);
    setCreating(false);
    setCreationError("");
  }

  function createFolder() {
    const name = newFolderName.trim();

    if (!name) {
      setCreationError("Enter a folder name.");
      return;
    }

    const duplicate = currentFolder.children.some(
      (folder) => folder.name.toLocaleLowerCase() === name.toLocaleLowerCase(),
    );

    if (duplicate) {
      setCreationError(
        "A folder with this name already exists in the current location.",
      );
      return;
    }

    const folder: FolderNode = {
      id: nextFolderId.current,
      name,
      children: [],
    };

    nextFolderId.current += 1;
    onCreateFolder(currentFolder.id, folder);
  }

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-black/45 p-4"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
    >
      <section
        aria-labelledby="kyron-folder-picker-title"
        aria-modal="true"
        className="bg-card flex max-h-[88vh] w-full max-w-2xl flex-col overflow-hidden rounded-xl ring-1 ring-black/10"
        role="dialog"
      >
        <header className="border-border flex items-start justify-between gap-4 border-b px-5 py-4">
          <div>
            <h2 className="text-lg font-bold" id="kyron-folder-picker-title">
              Choose Kyron destination
            </h2>
            <p className="text-muted-foreground mt-1 text-xs">
              Browse nested folders or create a folder in the current location.
            </p>
          </div>
          <Button
            aria-label="Close Kyron folder picker"
            onClick={onClose}
            size="icon-sm"
            type="button"
            variant="ghost"
          >
            <X aria-hidden="true" />
          </Button>
        </header>

        <div className="border-border bg-amber-50 px-5 py-3 text-amber-950 border-b">
          <p className="flex items-start gap-2 text-xs leading-5">
            <Info aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
            Changes made here affect the shared Kyron Studio library used by
            the internal team.
          </p>
        </div>

        <div className="border-border flex flex-col gap-3 border-b px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
          <nav
            aria-label="Current folder path"
            className="flex min-w-0 flex-wrap items-center gap-1 text-sm"
          >
            {browsePath.map((location, index) => (
              <span className="flex min-w-0 items-center gap-1" key={location.id}>
                {index > 0 ? (
                  <ChevronRight
                    aria-hidden="true"
                    className="text-muted-foreground size-3.5 shrink-0"
                  />
                ) : null}
                <button
                  className={
                    index === browsePath.length - 1
                      ? "max-w-44 truncate font-semibold"
                      : "text-muted-foreground hover:text-foreground max-w-36 truncate"
                  }
                  onClick={() => browseToAncestor(index)}
                  type="button"
                >
                  {location.name}
                </button>
              </span>
            ))}
          </nav>

          <Button
            className="w-fit"
            onClick={() => {
              setCreating(true);
              setCreationError("");
            }}
            size="sm"
            type="button"
            variant="outline"
          >
            <FolderPlus aria-hidden="true" />
            {browsePath.length === 1 ? "New folder" : "New subfolder"}
          </Button>
        </div>

        {creating ? (
          <div className="border-border grid gap-2 border-b bg-muted/25 px-5 py-4">
            <label className="text-sm font-semibold" htmlFor="new-kyron-folder-name">
              {browsePath.length === 1 ? "New folder" : "New subfolder"} in{" "}
              {currentFolder.name}
            </label>
            <div className="flex flex-col gap-2 sm:flex-row">
              <Input
                autoFocus
                className="h-9 bg-white"
                id="new-kyron-folder-name"
                onChange={(event) => {
                  setNewFolderName(event.target.value);
                  setCreationError("");
                }}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    createFolder();
                  }
                }}
                placeholder="Example: Module 3"
                value={newFolderName}
              />
              <div className="flex gap-2">
                <Button onClick={createFolder} size="sm" type="button">
                  Create and select
                </Button>
                <Button
                  onClick={() => {
                    setCreating(false);
                    setCreationError("");
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
            {creationError ? (
              <p className="text-destructive text-xs" role="alert">
                {creationError}
              </p>
            ) : (
              <p className="text-muted-foreground text-xs">
                The new folder will be visible to everyone using this Kyron
                organization.
              </p>
            )}
          </div>
        ) : null}

        <div className="min-h-56 flex-1 overflow-y-auto p-4">
          {isLoading ? (
            <div className="grid min-h-52 place-items-center text-center">
              <div className="grid justify-items-center gap-2">
                <LoaderCircle
                  aria-hidden="true"
                  className="text-muted-foreground size-5 animate-spin"
                />
                <p className="text-muted-foreground text-xs">
                  Loading folders…
                </p>
              </div>
            </div>
          ) : visibleFolders.length > 0 ? (
            <div className="grid gap-3">
              <div className="flex items-center justify-between gap-3 px-1">
                <p className="text-xs font-semibold">
                  {browsePath.length === 1
                    ? "Top-level folders"
                    : `Subfolders in ${currentFolder.name}`}
                </p>
                <p className="text-muted-foreground text-xs">
                  {currentFolder.children.length} total
                </p>
              </div>
              <ul className="border-border divide-border divide-y overflow-hidden rounded-xl border">
                {visibleFolders.map((folder) => (
                  <li key={folder.id}>
                    <button
                      className="hover:bg-muted/35 flex w-full items-center gap-3 px-4 py-3 text-left"
                      onClick={() => browseTo(folder)}
                      type="button"
                    >
                      <span className="bg-muted grid size-9 shrink-0 place-items-center rounded-lg">
                        <Folder aria-hidden="true" className="size-4" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-semibold">
                          {folder.name}
                        </span>
                        <span className="text-muted-foreground mt-0.5 block text-xs">
                          {folder.children.length > 0
                            ? `${folder.children.length} subfolders`
                            : "No subfolders"}
                        </span>
                      </span>
                      <ChevronRight
                        aria-hidden="true"
                        className="text-muted-foreground size-4"
                      />
                    </button>
                  </li>
                ))}
              </ul>

              {visibleCount < currentFolder.children.length ? (
                <Button
                  className="justify-self-center"
                  onClick={() => setVisibleCount((current) => current + PAGE_SIZE)}
                  size="sm"
                  type="button"
                  variant="outline"
                >
                  Load more folders
                </Button>
              ) : null}
            </div>
          ) : (
            <div className="border-border grid min-h-52 place-items-center rounded-xl border border-dashed text-center">
              <div className="grid max-w-xs justify-items-center gap-2 px-6">
                <FolderOpen
                  aria-hidden="true"
                  className="text-muted-foreground size-6"
                />
                <p className="text-sm font-semibold">This folder is empty</p>
                <p className="text-muted-foreground text-xs">
                  You can select it now or create a subfolder.
                </p>
              </div>
            </div>
          )}
        </div>

        <footer className="border-border flex flex-col-reverse gap-3 border-t px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-muted-foreground min-w-0 truncate text-xs">
            Current location: {formatPath(browsePath)}
            {browsePath.length === 1 ? " (top level)" : ""}
          </p>
          <div className="flex shrink-0 justify-end gap-2">
            <Button onClick={onClose} type="button" variant="outline">
              Cancel
            </Button>
            <Button disabled={isLoading} onClick={onSelect} type="button">
              {browsePath.length === 1
                ? "Choose top-level Library"
                : "Choose this folder"}
            </Button>
          </div>
        </footer>
      </section>
    </div>
  );
}

function folderLocation(folder: FolderNode): FolderLocation {
  return { id: folder.id, name: folder.name };
}

function formatPath(path: FolderLocation[]): string {
  return path.map((location) => location.name).join(" / ");
}

function findFolder(root: FolderNode, id: FolderId): FolderNode | null {
  if (root.id === id) {
    return root;
  }

  for (const child of root.children) {
    const result = findFolder(child, id);

    if (result) {
      return result;
    }
  }

  return null;
}

function addFolder(
  root: FolderNode,
  parentId: FolderId,
  folder: FolderNode,
): FolderNode {
  if (root.id === parentId) {
    return { ...root, children: [...root.children, folder] };
  }

  return {
    ...root,
    children: root.children.map((child) =>
      addFolder(child, parentId, folder),
    ),
  };
}

function createFolderTree(): FolderNode {
  return {
    id: "root",
    name: "Library",
    children: [
      folder(568, "BIA 568", [
        folder(5681, "Fall 2026", [
          folder(56811, "Module 1"),
          folder(56812, "Module 2"),
        ]),
      ]),
      folder(662, "BIA 662"),
      folder(559, "CS 559", [
        folder(5591, "Module 1"),
        folder(5592, "Module 2"),
      ]),
      folder(561, "CS 561"),
      folder(563, "CS 563"),
      folder(612, "EM 612", [
        folder(6121, "Module 1", [
          folder(61211, "Lessons"),
          folder(61212, "Assessments"),
        ]),
        folder(6122, "Module 2", [folder(61221, "Activities")]),
        folder(6123, "Course-wide resources"),
      ]),
      folder(700, "Faculty Training", [
        folder(7001, "New Faculty Orientation"),
        folder(7002, "Teaching Online"),
      ]),
      folder(574, "MA 574"),
      folder(810, "PE 810"),
      folder(900, "Shuhan Test"),
      folder(901, "TF's Sandbox"),
    ],
  };
}

function folder(
  id: number,
  name: string,
  children: FolderNode[] = [],
): FolderNode {
  return { id, name, children };
}
