import "server-only";

import { posix } from "node:path";

import { DOMParser } from "@xmldom/xmldom";
import { strFromU8, unzipSync } from "fflate";

import { SourceTextValidationError } from "@/server/source-files/source-text-error";

const DRAWINGML_NAMESPACE =
  "http://schemas.openxmlformats.org/drawingml/2006/main";
const PRESENTATIONML_NAMESPACE =
  "http://schemas.openxmlformats.org/presentationml/2006/main";
const RELATIONSHIPS_NAMESPACE =
  "http://schemas.openxmlformats.org/package/2006/relationships";
const MAX_RELEVANT_XML_BYTES = 20 * 1024 * 1024;
const IGNORED_NOTE_PLACEHOLDERS = new Set(["dt", "ftr", "hdr", "sldNum"]);
type XmlDocument = ReturnType<DOMParser["parseFromString"]>;
type XmlElementCollection = ReturnType<
  XmlDocument["getElementsByTagNameNS"]
>;

export async function extractTextFromPptx(buffer: Buffer): Promise<string> {
  const entries = readRelevantEntries(buffer);
  const slideNames = Object.keys(entries)
    .filter((name) => /^ppt\/slides\/slide\d+\.xml$/.test(name))
    .sort(compareNumberedEntries);
  const sections: string[] = [];

  for (const [index, slideName] of slideNames.entries()) {
    const slideText = readParagraphs(entries[slideName]);
    const notesName = findNotesName(slideName, entries);
    const notesText = notesName
      ? readSpeakerNotes(entries[notesName])
      : "";
    const section = [
      `SLIDE ${index + 1}`,
      slideText,
      notesText ? `SPEAKER NOTES\n${notesText}` : "",
    ]
      .filter(Boolean)
      .join("\n");

    if (slideText || notesText) {
      sections.push(section);
    }
  }

  return sections.join("\n\n");
}

function readRelevantEntries(buffer: Buffer): Record<string, Uint8Array> {
  let relevantBytes = 0;

  try {
    return unzipSync(new Uint8Array(buffer), {
      filter: (file) => {
        if (!isRelevantEntry(file.name)) {
          return false;
        }

        relevantBytes += file.originalSize;

        if (relevantBytes > MAX_RELEVANT_XML_BYTES) {
          throw new SourceTextValidationError(
            "The PowerPoint contains too much slide XML to analyze safely.",
          );
        }

        return true;
      },
    });
  } catch (error) {
    if (error instanceof SourceTextValidationError) {
      throw error;
    }

    throw new SourceTextValidationError(
      "The PowerPoint file could not be opened.",
    );
  }
}

function isRelevantEntry(name: string): boolean {
  return (
    /^ppt\/slides\/slide\d+\.xml$/.test(name) ||
    /^ppt\/slides\/_rels\/slide\d+\.xml\.rels$/.test(name) ||
    /^ppt\/notesSlides\/notesSlide\d+\.xml$/.test(name)
  );
}

function findNotesName(
  slideName: string,
  entries: Record<string, Uint8Array>,
): string | null {
  const relationName = slideName.replace(
    "ppt/slides/",
    "ppt/slides/_rels/",
  ) + ".rels";
  const relationXml = entries[relationName];

  if (!relationXml) {
    return null;
  }

  const document = parseXml(relationXml);
  const relationships = document.getElementsByTagNameNS(
    RELATIONSHIPS_NAMESPACE,
    "Relationship",
  );

  for (let index = 0; index < relationships.length; index += 1) {
    const relationship = relationships.item(index);
    const type = relationship?.getAttribute("Type") ?? "";
    const target = relationship?.getAttribute("Target") ?? "";

    if (type.endsWith("/notesSlide") && target) {
      const notesName = posix.normalize(
        posix.join(posix.dirname(slideName), target),
      );

      return entries[notesName] ? notesName : null;
    }
  }

  return null;
}

function readParagraphs(xml: Uint8Array): string {
  const document = parseXml(xml);
  const paragraphs = document.getElementsByTagNameNS(
    DRAWINGML_NAMESPACE,
    "p",
  );

  return collectParagraphText(paragraphs);
}

function readSpeakerNotes(xml: Uint8Array): string {
  const document = parseXml(xml);
  const shapes = document.getElementsByTagNameNS(
    PRESENTATIONML_NAMESPACE,
    "sp",
  );
  const paragraphs: string[] = [];

  for (let index = 0; index < shapes.length; index += 1) {
    const shape = shapes.item(index);
    const placeholder = shape?.getElementsByTagNameNS(
      PRESENTATIONML_NAMESPACE,
      "ph",
    ).item(0);
    const placeholderType = placeholder?.getAttribute("type") ?? "";

    if (!shape || IGNORED_NOTE_PLACEHOLDERS.has(placeholderType)) {
      continue;
    }

    const shapeParagraphs = shape.getElementsByTagNameNS(
      DRAWINGML_NAMESPACE,
      "p",
    );
    const shapeText = collectParagraphText(shapeParagraphs);

    if (shapeText) {
      paragraphs.push(shapeText);
    }
  }

  return paragraphs.join("\n");
}

function collectParagraphText(paragraphs: XmlElementCollection): string {
  const lines: string[] = [];

  for (let index = 0; index < paragraphs.length; index += 1) {
    const paragraph = paragraphs.item(index);
    const textNodes = paragraph?.getElementsByTagNameNS(
      DRAWINGML_NAMESPACE,
      "t",
    );
    const text: string[] = [];

    if (!textNodes) {
      continue;
    }

    for (let textIndex = 0; textIndex < textNodes.length; textIndex += 1) {
      const value = textNodes.item(textIndex)?.textContent?.trim();

      if (value) {
        text.push(value);
      }
    }

    if (text.length > 0) {
      lines.push(text.join(" "));
    }
  }

  return lines.join("\n");
}

function parseXml(xml: Uint8Array): XmlDocument {
  return new DOMParser({
    onError(level, message) {
      if (level !== "warning") {
        throw new Error(message);
      }
    },
  }).parseFromString(strFromU8(xml), "application/xml");
}

function compareNumberedEntries(left: string, right: string): number {
  return entryNumber(left) - entryNumber(right);
}

function entryNumber(value: string): number {
  return Number(value.match(/(\d+)\.xml$/)?.[1] ?? 0);
}
