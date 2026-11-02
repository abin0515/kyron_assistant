import { NextResponse } from "next/server";

import {
  kyronMcpErrorResponse,
  noStoreHeaders,
} from "@/server/http/api-response";
import { requireCurrentUserRole } from "@/server/identity/current-user";
import { getKyronCapabilityManifest } from "@/server/kyron-mcp/service";
import type { KyronMcpCapabilityManifest } from "@/types/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await requireCurrentUserRole("admin");

    return NextResponse.json(
      (await getKyronCapabilityManifest()) satisfies KyronMcpCapabilityManifest,
      { headers: noStoreHeaders },
    );
  } catch (error) {
    return kyronMcpErrorResponse(error, {
      context: "Kyron MCP tool listing failed",
      fallbackMessage: "The Kyron tools could not be loaded.",
    });
  }
}
