import { NextRequest, NextResponse } from "next/server";

import { requestErrorResponse } from "@/server/http/api-response";
import { requireCurrentUserRole } from "@/server/identity/current-user";
import { listDefects } from "@/server/qa/defects";
import { qaErrorResponse } from "@/server/qa/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const COLUMNS = [
  "id", "createdAt", "stage", "category", "severity", "status", "origin", "title",
  "expected", "actual", "evidence", "rootCause", "workspaceId", "runId", "findingId", "createdBy",
] as const;

// The defect library as a file, for building the testing sets.
export async function GET(request: NextRequest) {
  const format = request.nextUrl.searchParams.get("format");

  if (format !== "csv" && format !== "json") {
    return requestErrorResponse("Choose format=csv|json.");
  }

  try {
    await requireCurrentUserRole("admin", "developer");

    const defects = await listDefects();
    const stamp = new Date().toISOString().slice(0, 10);
    const body =
      format === "json"
        ? JSON.stringify(defects, null, 2)
        : [COLUMNS.join(","), ...defects.map((defect) => COLUMNS.map((column) => csvCell(defect[column])).join(","))].join("\n");

    return new NextResponse(body, {
      headers: {
        "Cache-Control": "no-store",
        "Content-Type": format === "json" ? "application/json; charset=utf-8" : "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="cpe-qa-defects-${stamp}.${format}"`,
      },
    });
  } catch (error) {
    return qaErrorResponse(error, "Defect export failed");
  }
}

function csvCell(value: string | null): string {
  const text = value ?? "";

  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}
