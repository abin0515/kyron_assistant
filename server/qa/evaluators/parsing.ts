import "server-only";

import type { QaActivity } from "@/types/api";

import { PATCHABLE_ACTIVITY_FIELDS, readActivityField } from "../snapshot";
import { activityText, containsQuote } from "./lesson-text";

export const FIELD_PATH_SCHEMA = {
  type: "string",
  enum: [...PATCHABLE_ACTIVITY_FIELDS],
} as const;

export function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

export function readArray(value: unknown, key: string): unknown[] | null {
  const items = asRecord(value)?.[key];

  return Array.isArray(items) ? items : null;
}

export function readString(record: Record<string, unknown>, key: string): string | null {
  const value = record[key];

  return typeof value === "string" ? value : null;
}

export function readStrings(record: Record<string, unknown>, key: string): string[] {
  const value = record[key];

  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

export function readEnum<T extends string>(
  record: Record<string, unknown>,
  key: string,
  allowed: readonly T[],
): T | null {
  const value = record[key];

  return allowed.includes(value as T) ? (value as T) : null;
}

// Parses an array of model items, dropping any that fail validation.
export function parseItems<T>(
  value: unknown,
  key: string,
  parseItem: (record: Record<string, unknown>) => T | null,
): T[] | null {
  const items = readArray(value, key);

  if (!items) {
    return null;
  }

  return items.flatMap((item) => {
    const record = asRecord(item);
    const parsed = record ? parseItem(record) : null;

    return parsed ? [parsed] : [];
  });
}

// True when the quote appears in the named field, or anywhere in the activity
// for quotes taken from answer options.
export function activityContainsQuote(
  activity: QaActivity,
  fieldPath: string,
  quote: string,
): boolean {
  const fieldText = readActivityField(activity, fieldPath);

  return (
    (fieldText !== null && containsQuote(fieldText, quote)) ||
    containsQuote(activityText(activity), quote)
  );
}
