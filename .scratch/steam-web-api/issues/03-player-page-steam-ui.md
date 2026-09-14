# 03: Player page avatar, persona name, and achievement badges

**What to build:** The player detail page (`apps/web/src/app/players/[steamId]/page.tsx`) shows the player's Steam avatar and persona name next to their existing WDZA display name, and a separate "Steam Achievements" badge row (icon + name + description) below the existing per-Server stat grid — never mixed into it. Missing/private/not-yet-fetched Steam data renders nothing for that section rather than an error.

**Blocked by:** 01 (SteamProfile schema). Does not strictly need 02 to be live — build and test against directly-seeded `steamProfiles`/`steamAchievementSchema` fixture rows; real data from 02 makes it demoable end-to-end but isn't required to build this slice in parallel.

**Status:** done

- [x] `apps/web/src/lib/steam-profile-lookup.ts`: reads one `steamProfiles` row by `steamId`, joined with `steamAchievementSchema` (filtered to the appid) to resolve each unlocked achievement's name/description/icon; returns `null`/empty when no row exists or `status !== "ok"`
- [x] `apps/web/src/components/steam-avatar.tsx`: renders the avatar + persona name next to the existing `<h1>` name/`FactionSwatch` on the player page; renders nothing when no SteamProfile is cached yet
- [x] `apps/web/src/components/achievement-badges.tsx`: renders the unlocked-achievement badge row (icon, name, description on hover/tooltip via the native `title` attribute); renders nothing when there's no data, so the page looks identical to today for players without a cached profile
- [x] Player page test updates (`page.test.ts`) covering: profile present, profile absent, profile present but achievements `"private"`
- [x] No changes to `leaderboard`/`players` list pages — out of scope per the design session (Q4, round 3)

Verified in the browser against the real dev database (which already has ~300 real players tracked from the live RCON server, confirming steamId really is SteamID64 as assumed in ticket 02): seeded one synthetic player with a full SteamProfile + achievement schema, confirmed the avatar/name/badges render correctly and don't bleed into the stat grid, then confirmed an existing real player with no cached SteamProfile renders pixel-identical to before (no avatar, no achievements section, no layout shift). Synthetic data was removed afterward. Plain `<img>` was used for both the avatar and achievement icons rather than `next/image`, since Steam's CDN domains aren't in `next.config.mjs`'s (nonexistent) `images.remotePatterns` and these are small fixed-size images not worth a config change for.
