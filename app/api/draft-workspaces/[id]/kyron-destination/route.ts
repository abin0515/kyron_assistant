import { NextRequest, NextResponse } from "next/server";

import {
  DraftWorkspaceDestinationError,
  updateCurrentUserWorkspaceKyronDestination,
} from "@/server/drafts/workspaces/service";
import {
  conflictErrorResponse,
  internalErrorResponse,
  noStoreHeaders,
  notFoundErrorResponse,
  requestErrorResponse,
  validationErrorResponse,
} from "@/server/http/api-response";
import { parseKyronDestination } from "@/server/kyron/destination";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function PATCH(request: NextRequest, context: RouteContext) {
  if (!hasSameOrigin(request)) {
    return requestErrorResponse("Request origin is not allowed.", 403);
  }

  const { id } = await context.params;

  if (!isUuid(id)) {
    return requestErrorResponse("Draft workspace ID is invalid.");
  }

  const body = await readJson(request);
  const destinationValue =
    body && typeof body === "object" && !Array.isArray(body)
      ? (body as Record<string, unknown>).destination
      : undefined;
  const parsed = parseKyronDestination(destinationValue);

  if ("errors" in parsed) {
    return validationErrorResponse({ destination: parsed.errors });
  }

  try {
    const workspace = await updateCurrentUserWorkspaceKyronDestination(
      id,
      parsed.destination,
    );

    if (!workspace) {
      return notFoundErrorResponse("Draft workspace was not found.");
    }

    return NextResponse.json(workspace, { headers: noStoreHeaders });
  } catch (error) {
    if (error instanceof DraftWorkspaceDestinationError) {
      return conflictErrorResponse(error.message, false);
    }

    return internalErrorResponse(error, {
      context: "Workspace Kyron destination update failed",
      fallbackMessage: "The Kyron destination could not be saved.",
      retryable: true,
    });
  }
}

async function readJson(request: NextRequest): Promise<unknown> {
  if (!request.headers.get("content-type")?.startsWith("application/json")) {
    return null;
  }

  try {
    return await request.json();
  } catch {
    return null;
  }
}

function hasSameOrigin(request: NextRequest): boolean {
  const origin = request.headers.get("origin");

  try {
    return Boolean(origin && new URL(origin).origin === request.nextUrl.origin);
  } catch {
    return false;
  }
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value,
  );
}
