import { getCurrentUser } from "@/server/identity/current-user";
import { qaErrorResponse, qaJson } from "@/server/qa/http";
import { listRubricPacks } from "@/server/qa/rubrics";
import type { QaRubricListResponse } from "@/types/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await getCurrentUser();

    return qaJson({ rubrics: await listRubricPacks() } satisfies QaRubricListResponse);
  } catch (error) {
    return qaErrorResponse(error, "QA rubric list failed");
  }
}
