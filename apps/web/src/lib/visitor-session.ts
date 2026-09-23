import { randomUUID } from "node:crypto";
import { cookies } from "next/headers";

// The anonymous per-browser-session id behind a KickVote initiation or
// KickVoteBallot - see CONTEXT.md's KickVoteBallot entry and
// docs/adr/0006-kick-votes-get-a-narrow-rcon-write-exception.md's trust-model
// discussion. Unrelated to a Staff Member's sign-in session (lib/auth.ts):
// this identifies a browser, not a person, and is never authenticated.
const COOKIE_NAME = "wdza_visitor_session";
const COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 365;

/**
 * Only callable from a Server Action or Route Handler (Next's cookie-write
 * restriction) - reads this browser's session id, minting and setting one on
 * its first visit.
 */
export async function getVisitorSessionId(): Promise<string> {
  const store = await cookies();
  const existing = store.get(COOKIE_NAME)?.value;
  if (existing) return existing;

  const sessionId = randomUUID();
  store.set(COOKIE_NAME, sessionId, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: COOKIE_MAX_AGE_SECONDS,
    path: "/",
  });
  return sessionId;
}

/**
 * Callable during a page render too, unlike getVisitorSessionId - reads this
 * browser's session id without minting one, for "has this browser already
 * done X" display checks (e.g. the /kick/{id} page deciding whether to show
 * its voting form). A visitor with no session yet reads as null; they get one
 * the moment they actually act (e.g. casting a Ballot), not just from looking.
 */
export async function getVisitorSessionIdIfPresent(): Promise<string | null> {
  const store = await cookies();
  return store.get(COOKIE_NAME)?.value ?? null;
}
