// XpTransaction: an immutable ledger entry recording one award of XP to a
// player for one GameEvent. See CONTEXT.md.

// The full set of reasons an XpTransaction can be awarded for - see
// xp_rewards' seeded defaults in migrations for the amount configured per
// reason. "match_completed"/"match_win" are awarded per participant off a
// single MatchEnded GameEvent; "streakN" fire off whichever
// PlayerKillStreakStarted/Increased event's metadata.streak first reaches
// that milestone within a Match. "challenge_completed" is the odd one out:
// unlike every other reason, its amount isn't read from xp_rewards - it's
// the completed ChallengeDefinition's own configured xpReward (see
// CONTEXT.md's Challenge entry and challenge.ts) - so xpTransactions.amount
// for this reason varies per row rather than per a fixed table lookup.
export type XpReason =
  | "kill"
  | "match_completed"
  | "match_win"
  | "first_blood"
  | "streak3"
  | "streak5"
  | "streak10"
  | "challenge_completed";
