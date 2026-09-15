// One-off script: keeps only the single earliest-ever "first_blood" award
// per Server (the xp_transactions + player_achievements rows for whichever
// player earned it first, by timestamp) and revokes every later first_blood
// award - both the achievement unlock and the XP, rolling back the XP (and
// any level-up it caused) on player_career_stats for every player whose
// award is revoked. Going forward, first_blood is only awarded again for a
// kill event the worker hasn't already processed, i.e. a genuinely new
// match's first kill - already-ingested game_events are never reconsidered.
// Safe to re-run: once only the earliest award remains, this is a no-op.
//
// Usage: npm run revoke:first-blood --workspace=@wdza-stats/worker

import {
  createDb,
  levelForXp,
  levelThresholds,
  loadRootEnv,
  playerAchievements,
  playerCareerStats,
  requireEnv,
  runIfMain,
  xpTransactions,
} from "@wdza-stats/db";
import { and, eq } from "drizzle-orm";

runIfMain(import.meta.url, async () => {
  loadRootEnv();

  const db = createDb(requireEnv("DATABASE_URL"));

  const [thresholds, awards, unlocks] = await Promise.all([
    db.select().from(levelThresholds),
    db.select().from(xpTransactions).where(eq(xpTransactions.reason, "first_blood")),
    db
      .select()
      .from(playerAchievements)
      .where(eq(playerAchievements.achievementId, "first_blood")),
  ]);

  const serverIds = new Set<number>([
    ...awards.map((award) => award.serverId),
    ...unlocks.map((unlock) => unlock.serverId),
  ]);

  const awardsToRevoke: typeof awards = [];
  const keeperSteamIdByServer = new Map<number, string>();

  for (const serverId of serverIds) {
    const serverAwards = awards
      .filter((award) => award.serverId === serverId)
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime() || a.id - b.id);

    if (serverAwards.length > 0) {
      const [keeper, ...rest] = serverAwards;
      keeperSteamIdByServer.set(serverId, keeper.steamId);
      awardsToRevoke.push(...rest);
      continue;
    }

    // No xp_transactions for this Server at all (only possible if the old
    // achievement-only bug unlocked it independently of XP) - fall back to
    // the earliest achievement unlock so *something* is kept as "the first".
    const serverUnlocks = unlocks
      .filter((unlock) => unlock.serverId === serverId)
      .sort((a, b) => a.unlockedAt.getTime() - b.unlockedAt.getTime());
    if (serverUnlocks.length > 0) {
      keeperSteamIdByServer.set(serverId, serverUnlocks[0].steamId);
    }
  }

  console.log(
    `[revoke-first-blood] keeping 1 earliest award per server (${keeperSteamIdByServer.size} server(s)); revoking ${awardsToRevoke.length} xp_transactions.`,
  );

  let done = 0;
  for (const award of awardsToRevoke) {
    try {
      await db.transaction(async (tx) => {
        const [career] = await tx
          .select()
          .from(playerCareerStats)
          .where(
            and(
              eq(playerCareerStats.serverId, award.serverId),
              eq(playerCareerStats.steamId, award.steamId),
            ),
          );

        if (career) {
          const newXp = career.xp - award.amount;
          const newLevel = levelForXp(newXp, thresholds);
          await tx
            .update(playerCareerStats)
            .set({ xp: newXp, level: newLevel })
            .where(
              and(
                eq(playerCareerStats.serverId, award.serverId),
                eq(playerCareerStats.steamId, award.steamId),
              ),
            );
        }

        await tx.delete(xpTransactions).where(eq(xpTransactions.id, award.id));
      });
    } catch (error) {
      console.error(`[revoke-first-blood] failed to roll back xp_transaction ${award.id}:`, error);
    }

    done += 1;
    if (done % 25 === 0 || done === awardsToRevoke.length) {
      console.log(`[revoke-first-blood] xp rollback ${done}/${awardsToRevoke.length}`);
    }
  }

  let unlocksDeleted = 0;
  for (const unlock of unlocks) {
    const keeperSteamId = keeperSteamIdByServer.get(unlock.serverId);
    if (unlock.steamId === keeperSteamId) {
      continue;
    }
    await db
      .delete(playerAchievements)
      .where(
        and(
          eq(playerAchievements.serverId, unlock.serverId),
          eq(playerAchievements.steamId, unlock.steamId),
          eq(playerAchievements.achievementId, "first_blood"),
        ),
      );
    unlocksDeleted += 1;
  }
  console.log(`[revoke-first-blood] deleted ${unlocksDeleted} first_blood achievement unlock(s).`);

  console.log("[revoke-first-blood] done.");
  await db.$client.end();
});
