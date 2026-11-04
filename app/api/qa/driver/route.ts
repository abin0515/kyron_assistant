import { createHash, timingSafeEqual } from "node:crypto";

import { NextRequest } from "next/server";

import {
  internalErrorResponse,
  unauthorizedErrorResponse,
} from "@/server/http/api-response";
import { syncGeneratingDraftsForAllOwners } from "@/server/drafts/kyron-drafts/service";
import { advanceProductionJobs } from "@/server/production/service";
import { qaJson } from "@/server/qa/http";
import { driveQaRuns } from "@/server/qa/pipeline";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

// The production scheduler tick, called by `npm run qa:worker` (later a
// scheduled job) with CRON_SECRET. It needs no user session, so the proxy
// lets it through. Each tick checks Kyron drafts still generating, advances
// QA runs, then brings every course's production job up to date.
export async function POST(request: NextRequest) {
  if (!hasDriverSecret(request.headers.get("authorization"))) {
    return unauthorizedErrorResponse("The QA worker secret is missing or wrong.");
  }

  try {
    const synced = await syncGeneratingDraftsForAllOwners();
    const processed = await driveQaRuns();
    const jobsChanged = await advanceProductionJobs();

    return qaJson({ processed: processed + synced + jobsChanged, runs: processed, drafts: synced, jobs: jobsChanged });
  } catch (error) {
    return internalErrorResponse(error, {
      context: "QA driver tick failed",
      fallbackMessage: "The QA worker tick failed.",
      retryable: true,
    });
  }
}

function hasDriverSecret(header: string | null): boolean {
  const secret = process.env.CRON_SECRET?.trim();

  if (!secret || secret.startsWith("replace_with") || !header?.startsWith("Bearer ")) {
    return false;
  }

  const digest = (value: string) => createHash("sha256").update(value).digest();

  return timingSafeEqual(digest(header.slice("Bearer ".length)), digest(secret));
}
