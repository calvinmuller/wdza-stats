import { createHash, randomBytes } from "node:crypto";
import {
  VERIFIED_PLAYER_CLAIMED_CHANNEL,
  verifiedPlayerSessions,
  verifiedPlayers,
  type Database,
} from "@wdza-stats/db";
import { and, eq, gt, sql } from "drizzle-orm";

// Verified Player sign-in sessions - see CONTEXT.md and docs/adr/0007.
// Unrelated to staff sign-in (lib/auth.ts) and to the anonymous visitor
// session behind KickVoteBallots (lib/visitor-session.ts).

export const VERIFIED_PLAYER_COOKIE = "wdza_player_session";
export const VERIFIED_PLAYER_SESSION_SECONDS = 60 * 60 * 24 * 30;

export interface VerifiedPlayerSignIn {
  /** The cookie value. Only its hash is stored. */
  token: string;
  expiresAt: Date;
  /** True when this sign-in was the claim: the steamId had no Verified Player yet. */
  firstClaim: boolean;
}

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/**
 * Signs in the person Steam just vouched for, claiming `steamId` if nobody has
 * yet. A first claim also asks the Worker to fetch its SteamProfile (see
 * VERIFIED_PLAYER_CLAIMED_CHANNEL). Call only with a steamId from
 * verifySteamAssertion.
 */
export async function signInVerifiedPlayer(
  db: Database,
  steamId: string,
  now = new Date(),
): Promise<VerifiedPlayerSignIn> {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(now.getTime() + VERIFIED_PLAYER_SESSION_SECONDS * 1000);

  const firstClaim = await db.transaction(async (tx) => {
    const claimed = await tx
      .insert(verifiedPlayers)
      .values({ steamId, claimedAt: now, lastSignedInAt: now })
      .onConflictDoNothing()
      .returning({ steamId: verifiedPlayers.steamId });
    if (claimed.length === 0) {
      await tx.update(verifiedPlayers).set({ lastSignedInAt: now }).where(eq(verifiedPlayers.steamId, steamId));
    }
    await tx.insert(verifiedPlayerSessions).values({ tokenHash: hashToken(token), steamId, expiresAt, createdAt: now });
    if (claimed.length > 0) {
      // Delivered on commit, so the Worker never sees a claim that rolled back.
      await tx.execute(sql`select pg_notify(${VERIFIED_PLAYER_CLAIMED_CHANNEL}, ${steamId})`);
    }
    return claimed.length > 0;
  });

  return { token, expiresAt, firstClaim };
}

/** The steamId signed in with this cookie token, or null if it's unknown or expired. */
export async function getVerifiedPlayerSteamId(
  db: Database,
  token: string,
  now = new Date(),
): Promise<string | null> {
  const [row] = await db
    .select({ steamId: verifiedPlayerSessions.steamId })
    .from(verifiedPlayerSessions)
    .where(and(eq(verifiedPlayerSessions.tokenHash, hashToken(token)), gt(verifiedPlayerSessions.expiresAt, now)))
    .limit(1);
  return row?.steamId ?? null;
}

/** Ends this one browser's session; the Verified Player and other sessions stay. */
export async function signOutVerifiedPlayer(db: Database, token: string): Promise<void> {
  await db.delete(verifiedPlayerSessions).where(eq(verifiedPlayerSessions.tokenHash, hashToken(token)));
}

export function verifiedPlayerCookieOptions(expiresAt: Date) {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    expires: expiresAt,
    path: "/",
  };
}

/**
 * The site's public origin, for Steam's realm and return URL. BETTER_AUTH_URL
 * already names it for staff sign-in; the request's own origin is only a
 * local-development fallback, since behind a proxy it may not be what the
 * browser sees.
 */
export function siteOrigin(request: Request): string {
  const configured = process.env.BETTER_AUTH_URL;
  return configured ? new URL(configured).origin : new URL(request.url).origin;
}
