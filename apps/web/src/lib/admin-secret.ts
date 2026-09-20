import { requireEnv } from "@wdza-stats/db";

// The unguessable URL path segment that gates the staff bootstrap page,
// apps/web/src/app/[adminSecret]/bootstrap (ADR 0005). It no longer opens the
// admin area, which needs a Staff Member's sign-in and Role. Anyone who knows
// this value can create the first admin while none exists, and reset an admin's
// password at any time, so treat it as a recovery credential. Read once at
// module load, mirroring live-server-config.ts's CONFIGURED_SERVER_BASE_URL.
export const ADMIN_PATH_SECRET = requireEnv("ADMIN_PATH_SECRET");
