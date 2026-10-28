import "server-only";

import { extractTextFromDocx } from "@/server/source-files/docx-text";
import { extractTextFromPdf } from "@/server/source-files/pdf-text";
import { extractTextFromPptx } from "@/server/source-files/pptx-text";
import { SourceTextValidationError } from "@/server/source-files/source-text-error";
import type { SourceFileContentType } from "@/server/source-files/types";

export { SourceTextValidationError } from "@/server/source-files/source-text-error";

const MAX_EXTRACTED_TEXT_CHARACTERS = 1_000_000;

export async function extractTextFromSourceFile(
  contentType: SourceFileContentType,
  buffer: Buffer,
): Promise<string> {
  const text = await extractByContentType(contentType, buffer);
  const normalizedText = normalizeText(text);

  if (!normalizedText) {
    throw new SourceTextValidationError(emptyTextMessage(contentType));
  }

  if (normalizedText.length > MAX_EXTRACTED_TEXT_CHARACTERS) {
    throw new SourceTextValidationError(
      "The extracted document text is too large to analyze.",
    );
  }

  return normalizedText;
}

async function extractByContentType(
  contentType: SourceFileContentType,
  buffer: Buffer,
): Promise<string> {
  switch (contentType) {
    case "application/pdf":
      return extractTextFromPdf(buffer);
    case "application/vnd.openxmlformats-officedocument.presentationml.presentation":
      return extractTextFromPptx(buffer);
    case "application/vnd.openxmlformats-officedocument.wordprocessingml.document":
      return extractTextFromDocx(buffer);
  }
}

function normalizeText(value: string): string {
  return value
    .replace(/\r\n?/g, "\n")
    .replace(/[\t ]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function emptyTextMessage(contentType: SourceFileContentType): string {
  if (contentType === "application/pdf") {
    return "The PDF does not contain readable text. Scanned PDFs require OCR, which is not supported yet.";
  }

  if (
    contentType ===
    "application/vnd.openxmlformats-officedocument.presentationml.presentation"
  ) {
    return "The PowerPoint does not contain readable slide text or speaker notes.";
  }

  return "The DOCX file does not contain readable text.";
}
