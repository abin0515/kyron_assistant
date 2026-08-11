import "server-only";

import { neon } from "@neondatabase/serverless";

import { getDatabaseUrl } from "@/server/env";

let database: ReturnType<typeof neon> | undefined;

export function getDatabase() {
  database ??= neon(getDatabaseUrl());

  return database;
}
