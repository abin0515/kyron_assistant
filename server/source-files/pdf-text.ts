import "server-only";

import { SourceTextValidationError } from "@/server/source-files/source-text-error";

type PdfJsModule = typeof import("pdfjs-dist/legacy/build/pdf.mjs");

let pdfJsPromise: Promise<PdfJsModule> | null = null;

export async function extractTextFromPdf(buffer: Buffer): Promise<string> {
  const { getDocument } = await loadPdfJs();
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

async function loadPdfJs(): Promise<PdfJsModule> {
  pdfJsPromise ??= initializePdfJs();

  return pdfJsPromise;
}

async function initializePdfJs(): Promise<PdfJsModule> {
  const canvas = await import("@napi-rs/canvas");

  installCanvasGlobal("DOMMatrix", canvas.DOMMatrix);
  installCanvasGlobal("Path2D", canvas.Path2D);
  installCanvasGlobal("ImageData", canvas.ImageData);

  return import("pdfjs-dist/legacy/build/pdf.mjs");
}

function installCanvasGlobal(name: string, value: unknown): void {
  if (!(name in globalThis)) {
    Object.defineProperty(globalThis, name, {
      configurable: true,
      value,
      writable: true,
    });
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
