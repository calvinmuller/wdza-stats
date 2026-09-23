// KickVote: a Server-scoped campaign to force a disruptive player off that
// Server, started by any site visitor and decided by a crowd of KickVoteBallots
// - see CONTEXT.md. See docs/adr/0006-kick-votes-get-a-narrow-rcon-write-exception.md
// for why this is allowed to call RCON's write endpoints at all.

// "active" is the only status a Server may have more than zero of at once -
// see schema.ts's kick_votes_one_active_per_server_idx. The four terminal
// statuses are deliberately distinct rather than collapsed into a single
// "cancelled"/"ended" state, because each has its own resolution path in
// apps/worker's kick-vote engine and its own copy on the /kick/{id} page:
// "succeeded" - the Ballot count reached kickVoteSettings.threshold before
//   endsAt, and the RCON kick call was made.
// "expired" - endsAt passed with the Ballot count still short of threshold.
// "targetLeft" - the target steamId dropped out of the Server's Snapshot
//   before either of the above, so there is nothing left to kick.
// "staffCancelled" - a moderator or admin ended it early; see
//   staff.ts's "cancel_kick_vote" STAFF_ACTIONS entry.
export type KickVoteStatus = "active" | "succeeded" | "expired" | "targetLeft" | "staffCancelled";

// The Postgres NOTIFY channel a freshly-started KickVote goes out on (payload:
// the new row's id, as a string) - mirrors kill-notifications.ts's "kills"
// channel, but web -> worker instead of web -> web: apps/web has no RCON
// access (see apps/web/src/no-rcon-access.test.ts) and can only ever write
// the row, so it's the Worker's kick-vote-engine that LISTENs here and makes
// the actual RCON broadcast call.
export const KICK_VOTE_STARTED_CHANNEL = "kick_vote_started";

// The Postgres NOTIFY channel a KickVote's own Ballot count (or resolution)
// changes on (payload: the KickVote's id, as a string) - web -> web, same
// shape as kill-notifications.ts's "kills" channel, powering the /kick/{id}
// page's live SSE updates (ticket 02) with no polling.
export const KICK_VOTE_UPDATED_CHANNEL = "kick_vote_updated";
