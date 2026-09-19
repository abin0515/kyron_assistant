import "server-only";

import { getServerEnv } from "@/server/env";

import { createKyronClient, KyronClientError } from "./client-core";

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
  });
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
