import "server-only";

import { getServerEnv } from "@/server/env";
import { logEvent } from "@/server/logging/writer";

import {
  createKyronClient,
  KyronClientError,
  type KyronRequestReport,
} from "./client-core";

export async function getCurrentKyronOrganization() {
  return getKyronClient().getCurrentOrganization();
}

export async function createKyronFile(
  input: Parameters<
    ReturnType<typeof createKyronClient>["createFile"]
  >[0],
) {
  return getKyronClient().createFile(input);
}

export async function listKyronAssetFolders(
  query: Parameters<
    ReturnType<typeof createKyronClient>["listAssetFolders"]
  >[0] = {},
) {
  return getKyronClient().listAssetFolders(query);
}

export async function createKyronAssetFolder(
  input: Parameters<
    ReturnType<typeof createKyronClient>["createAssetFolder"]
  >[0],
) {
  return getKyronClient().createAssetFolder(input);
}

function getKyronClient() {
  const environment = getServerEnv();

  return createKyronClient({
    apiKey: environment.KYRON_API_KEY,
    baseUrl: environment.KYRON_API_BASE_URL,
    onRequestComplete: logKyronRequest,
  });
}

function logKyronRequest(report: KyronRequestReport): void {
  const pathPattern = report.path.replace(/\/\d+(?=\/|$)/g, "/{id}");

  void logEvent({
    category: "kyron_api",
    event: "kyron.request",
    level: report.errorCode ? "warn" : "info",
    message: `${report.method} ${pathPattern} → ${report.status ?? report.errorCode}`,
    durationMs: report.durationMs,
    kyronDraftId: kyronIdFromPath(report.path),
    data: { status: report.status, errorCode: report.errorCode },
  });
}

function kyronIdFromPath(path: string): number | null {
  const match = path.match(/^\/lesson_collections\/(\d+)/);

  return match ? Number(match[1]) : null;
}

export async function createKyronLessonCollection(
  input: Parameters<
    ReturnType<typeof createKyronClient>["createLessonCollection"]
  >[0],
) {
  return getKyronClient().createLessonCollection(input);
}

export async function getKyronLessonCollection(id: number) {
  return getKyronClient().getLessonCollection(id);
}

export { KyronClientError };
