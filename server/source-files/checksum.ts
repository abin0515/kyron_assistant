import "server-only";

import { createHash } from "node:crypto";

import { get } from "@vercel/blob";

import type {
  SourceFileContentType,
} from "@/server/source-files/types";

type StoredBlob = {
  blobUrl: string;
  byteSize: number;
  contentType: SourceFileContentType;
};

export async function calculateStoredBlobMd5(
  sourceFile: StoredBlob,
  signal?: AbortSignal,
): Promise<string> {
  const result = await get(sourceFile.blobUrl, {
    access: "private",
    useCache: false,
    abortSignal: signal,
  });

  if (!result || result.statusCode !== 200) {
    throw new Error("The source file could not be read from storage.");
  }

  if (
    result.blob.size !== sourceFile.byteSize ||
    result.blob.contentType !== sourceFile.contentType
  ) {
    throw new Error("The stored source file metadata does not match its record.");
  }

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

  if (receivedBytes !== sourceFile.byteSize) {
    throw new Error("The source file download was incomplete.");
  }

  return hash.digest("base64");
}
