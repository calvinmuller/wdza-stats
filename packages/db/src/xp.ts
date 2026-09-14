// XpTransaction: an immutable ledger entry recording one award of XP to a
// player for one GameEvent. See CONTEXT.md.

// The full set of reasons an XpTransaction can be awarded for - see
// xp_rewards' seeded defaults in migrations for the amount configured per
// reason. "match_completed"/"match_win" are awarded per participant off a
// single MatchEnded GameEvent; "streakN" fire off whichever
// PlayerKillStreakStarted/Increased event's metadata.streak first reaches
// that milestone within a Match.
export type XpReason =
  | "kill"
  | "match_completed"
  | "match_win"
  | "first_blood"
  | "streak3"
  | "streak5"
  | "streak10";
