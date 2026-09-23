// The Postgres NOTIFY channel a steamId's first claim is announced on
// (payload: the steamId). web -> worker, like KICK_VOTE_STARTED_CHANNEL:
// apps/web never holds STEAM_API_KEY, so the Worker LISTENs here and fetches
// the new Verified Player's SteamProfile straight away rather than waiting for
// them to next appear in a Snapshot. A missed notification only delays that
// fetch until their next sighting, so nothing replays it.
export const VERIFIED_PLAYER_CLAIMED_CHANNEL = "verified_player_claimed";
