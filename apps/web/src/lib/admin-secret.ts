import { requireEnv } from "@wdza-stats/db";

// The unguessable URL path segment that gates apps/web/src/app/[adminSecret] -
// see ticket 15. Anyone who knows this value can view and edit XP rewards,
// the level curve, challenge/achievement definitions, and notification
// settings; there is no further login, matching the project's decision not
// to build real auth for this pass. Read once at module load, mirroring
// live-server-config.ts's CONFIGURED_SERVER_BASE_URL.
export const ADMIN_PATH_SECRET = requireEnv("ADMIN_PATH_SECRET");
