import "server-only";

import { createHash } from "node:crypto";

import { get } from "@vercel/blob";

import { listWorkspaceSourceFiles } from "@/server/drafts/workspace-source-files/repository";
import { createKyronFile } from "@/server/kyron/client";
import {
  getSourceFileById,
  saveSourceFileChecksum,
} from "@/server/source-files/repository";
import type {
  SourceFile,
  SourceFileContentType,
} from "@/server/source-files/types";
import { MAX_UPLOAD_SIZE_BYTES } from "@/types/api";

const KYRON_ATTACHMENT_CONTENT_TYPES: SourceFileContentType[] = [
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
];
const KYRON_ATTACHMENT_TIMEOUT_MS = 270_000;
const MD5_BASE64_PATTERN = /^[A-Za-z0-9+/]{22}==$/;

export async function uploadWorkspaceAttachmentToKyron(
  workspaceId: string,
  userId: string,
): Promise<string | null> {
  const sourceFile = await getWorkspaceAttachment(workspaceId, userId);

  if (!sourceFile) {
    return null;
  }

  assertKyronAttachment(sourceFile);

  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(),
    KYRON_ATTACHMENT_TIMEOUT_MS,
  );

  try {
    const checksum = await getOrCreateChecksum(
      sourceFile,
      userId,
      controller.signal,
    );
    assertTransferActive(controller.signal);

    const upload = await createKyronFile({
      blob: {
        filename: sourceFile.originalName,
        byte_size: sourceFile.byteSize,
        checksum,
        content_type: sourceFile.contentType,
      },
    });
    assertTransferActive(controller.signal);

    await transferSourceFile(
      sourceFile,
      upload.direct_upload,
      controller.signal,
    );

    return upload.signed_id;
  } finally {
    clearTimeout(timeout);
  }
}

export class KyronAttachmentTransferError extends Error {
  readonly retryable: boolean;

  constructor(message: string, retryable = true) {
    super(message);
    this.name = "KyronAttachmentTransferError";
    this.retryable = retryable;
  }
}

async function getWorkspaceAttachment(
  workspaceId: string,
  userId: string,
): Promise<SourceFile | null> {
  const links = await listWorkspaceSourceFiles(workspaceId, userId);
  const attachment = links.find(
    (sourceFile) => sourceFile.purpose === "kyron_attachment",
  );

  if (!attachment) {
    return null;
  }

  const sourceFile = await getSourceFileById(attachment.id, userId);

  if (!sourceFile) {
    throw new KyronAttachmentTransferError(
      "The selected draft attachment could not be found.",
      false,
    );
  }

  return sourceFile;
}

function assertKyronAttachment(sourceFile: SourceFile): void {
  if (!KYRON_ATTACHMENT_CONTENT_TYPES.includes(sourceFile.contentType)) {
    throw new KyronAttachmentTransferError(
      "Only PDF and PPTX files can be attached to a Kyron draft.",
      false,
    );
  }

  if (sourceFile.byteSize <= 0) {
    throw new KyronAttachmentTransferError(
      "The selected draft attachment is empty.",
      false,
    );
  }

  if (sourceFile.byteSize > MAX_UPLOAD_SIZE_BYTES) {
    throw new KyronAttachmentTransferError(
      "The selected draft attachment exceeds Kyron's 250 MB limit.",
      false,
    );
  }
}

async function getOrCreateChecksum(
  sourceFile: SourceFile,
  userId: string,
  signal: AbortSignal,
): Promise<string> {
  if (
    sourceFile.checksumMd5Base64 &&
    MD5_BASE64_PATTERN.test(sourceFile.checksumMd5Base64)
  ) {
    return sourceFile.checksumMd5Base64;
  }

  const checksum = await calculateChecksum(sourceFile, signal);
  const savedFile = await saveSourceFileChecksum(
    sourceFile.id,
    userId,
    checksum,
  );

  if (!savedFile) {
    throw new KyronAttachmentTransferError(
      "The draft attachment checksum could not be saved.",
    );
  }

  return checksum;
}

async function calculateChecksum(
  sourceFile: SourceFile,
  signal: AbortSignal,
): Promise<string> {
  try {
    const result = await downloadSourceFile(sourceFile, signal);
    const reader = result.stream.getReader();
    const hash = createHash("md5");
    let receivedBytes = 0;

    while (true) {
      const { done, value } = await reader.read();

      if (done) {
        break;
      }

      hash.update(value);
      receivedBytes += value.byteLength;
    }

    assertByteSize(sourceFile, receivedBytes);

    return hash.digest("base64");
  } catch (error) {
    if (error instanceof KyronAttachmentTransferError) {
      throw error;
    }

    throw new KyronAttachmentTransferError(
      signal.aborted
        ? "Calculating the draft attachment checksum timed out."
        : "The draft attachment checksum could not be calculated.",
    );
  }
}

async function transferSourceFile(
  sourceFile: SourceFile,
  directUpload: {
    url: string;
    headers: Record<string, string>;
  },
  signal: AbortSignal,
): Promise<void> {
  try {
    const result = await downloadSourceFile(sourceFile, signal);
    const response = await fetch(directUpload.url, {
      method: "PUT",
      headers: {
        ...directUpload.headers,
        "Content-Length": String(sourceFile.byteSize),
      },
      body: result.stream,
      cache: "no-store",
      signal,
      duplex: "half",
    } as RequestInit & { duplex: "half" });

    if (!response.ok) {
      throw new KyronAttachmentTransferError(
        "Kyron could not receive the selected draft attachment.",
      );
    }
  } catch (error) {
    if (error instanceof KyronAttachmentTransferError) {
      throw error;
    }

    throw new KyronAttachmentTransferError(
      signal.aborted
        ? "The draft attachment transfer timed out."
        : "The draft attachment could not be transferred to Kyron.",
    );
  }
}

async function downloadSourceFile(
  sourceFile: SourceFile,
  signal?: AbortSignal,
) {
  const result = await get(sourceFile.blobUrl, {
    access: "private",
    useCache: false,
    abortSignal: signal,
  });

  if (!result || result.statusCode !== 200) {
    throw new KyronAttachmentTransferError(
      "The selected draft attachment could not be read from storage.",
    );
  }

  if (
    result.blob.size !== sourceFile.byteSize ||
    result.blob.contentType !== sourceFile.contentType
  ) {
    throw new KyronAttachmentTransferError(
      "The stored draft attachment metadata does not match the selected file.",
      false,
    );
  }

  return result;
}

function assertByteSize(sourceFile: SourceFile, receivedBytes: number): void {
  if (receivedBytes !== sourceFile.byteSize) {
    throw new KyronAttachmentTransferError(
      "The stored draft attachment size changed during processing.",
      false,
    );
  }
}

function assertTransferActive(signal: AbortSignal): void {
  if (signal.aborted) {
    throw new KyronAttachmentTransferError(
      "The draft attachment transfer timed out.",
    );
  }
}
