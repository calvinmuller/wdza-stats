# 04: `/admin` sign-in page and sign-out

**What to build:** A sign-in page for Staff Members at `/admin` (email and password) and a sign-out control. An unauthenticated visitor to any `/admin` route sees `notFound()`, not a login redirect that reveals the area exists, except for the sign-in form itself, which needs a decision on its own path (see the note below).

**Blocked by:** 02

**Status:** ready-for-agent

- [ ] A Staff Member can sign in and out
- [ ] A failed sign-in shows a generic error that doesn't reveal whether the email exists
- [ ] Sign-in attempts are rate limited
- [ ] Signed-in Staff Members land in the admin area; the area is not linked from `NavLinks`
- [ ] Tests cover: success, wrong password, unknown email (same message), and rate limiting

Note: the sign-in form has to be reachable by someone who isn't signed in, so `/admin` cannot 404 for anonymous visitors if the form lives there. Decide during implementation between an unlinked sign-in path and a form at `/admin`, and record which was chosen in the comments. The spec's aim is "not linked or advertised", not full secrecy, now that the secret no longer gates the area.
