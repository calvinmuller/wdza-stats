import { PublicListPlayerCell } from "@/components/public-list-player";
import { db } from "@/lib/db";
import { formatDate } from "@/lib/format-date";
import { listPublicReservedSlots } from "@/lib/public-lists";

// A DB read via drizzle isn't a Request-time API, so Next won't otherwise
// know this route needs fresh data on every request - force it dynamic so a
// slot shows up as soon as it's synced from Warcon.
export const dynamic = "force-dynamic";

// Every ReservedSlot, which the Worker copies from WDZA's Warcon reserved-slot
// list (docs/adr/0013). Called the whitelist here because that's what players
// call it.
export default async function WhitelistPage() {
  const slots = await listPublicReservedSlots(db);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <h1 className="text-3xl">Whitelist</h1>
        <p className="max-w-2xl text-sm text-zinc-400">
          Players with a reserved slot, who can still join a WDZA server when it&apos;s full.
        </p>
      </div>

      {slots.length === 0 ? (
        <p className="text-sm text-zinc-500">Nobody has a reserved slot.</p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-white/10">
          <table className="w-full min-w-[420px] border-collapse text-sm">
            <thead>
              <tr className="border-b border-white/10 bg-zinc-900/60 text-xs uppercase tracking-wide text-zinc-500">
                <th className="px-4 py-3 text-left font-medium">Player</th>
                <th className="px-4 py-3 text-left font-medium">Since</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {slots.map((slot) => (
                <tr key={slot.steamId} className="hover:bg-white/5">
                  <td className="px-4 py-2.5">
                    <PublicListPlayerCell player={slot} />
                  </td>
                  <td className="px-4 py-2.5 whitespace-nowrap text-zinc-500">
                    {formatDate(slot.addedAt.toISOString())}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
