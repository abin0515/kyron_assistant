import { createHash, timingSafeEqual } from "node:crypto";

import { NextRequest } from "next/server";

import {
  internalErrorResponse,
  unauthorizedErrorResponse,
} from "@/server/http/api-response";
import { syncGeneratingDraftsForAllOwners } from "@/server/drafts/kyron-drafts/service";
import { advanceProductionJobs } from "@/server/production/service";
import { qaJson } from "@/server/qa/http";
import { driveQaRunsUntil } from "@/server/qa/pipeline";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const DRIVE_WINDOW_MS = 45_000;

// The production scheduler tick, called with CRON_SECRET by Vercel Cron (GET,
// see vercel.json) and locally by `npm run qa:worker` (POST). It needs no user
// session, so the proxy lets it through. Each tick checks Kyron drafts still
// generating, advances QA runs, then brings every course's production job up
// to date.
export async function GET(request: NextRequest) {
  return tick(request);
}

export async function POST(request: NextRequest) {
  return tick(request);
}

async function tick(request: NextRequest) {
  if (!hasDriverSecret(request.headers.get("authorization"))) {
    return unauthorizedErrorResponse("The QA worker secret is missing or wrong.");
  }

  // New rounds of QA steps start for up to 45 s from the start of the tick,
  // so a run nobody has open moves on several steps a minute. Production
  // jobs are brought up to date first, so a long last round cannot cut them
  // off; a step stopped at the time limit counts as a stopped attempt.
  const deadline = Date.now() + DRIVE_WINDOW_MS;

  try {
    const synced = await syncGeneratingDraftsForAllOwners();
    const jobsChanged = await advanceProductionJobs();
    const processed = await driveQaRunsUntil(deadline);

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
