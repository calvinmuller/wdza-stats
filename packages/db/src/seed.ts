import { fileURLToPath } from "node:url";
import { createDb, type Database } from "./client";
import { servers } from "./schema";
import { requireEnv } from "./env";

export async function seedServer(
  db: Database,
  input: { name: string; baseUrl: string },
) {
  const [server] = await db
    .insert(servers)
    .values(input)
    .onConflictDoUpdate({
      target: servers.baseUrl,
      set: { name: input.name },
    })
    .returning();
  return server;
}

const isMain = process.argv[1] === fileURLToPath(import.meta.url);
if (isMain) {
  const db = createDb(requireEnv("DATABASE_URL"));
  const server = await seedServer(db, {
    name: requireEnv("SERVER_NAME"),
    baseUrl: requireEnv("RCON_BASE_URL"),
  });
  console.log("Seeded server:", server);
  await db.$client.end();
}
