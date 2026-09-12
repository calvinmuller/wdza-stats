import { migrate } from "drizzle-orm/postgres-js/migrator";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { createDb } from "./client";
import { requireEnv, runIfMain } from "./env";

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

runIfMain(import.meta.url, async () => {
  await runMigrations(requireEnv("DATABASE_URL"));
  console.log("Migrations applied.");
});
