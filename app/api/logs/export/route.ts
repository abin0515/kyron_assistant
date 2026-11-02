import { NextRequest, NextResponse } from "next/server";

import { requestErrorResponse } from "@/server/http/api-response";
import { requireCurrentUserRole } from "@/server/identity/current-user";
import { logsErrorResponse } from "@/server/logging/http";
import { exportLogs, type LogExportKind } from "@/server/logging/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const KINDS: readonly LogExportKind[] = ["events", "usage", "versions"];

export async function GET(request: NextRequest) {
  const kind = KINDS.find((candidate) => candidate === request.nextUrl.searchParams.get("kind"));
  const format = request.nextUrl.searchParams.get("format");

  if (!kind || (format !== "csv" && format !== "json")) {
    return requestErrorResponse("Choose kind=events|usage|versions and format=csv|json.");
  }

  try {
    await requireCurrentUserRole("admin", "developer");

    const file = await exportLogs(kind, format);

    return new NextResponse(file.body, {
      headers: {
        "Cache-Control": "no-store",
        "Content-Type": file.contentType,
        "Content-Disposition": `attachment; filename="${file.fileName}"`,
      },
    });
  } catch (error) {
    return logsErrorResponse(error, "Log export failed");
  }
}
