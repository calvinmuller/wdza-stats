import { migrate } from "drizzle-orm/postgres-js/migrator";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { createDb } from "./client";
import { requireEnv } from "./env";

const migrationsFolder = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "migrations",
);

export async function runMigrations(connectionString: string) {
  const db = createDb(connectionString);
  await migrate(db, { migrationsFolder });
  await db.$client.end();
}

const isMain = process.argv[1] === fileURLToPath(import.meta.url);
if (isMain) {
  await runMigrations(requireEnv("DATABASE_URL"));
  console.log("Migrations applied.");
}
