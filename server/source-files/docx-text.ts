import "server-only";

import mammoth from "mammoth";

const MAX_EXTRACTED_TEXT_CHARACTERS = 1_000_000;

export async function extractTextFromDocx(buffer: Buffer): Promise<string> {
  const result = await mammoth.extractRawText({ buffer });
  const text = normalizeText(result.value);

  if (!text) {
    throw new DocxTextValidationError(
      "The DOCX file does not contain readable text.",
    );
  }

  if (text.length > MAX_EXTRACTED_TEXT_CHARACTERS) {
    throw new DocxTextValidationError(
      "The extracted document text is too large to analyze.",
    );
  }

  return text;
}

export class DocxTextValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DocxTextValidationError";
  }
}

function normalizeText(value: string): string {
  return value
    .replace(/\r\n?/g, "\n")
    .replace(/[\t ]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
