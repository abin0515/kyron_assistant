import { NextRequest, NextResponse } from "next/server";

import { requestErrorResponse } from "@/server/http/api-response";
import { getCurrentUser } from "@/server/identity/current-user";
import { isRecordId, qaErrorResponse, qaJson, type QaRouteContext } from "@/server/qa/http";
import { getContentVersionForUser } from "@/server/qa/service";
import type { QaContentVersionDetail } from "@/types/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// ?download=1 returns the content in the paste format, so a proposed version
// can be applied in Kyron Studio or pasted back for another check.
export async function GET(request: NextRequest, context: QaRouteContext<{ id: string }>) {
  const { id } = await context.params;

  if (!isRecordId(id)) {
    return requestErrorResponse("Content version ID is invalid.");
  }

  try {
    const version = await getContentVersionForUser(id, await getCurrentUser());

    if (request.nextUrl.searchParams.get("download") !== "1") {
      return qaJson(version satisfies QaContentVersionDetail);
    }

    return new NextResponse(JSON.stringify(version.content, null, 2), {
      headers: {
        "Cache-Control": "no-store",
        "Content-Type": "application/json; charset=utf-8",
        "Content-Disposition": `attachment; filename="${downloadName(version)}"`,
      },
    });
  } catch (error) {
    return qaErrorResponse(error, "Content version detail failed");
  }
}

function downloadName(version: QaContentVersionDetail): string {
  const slug = version.lessonTitle.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60);

  return `${slug || "lesson"}-${version.target === "course_setup" ? "setup" : "lesson"}-v${version.versionNumber}-${version.status}.json`;
}
