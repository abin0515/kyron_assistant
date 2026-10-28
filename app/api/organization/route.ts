import { NextResponse } from "next/server";

import {
  kyronErrorResponse,
  noStoreHeaders,
} from "@/server/http/api-response";
import {
  getCurrentKyronOrganization,
} from "@/server/kyron/client";
import {
  type OrganizationResponse,
} from "@/types/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const organization = await getCurrentKyronOrganization();
    const response = {
      organization: {
        name: organization.name,
      },
    } satisfies OrganizationResponse;

    return NextResponse.json(response, {
      headers: noStoreHeaders,
    });
  } catch (error) {
    return kyronErrorResponse(error, {
      context: "Kyron organization request failed",
      fallbackMessage: "The organization could not be loaded.",
    });
  }
}
