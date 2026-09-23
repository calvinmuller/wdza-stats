// The reasons a KickVote can be started for. Kept out of kick-vote.ts so the
// client-side dialog can import it without pulling in the database layer.
export const KICK_REASONS = ["Hacker", "Teamkilling"] as const;

export type KickReason = (typeof KICK_REASONS)[number];

export function isKickReason(value: string): value is KickReason {
  return (KICK_REASONS as readonly string[]).includes(value);
}
