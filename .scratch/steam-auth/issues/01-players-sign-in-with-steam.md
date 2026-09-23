Status: ready-for-agent

# 01: Players sign in with Steam and become Verified Players

**What to build:** Steam OpenID 2.0 sign-in that turns a visitor into a Verified Player owning their steamId, with its own tables, session cookie and sign-out. See `spec.md` and ADR 0007 for why this is hand-rolled and separate from staff Better Auth.

**Blocked by:** none.

- [ ] Migration adds a Verified Player table (keyed by steamId, with first-claimed/last-signed-in timestamps) and a player session table (30-day expiry).
- [ ] Sign-in redirects to Steam's OpenID endpoint. The callback verifies the assertion with Steam (`check_authentication`) and checks `openid.return_to`/realm before trusting `claimed_id`. It parses the steamId only from a `https://steamcommunity.com/openid/id/<digits>` claimed id.
- [ ] First sign-in creates the Verified Player row and triggers an immediate SteamProfile fetch. Later sign-ins only update last-signed-in.
- [ ] A httpOnly, SameSite=Lax, Secure-in-production cookie, with a name distinct from the staff Better Auth and visitor-session cookies.
- [ ] Sign-out deletes the session row and cookie.
- [ ] Return-to: accepts only same-origin relative paths (starts with `/`, not `//`). Anything else falls back to `/`.
- [ ] Header shows "Sign in with Steam" when signed out, and a "this is you" link to `/players/{steamId}` plus sign-out when signed in.
- [ ] BannedPlayer steamIds can sign in normally.
- [ ] Test: a forged or unverified assertion (Steam's check says `is_valid:false`) creates no Verified Player or session.
- [ ] Test: an off-site return-to (`https://evil.example`, `//evil.example`) redirects to `/`.
- [ ] Test: an expired session reads as signed out.
