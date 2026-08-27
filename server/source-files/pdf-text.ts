import "server-only";

import "pdfjs-dist/legacy/build/pdf.worker.mjs";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";

import { SourceTextValidationError } from "@/server/source-files/source-text-error";

export async function extractTextFromPdf(buffer: Buffer): Promise<string> {
  const loadingTask = getDocument({
    data: new Uint8Array(buffer),
    useSystemFonts: true,
  });

  try {
    const document = await loadingTask.promise;
    const pages: string[] = [];

    for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
      const page = await document.getPage(pageNumber);
      const content = await page.getTextContent();
      const text = readPdfTextItems(content.items);

      if (text) {
        pages.push(`PAGE ${pageNumber}\n${text}`);
      }
    }

    return pages.join("\n\n");
  } catch (error) {
    if (error instanceof SourceTextValidationError) {
      throw error;
    }

    throw new SourceTextValidationError(
      "The PDF file could not be opened. It may be damaged or password protected.",
    );
  } finally {
    await loadingTask.destroy();
  }
}

function readPdfTextItems(items: unknown[]): string {
  let text = "";

  for (const item of items) {
    if (!isPdfTextItem(item)) {
      continue;
    }

    text += item.str;
    text += item.hasEOL ? "\n" : " ";
  }

  return text.replace(/[ \t]+\n/g, "\n").trim();
}

function isPdfTextItem(
  value: unknown,
): value is { str: string; hasEOL?: boolean } {
  return Boolean(
    value &&
      typeof value === "object" &&
      "str" in value &&
      typeof value.str === "string",
  );
}
