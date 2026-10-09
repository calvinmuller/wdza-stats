import { reservedSlots, type Database } from "@wdza-stats/db";
import type { WarconClient } from "./warcon-client";

/**
 * Replaces reserved_slots with the Warcon org's current reserved-slot list
 * (see schema.ts's reservedSlots doc comment). Warcon owns the whole list, so
 * unlike the ban sync there are no rows of our own to keep. Throws if Warcon
 * can't be read, leaving the last synced list in place.
 */
export async function syncWarconReservedSlots(db: Database, client: WarconClient): Promise<void> {
  const entries = await client.fetchReservedSlots();
  // One row per steamId: should Warcon ever list one twice, its first entry wins.
  const bySteamId = new Map(entries.map((entry) => [entry.steamId, entry] as const).reverse());

  await db.transaction(async (tx) => {
    await tx.delete(reservedSlots);
    if (bySteamId.size > 0) {
      await tx.insert(reservedSlots).values(
        [...bySteamId.values()].map((entry) => ({
          steamId: entry.steamId,
          name: entry.name?.trim() || null,
          addedAt: new Date(entry.addedAt),
        })),
      );
    }
  });
}

/** Syncs now and then every `intervalMs`, logging and swallowing failures instead of crashing the Worker. */
export function startWarconReservedSlotSync(db: Database, client: WarconClient, intervalMs: number): NodeJS.Timeout {
  const syncOnce = () =>
    syncWarconReservedSlots(db, client).catch((error) => {
      console.error("[worker] Warcon reserved-slot sync failed:", error);
    });
  void syncOnce();
  return setInterval(() => void syncOnce(), intervalMs);
}
