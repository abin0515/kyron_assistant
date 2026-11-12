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

// Frees the name of an upload the page gave up on. Sent with keepalive so it
// also goes out when the page is closing; a failure only means the name stays
// taken until the upload token expires (10 minutes).
export async function cancelSourceFileUpload(uploadId: string): Promise<void> {
  try {
    await fetch(`/api/source-files/upload/${encodeURIComponent(uploadId)}`, {
      method: "DELETE",
      cache: "no-store",
      credentials: "same-origin",
      keepalive: true,
    });
  } catch {
    // Best effort.
  }
}

export async function uploadSourceFile(
  file: File,
  options: SourceFileUploadOptions = {},
): Promise<CompleteSourceFileUploadResponse["file"]> {
  await ensureUploadsSetUp();

  const uploadId = options.uploadId ?? crypto.randomUUID();
  const fileName = file.name.trim();
  const pathname = `source-uploads/${uploadId}/${fileName}`;
  const clientPayload = {
    uploadId,
    name: fileName,
    size: file.size,
  } satisfies SourceFileUploadClientPayload;

  let blob: PutBlobResult;

  try {
    blob = await uploadPresigned(pathname, file, {
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
  } catch (error) {
    throw await readableUploadError(error);
  }

  return completeSourceFileUpload(uploadId, blob, options.signal);
}

// Checked once per page before the first upload: the Blob library turns any
// refusal from the token route into "Failed to retrieve the presigned URL",
// so the route's setup message is read here instead. A failure is not kept,
// so the next upload asks again once the setup is fixed.
let uploadSetupCheck: Promise<void> | null = null;

function ensureUploadsSetUp(): Promise<void> {
  uploadSetupCheck ??= fetch("/api/source-files/upload", {
    headers: { Accept: "application/json" },
    cache: "no-store",
    credentials: "same-origin",
  })
    .then(async (response) => {
      if (!response.ok) {
        await parseJsonResponse<never>(response);
      }
    })
    .catch((error: unknown) => {
      uploadSetupCheck = null;
      throw error;
    });

  return uploadSetupCheck;
}

// The token route refused the upload, but the library hides why. Checking the
// setup again (not from the page's saved answer) surfaces an ended session or
// a missing setup in their own words; otherwise the likely causes are named.
async function readableUploadError(error: unknown): Promise<unknown> {
  if (!(error instanceof Error) || !/failed to retrieve the presigned url/i.test(error.message)) {
    return error;
  }

  uploadSetupCheck = null;

  try {
    await ensureUploadsSetUp();
  } catch (setupError) {
    return setupError;
  }

  return new Error(
    "The upload could not start. A file with this name may already be in the Source Library or still uploading (wait a few minutes or rename it); otherwise try again.",
  );
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
