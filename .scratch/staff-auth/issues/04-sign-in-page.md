# 04: `/admin` sign-in page and sign-out

**What to build:** A sign-in page for Staff Members at `/admin` (email and password) and a sign-out control. An unauthenticated visitor to any `/admin` route sees `notFound()`, not a login redirect that reveals the area exists, except for the sign-in form itself, which needs a decision on its own path (see the note below).

**Blocked by:** 02

**Status:** closed

- [x] A Staff Member can sign in and out
- [x] A failed sign-in shows a generic error that doesn't reveal whether the email exists
- [x] Sign-in attempts are rate limited
- [x] Signed-in Staff Members land in the admin area; the area is not linked from `NavLinks`
- [x] Tests cover: success, wrong password, unknown email (same message), and rate limiting

Note: the sign-in form has to be reachable by someone who isn't signed in, so `/admin` cannot 404 for anonymous visitors if the form lives there. Decide during implementation between an unlinked sign-in path and a form at `/admin`, and record which was chosen in the comments. The spec's aim is "not linked or advertised", not full secrecy, now that the secret no longer gates the area.

## Comments

Closed. Decision on the note above: the sign-in form is at `/admin/sign-in`, unlinked. Ticket 05 makes every other `/admin` route 404 for anonymous visitors; this one stays reachable so there's somewhere to sign in. Nothing links to it (`NavLinks` is untouched).

Sign-in goes through Better Auth's browser client (`lib/auth-client.ts`), not a server action, on purpose: Better Auth rate limits HTTP requests only and exempts server-side `auth.api` calls, so a server action would bypass the limit. `lib/auth.ts` now enables rate limiting (in-memory, so per web instance and reset on restart): 5 sign-in attempts per minute per address, 100 requests per minute overall. The form shows the same "Wrong email or password." for an unknown email and a wrong password (asserted at the HTTP level: identical status and body), and a separate message on 429.

`components/sign-out-button.tsx` signs out and returns to `/admin/sign-in`. It isn't placed anywhere yet; ticket 05 puts it in the admin area. Until 05 lands, a signed-in Staff Member is redirected from the sign-in page to `/admin`, which doesn't exist yet and 404s. Nothing is deployed in that state, so it's a mid-feature gap rather than a live one.

Behind Railway, the rate limiter reads the client address from `x-forwarded-for`. If the proxy chain isn't trusted correctly, all visitors could share one counter; worth a check on the first deploy.
