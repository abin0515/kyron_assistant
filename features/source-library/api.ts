import { uploadPresigned } from "@vercel/blob/client";
import type { PutBlobResult } from "@vercel/blob";

import type { SourceFileUploadOptions } from "@/features/source-library/types";
import type {
  CompleteSourceFileUploadRequest,
  CompleteSourceFileUploadResponse,
  SourceFileListResponse,
  SourceFileUploadClientPayload,
  SourceFileUsageResponse,
} from "@/types/api";
import type { SourceFileType } from "@/types/api";
import { parseJsonResponse } from "@/features/drafts/shared/api-response";

const MULTIPART_UPLOAD_THRESHOLD = 10 * 1024 * 1024;

export async function listSourceFiles(
  {
    page = 1,
    perPage,
    query = "",
    types = [],
  }: {
    page?: number;
    perPage?: number;
    query?: string;
    types?: SourceFileType[];
  } = {},
  signal?: AbortSignal,
): Promise<SourceFileListResponse> {
  const searchParams = new URLSearchParams({ page: String(page) });

  if (perPage) {
    searchParams.set("per_page", String(perPage));
  }
  if (query.trim()) {
    searchParams.set("query", query.trim());
  }
  if (types.length > 0) {
    searchParams.set("types", types.join(","));
  }

  const response = await fetch(`/api/source-files?${searchParams}`, {
    headers: {
      Accept: "application/json",
    },
    cache: "no-store",
    credentials: "same-origin",
    signal,
  });

  return parseJsonResponse<SourceFileListResponse>(response);
}

export async function listSourceFileUsages(
  id: string,
  signal?: AbortSignal,
): Promise<SourceFileUsageResponse> {
  const response = await fetch(`/api/source-files/${id}/usages`, {
    headers: {
      Accept: "application/json",
    },
    cache: "no-store",
    credentials: "same-origin",
    signal,
  });

  return parseJsonResponse<SourceFileUsageResponse>(response);
}

export async function deleteSourceFile(
  id: string,
  signal?: AbortSignal,
): Promise<void> {
  const response = await fetch(`/api/source-files/${id}`, {
    method: "DELETE",
    headers: {
      Accept: "application/json",
    },
    cache: "no-store",
    credentials: "same-origin",
    signal,
  });

  if (!response.ok) {
    await parseJsonResponse<never>(response);
  }
}

export async function uploadSourceFile(
  file: File,
  options: SourceFileUploadOptions = {},
): Promise<CompleteSourceFileUploadResponse["file"]> {
  const uploadId = crypto.randomUUID();
  const fileName = file.name.trim();
  const pathname = `source-uploads/${uploadId}/${fileName}`;
  const clientPayload = {
    uploadId,
    name: fileName,
    size: file.size,
  } satisfies SourceFileUploadClientPayload;

  const blob = await uploadPresigned(pathname, file, {
    access: "private",
    handleUploadUrl: "/api/source-files/upload",
    clientPayload: JSON.stringify(clientPayload),
    contentType: getContentType(fileName),
    multipart: file.size >= MULTIPART_UPLOAD_THRESHOLD,
    abortSignal: options.signal,
    onUploadProgress: options.onProgress
      ? (progress) => options.onProgress?.(progress)
      : undefined,
  });

  return completeSourceFileUpload(uploadId, blob, options.signal);
}

async function completeSourceFileUpload(
  uploadId: string,
  blob: PutBlobResult,
  signal?: AbortSignal,
) {
  const requestBody = {
    uploadId,
    blobUrl: blob.url,
  } satisfies CompleteSourceFileUploadRequest;
  const response = await fetch("/api/source-files/complete", {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(requestBody),
    cache: "no-store",
    credentials: "same-origin",
    signal,
  });

  const result = await parseJsonResponse<CompleteSourceFileUploadResponse>(
    response,
  );

  return result.file;
}

function getContentType(fileName: string) {
  const extension = fileName.split(".").pop()?.toLowerCase();

  switch (extension) {
    case "pdf":
      return "application/pdf";
    case "pptx":
      return "application/vnd.openxmlformats-officedocument.presentationml.presentation";
    case "docx":
      return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
    default:
      throw new Error("Only PDF, PPTX, and DOCX files can be uploaded.");
  }
}
