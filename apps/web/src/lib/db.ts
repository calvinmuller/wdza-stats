import { createDb } from "@wdza-stats/db";

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export const db = createDb(requireEnv("DATABASE_URL"));
