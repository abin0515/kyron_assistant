import "server-only";

import {
  listDraftsByUser,
  markDraftAvailabilityUnknown,
  markDraftUnavailable,
  saveDraft,
  type StoredDraft,
} from "@/server/drafts/kyron-drafts/repository";
import { getCurrentUser } from "@/server/identity/current-user";
import {
  createKyronLessonCollection,
  getKyronLessonCollection,
  KyronClientError,
} from "@/server/kyron/client";
import { toDraft } from "@/server/kyron/normalize";
import type {
  CreateDraftRequest,
  Draft,
} from "@/types/api";

const DRAFT_SYNC_CONCURRENCY = 4;

export async function createDraftWithRequiredPersistence(
  input: CreateDraftRequest,
): Promise<Draft> {
  const draft = await requestDraftCreation(input);

  await saveDraft(draft, getCurrentUser(), input.assetType);

  return draft;
}

export async function syncDraft(id: number): Promise<Draft> {
  try {
    const collection = await getKyronLessonCollection(id);
    const draft = toDraft(collection);

    await persistDraft(draft);

    return draft;
  } catch (error) {
    if (error instanceof KyronClientError) {
      if (error.code === "KYRON_NOT_FOUND") {
        await persistAvailability(id, "unavailable");
      } else if (
        error.retryable ||
        error.code === "KYRON_INVALID_RESPONSE"
      ) {
        await persistAvailability(id, "unknown");
      }
    }

    throw error;
  }
}

export async function listCurrentUserDrafts(): Promise<
  StoredDraft[]
> {
  const user = getCurrentUser();

  return listDraftsByUser(user.id);
}

export async function syncCurrentUserDrafts(): Promise<
  StoredDraft[]
> {
  const drafts = await listCurrentUserDrafts();

  for (
    let index = 0;
    index < drafts.length;
    index += DRAFT_SYNC_CONCURRENCY
  ) {
    const batch = drafts.slice(index, index + DRAFT_SYNC_CONCURRENCY);
    const results = await Promise.allSettled(
      batch.map((draft) => syncDraft(draft.id)),
    );

    for (const result of results) {
      if (
        result.status === "rejected" &&
        result.reason instanceof KyronClientError &&
        result.reason.code === "KYRON_UNAUTHORIZED"
      ) {
        throw result.reason;
      }
    }
  }

  return listCurrentUserDrafts();
}

async function requestDraftCreation(
  input: CreateDraftRequest,
): Promise<Draft> {
  const collection = await createKyronLessonCollection({
    name: input.name,
    description: input.description,
    learning_objective: input.learningObjective,
    audience: input.audience,
    duration: input.duration,
    lesson_type: input.assetType,
    ...(input.alignmentContentSignedId
      ? {
          alignment_content_signed_id:
            input.alignmentContentSignedId,
        }
      : {}),
  });

  return toDraft(collection);
}

async function persistDraft(draft: Draft): Promise<void> {
  try {
    await saveDraft(draft, getCurrentUser());
  } catch (error) {
    console.error("Draft persistence failed.", {
      draftId: draft.id,
      operation: "synchronization",
      message:
        error instanceof Error ? error.message : "Unknown database error",
    });
  }
}

async function persistAvailability(
  draftId: number,
  availability: "unavailable" | "unknown",
): Promise<void> {
  try {
    const user = getCurrentUser();

    if (availability === "unavailable") {
      await markDraftUnavailable(draftId, user.id);
    } else {
      await markDraftAvailabilityUnknown(draftId, user.id);
    }
  } catch (error) {
    console.error("Draft availability persistence failed.", {
      draftId,
      availability,
      message:
        error instanceof Error ? error.message : "Unknown database error",
    });
  }
}
