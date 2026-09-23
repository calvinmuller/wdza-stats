Status: done

# 01: Players sign in with Steam and become Verified Players

**What to build:** Steam OpenID 2.0 sign-in that turns a visitor into a Verified Player owning their steamId, with its own tables, session cookie and sign-out. See `spec.md` and ADR 0007 for why this is hand-rolled and separate from staff Better Auth.

**Blocked by:** none.

- [x] Migration adds a Verified Player table (keyed by steamId, with first-claimed/last-signed-in timestamps) and a player session table (30-day expiry).
- [x] Sign-in redirects to Steam's OpenID endpoint. The callback verifies the assertion with Steam (`check_authentication`) and checks `openid.return_to`/realm before trusting `claimed_id`. It parses the steamId only from a `https://steamcommunity.com/openid/id/<digits>` claimed id.
- [x] First sign-in creates the Verified Player row and triggers an immediate SteamProfile fetch. Later sign-ins only update last-signed-in.
- [x] A httpOnly, SameSite=Lax, Secure-in-production cookie, with a name distinct from the staff Better Auth and visitor-session cookies.
- [x] Sign-out deletes the session row and cookie.
- [x] Return-to: accepts only same-origin relative paths (starts with `/`, not `//`). Anything else falls back to `/`.
- [x] Header shows "Sign in with Steam" when signed out, and a "this is you" link to `/players/{steamId}` plus sign-out when signed in.
- [x] BannedPlayer steamIds can sign in normally.
- [x] Test: a forged or unverified assertion (Steam's check says `is_valid:false`) creates no Verified Player or session.
- [x] Test: an off-site return-to (`https://evil.example`, `//evil.example`) redirects to `/`.
- [x] Test: an expired session reads as signed out.

## Comments

Implemented in packages/db (verifiedPlayers, verifiedPlayerSessions, migration 0027, VERIFIED_PLAYER_CLAIMED_CHANNEL), apps/web/src/lib/steam-openid.ts (Steam OpenID check, safeReturnPath), lib/verified-player.ts (sign-in/out, sessions, siteOrigin), lib/current-verified-player.ts (for ticket 03's server actions), routes under app/api/steam/{sign-in,callback,sign-out,me}, and components/player-sign-in.tsx in the header. The SteamProfile fetch on first claim goes through the Worker: web sends a NOTIFY inside the claim transaction, and the Worker's startClaimedSteamProfileFetcher runs the existing refreshUnseenSteamProfiles, so STEAM_API_KEY still never reaches apps/web. The header reads sign-in state client-side from /api/steam/me so the root layout never reads cookies (which would make every page dynamic). Only a SHA-256 hash of the session token is stored. Replay of a captured callback URL relies on Steam refusing an already-verified nonce. Origin comes from BETTER_AUTH_URL, falling back to the request origin in local development. Sign-in failure returns to the page with ?steamSignIn=failed, and the header shows it.
