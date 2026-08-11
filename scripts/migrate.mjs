import { readdir, readFile } from "node:fs/promises";

import { neon } from "@neondatabase/serverless";

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error("DATABASE_URL is not configured.");
}

const migrationsDirectory = new URL(
  "../database/migrations/",
  import.meta.url,
);
const migrationFiles = (await readdir(migrationsDirectory))
  .filter((file) => file.endsWith(".sql"))
  .sort();
const sql = neon(databaseUrl);

for (const migrationFile of migrationFiles) {
  const migration = await readFile(
    new URL(migrationFile, migrationsDirectory),
    "utf8",
  );

  await sql.query(migration);
  console.log(`Applied ${migrationFile}.`);
}

console.log(`Database migration completed (${migrationFiles.length} files).`);
