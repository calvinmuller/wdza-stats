import { runMigrations } from "./migrate";

try {
  process.loadEnvFile(".env");
} catch {
  // .env is optional; CI sets TEST_DATABASE_URL directly.
}

const url = process.env.TEST_DATABASE_URL;
if (!url) {
  throw new Error("Missing TEST_DATABASE_URL (set it in .env)");
}

await runMigrations(url);
console.log("Test database migrated.");
