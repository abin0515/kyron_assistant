import "server-only";

import {
  ASSET_TYPES,
  COURSE_FIELD_LIMITS,
  DURATIONS,
  type CourseSetup,
  type QaLessonContent,
  type QaReference,
  type UpdateDraftWorkspaceRequest,
} from "@/types/api";

import type { LessonPacket } from "./types";

// Field paths the course-setup check reports and fixes. They map one-to-one
// onto draft workspace fields.
export const SETUP_FIELD_PATHS = [
  "setup.name",
  "setup.description",
  "setup.learningObjective",
  "setup.audience",
  "setup.duration",
  "setup.assetType",
] as const;

export type SetupFieldPath = (typeof SETUP_FIELD_PATHS)[number];

export function isSetupFieldPath(value: string): value is SetupFieldPath {
  return (SETUP_FIELD_PATHS as readonly string[]).includes(value);
}

export function buildSetupPacket(setup: CourseSetup, references: QaReference[]): LessonPacket {
  return {
    lesson: {
      title: setup.name,
      description: setup.description || null,
      audience: setup.audience || null,
      learningObjectives: setup.learningObjective ? [setup.learningObjective] : [],
      durationSeconds: setup.duration,
      assetType: setup.assetType,
    },
    activities: [],
    references,
  };
}

export function readSetupField(
  lesson: QaLessonContent,
  fieldPath: SetupFieldPath,
): string | null {
  switch (fieldPath) {
    case "setup.name":
      return lesson.title || null;
    case "setup.description":
      return lesson.description;
    case "setup.learningObjective":
      return lesson.learningObjectives[0] ?? null;
    case "setup.audience":
      return lesson.audience;
    case "setup.duration":
      return lesson.durationSeconds === null ? null : String(lesson.durationSeconds);
    case "setup.assetType":
      return lesson.assetType;
  }
}

export function readWorkspaceSetupField(setup: CourseSetup, fieldPath: SetupFieldPath): string {
  switch (fieldPath) {
    case "setup.name":
      return setup.name;
    case "setup.description":
      return setup.description;
    case "setup.learningObjective":
      return setup.learningObjective;
    case "setup.audience":
      return setup.audience;
    case "setup.duration":
      return String(setup.duration);
    case "setup.assetType":
      return setup.assetType;
  }
}

// Returns the workspace update for a proposed value, or null when the value
// is not allowed for that field.
export function setupFieldUpdate(
  fieldPath: SetupFieldPath,
  value: string,
): UpdateDraftWorkspaceRequest | null {
  const text = value.trim();

  switch (fieldPath) {
    case "setup.name":
      return withinLimit(text, COURSE_FIELD_LIMITS.name) ? { name: text } : null;
    case "setup.description":
      return withinLimit(text, COURSE_FIELD_LIMITS.description) ? { description: text } : null;
    case "setup.learningObjective":
      return withinLimit(text, COURSE_FIELD_LIMITS.learningObjective)
        ? { learningObjective: text }
        : null;
    case "setup.audience":
      return withinLimit(text, COURSE_FIELD_LIMITS.audience) ? { audience: text } : null;
    case "setup.duration": {
      const duration = DURATIONS.find((option) => String(option) === text);

      return duration ? { duration } : null;
    }
    case "setup.assetType": {
      const assetType = ASSET_TYPES.find((option) => option === text);

      return assetType ? { assetType } : null;
    }
  }
}

// Applies a validated value to normalized lesson content, for building a
// proposed version without writing to the workspace.
export function writeSetupField(
  lesson: QaLessonContent,
  fieldPath: SetupFieldPath,
  value: string,
): QaLessonContent {
  const update = setupFieldUpdate(fieldPath, value);

  if (!update) {
    throw new Error(`"${value}" is not a valid value for ${fieldPath}.`);
  }

  return {
    ...lesson,
    title: update.name ?? lesson.title,
    description: update.description ?? lesson.description,
    learningObjectives:
      update.learningObjective === undefined ? lesson.learningObjectives : [update.learningObjective],
    audience: update.audience ?? lesson.audience,
    durationSeconds: update.duration ?? lesson.durationSeconds,
    assetType: update.assetType ?? lesson.assetType,
  };
}

function withinLimit(text: string, maxLength: number): boolean {
  return text.length > 0 && text.length <= maxLength;
}
