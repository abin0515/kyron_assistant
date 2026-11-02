import { createHash, timingSafeEqual } from "node:crypto";

import { NextRequest } from "next/server";

import {
  internalErrorResponse,
  unauthorizedErrorResponse,
} from "@/server/http/api-response";
import { qaJson } from "@/server/qa/http";
import { driveQaRuns } from "@/server/qa/pipeline";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

// Called by `npm run qa:worker` (later a scheduled job) with CRON_SECRET.
// It needs no user session, so the proxy lets it through.
export async function POST(request: NextRequest) {
  if (!hasDriverSecret(request.headers.get("authorization"))) {
    return unauthorizedErrorResponse("The QA worker secret is missing or wrong.");
  }

  try {
    return qaJson({ processed: await driveQaRuns() });
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
