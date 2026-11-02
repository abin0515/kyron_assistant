import { NextRequest, NextResponse } from "next/server";

import {
  kyronMcpErrorResponse,
  noStoreHeaders,
  requestErrorResponse,
} from "@/server/http/api-response";
import { hasSameOrigin } from "@/server/http/request-origin";
import { requireCurrentUserRole } from "@/server/identity/current-user";
import {
  disconnectKyron,
  getKyronMcpConnectionStatus,
} from "@/server/kyron-mcp/service";
import type { KyronMcpConnectionResponse } from "@/types/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await requireCurrentUserRole("admin");

    return connectionResponse();
  } catch (error) {
    return kyronMcpErrorResponse(error, {
      context: "Kyron connection status failed",
      fallbackMessage: "The Kyron connection status could not be loaded.",
    });
  }
}

export async function DELETE(request: NextRequest) {
  if (!hasSameOrigin(request)) {
    return requestErrorResponse("Request origin is not allowed.", 403);
  }

  try {
    await requireCurrentUserRole("admin");
    await disconnectKyron();

    return connectionResponse();
  } catch (error) {
    return kyronMcpErrorResponse(error, {
      context: "Kyron disconnect failed",
      fallbackMessage: "Kyron could not be disconnected.",
    });
  }
}

async function connectionResponse() {
  return NextResponse.json(
    {
      connection: await getKyronMcpConnectionStatus(),
    } satisfies KyronMcpConnectionResponse,
    { headers: noStoreHeaders },
  );
}
