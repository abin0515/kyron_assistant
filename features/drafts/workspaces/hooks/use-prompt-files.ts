"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { DraftApiError } from "@/features/drafts/shared/api-response";
import {
  MAX_PROMPT_FILES,
  normalizeFileName,
  validatePromptFile,
  type PromptFile,
} from "@/features/drafts/workspaces/prompt-files";
import {
  cancelSourceFileUpload,
  listSourceFiles,
  uploadSourceFile,
} from "@/features/source-library/api";
import { MAX_AI_SOURCE_SIZE_BYTES, type SourceFileListItem } from "@/types/api";

// Files added to the new-draft prompt. Each one is uploaded to the Source
// Library as soon as it is added, so starting the draft only links them.
export function usePromptFiles() {
  const [files, setFiles] = useState<PromptFile[]>([]);
  const [notice, setNotice] = useState<string | null>(null);
  // The list as last committed; every change goes through commit, so this is
  // never behind a state update React has not applied yet.
  const filesRef = useRef<PromptFile[]>([]);
  const rawFilesRef = useRef(new Map<string, File>());
  const attemptsRef = useRef(new Map<string, { controller: AbortController; uploadId: string }>());

  const commit = useCallback((change: (current: PromptFile[]) => PromptFile[]) => {
    const next = change(filesRef.current);

    filesRef.current = next;
    setFiles(next);
  }, []);

  const update = useCallback(
    (key: string, change: Partial<PromptFile>) =>
      commit((current) => current.map((item) => (item.key === key ? { ...item, ...change } : item))),
    [commit],
  );

  // Stops this file's upload and frees its name on the server.
  const stopAttempt = useCallback((key: string) => {
    const attempt = attemptsRef.current.get(key);

    if (attempt) {
      attempt.controller.abort();
      attemptsRef.current.delete(key);
      void cancelSourceFileUpload(attempt.uploadId);
    }
  }, []);

  const upload = useCallback(
    async (key: string) => {
      const file = rawFilesRef.current.get(key);

      if (!file) {
        return;
      }

      stopAttempt(key);
      const attempt = { controller: new AbortController(), uploadId: crypto.randomUUID() };
      const { signal } = attempt.controller;
      attemptsRef.current.set(key, attempt);
      update(key, { status: "uploading", progress: 0, error: null, retryable: false });

      try {
        const existing = await findLibraryFile(file.name, signal);

        if (existing && existing.size !== file.size) {
          update(key, {
            status: "error",
            error: `A different file named "${existing.name}" is already in your Source Library. Rename this file to add it.`,
          });
          return;
        }

        const sourceFile =
          existing ??
          (await uploadSourceFile(file, {
            uploadId: attempt.uploadId,
            signal,
            onProgress: (progress) => update(key, { progress: Math.round(progress.percentage) }),
          }));

        if (!signal.aborted) {
          update(key, {
            status: "ready",
            progress: 100,
            sourceFile,
            reused: Boolean(existing),
            aiReadable: sourceFile.size <= MAX_AI_SOURCE_SIZE_BYTES,
          });
        }
      } catch (error) {
        if (!signal.aborted) {
          // Free the name now, so trying again is not refused as "already uploading".
          void cancelSourceFileUpload(attempt.uploadId);
          update(key, {
            status: "error",
            error: error instanceof Error ? error.message : "The file could not be uploaded.",
            retryable: error instanceof DraftApiError ? error.retryable : true,
          });
        }
      } finally {
        if (attemptsRef.current.get(key) === attempt) {
          attemptsRef.current.delete(key);
        }
      }
    },
    [stopAttempt, update],
  );

  const add = useCallback(
    (picked: File[]) => {
      const room = MAX_PROMPT_FILES - filesRef.current.length;
      const names = new Set(filesRef.current.map((item) => normalizeFileName(item.name)));
      const added = picked.slice(0, Math.max(0, room)).map((file): PromptFile => {
        const problem = validatePromptFile(file, names);
        const key = crypto.randomUUID();

        names.add(normalizeFileName(file.name));
        rawFilesRef.current.set(key, file);

        return {
          key,
          name: file.name,
          size: file.size,
          status: problem ? "error" : "uploading",
          progress: 0,
          sourceFile: null,
          reused: false,
          aiReadable: file.size <= MAX_AI_SOURCE_SIZE_BYTES,
          error: problem,
          retryable: false,
        };
      });
      const left = picked.length - added.length;

      setNotice(
        left > 0
          ? `Up to ${MAX_PROMPT_FILES} files can be added; ${left} ${left === 1 ? "was" : "were"} left out.`
          : null,
      );

      if (added.length === 0) {
        return;
      }

      commit((current) => [...current, ...added]);

      for (const item of added) {
        if (item.status === "uploading") {
          void upload(item.key);
        }
      }
    },
    [commit, upload],
  );

  const remove = useCallback(
    (key: string) => {
      stopAttempt(key);
      rawFilesRef.current.delete(key);
      setNotice(null);
      commit((current) => current.filter((item) => item.key !== key));
    },
    [commit, stopAttempt],
  );

  useEffect(() => {
    const attempts = attemptsRef.current;

    return () => {
      for (const attempt of attempts.values()) {
        attempt.controller.abort();
        void cancelSourceFileUpload(attempt.uploadId);
      }
    };
  }, []);

  return {
    add,
    files,
    full: files.length >= MAX_PROMPT_FILES,
    notice,
    readyFiles: files.filter((item) => item.status === "ready" && item.sourceFile),
    remove,
    retry: upload,
    uploading: files.some((item) => item.status === "uploading"),
  };
}

// The Source Library refuses a second file with the same name, so a file
// already there is used instead of uploading it again.
async function findLibraryFile(name: string, signal: AbortSignal): Promise<SourceFileListItem | null> {
  const wanted = normalizeFileName(name);
  // The search takes at most 120 characters; a prefix still finds the name.
  const { files } = await listSourceFiles({ query: name.trim().slice(0, 120), perPage: 50 }, signal);

  return files.find((file) => normalizeFileName(file.name) === wanted) ?? null;
}
