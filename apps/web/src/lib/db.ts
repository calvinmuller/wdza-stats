import { createDb, requireEnv } from "@wdza-stats/db";

export const db = createDb(requireEnv("DATABASE_URL"));
