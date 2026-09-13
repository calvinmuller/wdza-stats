import Link from "next/link";
import { db } from "@/lib/db";
import { CONFIGURED_SERVER_BASE_URL } from "@/lib/live-server-config";
import { getRecentMatches } from "@/lib/match-history";

// A DB read via drizzle isn't a Request-time API, so Next won't otherwise
// know this route needs fresh data on every request - force it dynamic so
// visitors always see recently-closed Matches.
export const dynamic = "force-dynamic";

function formatDuration(startedAt: string, endedAt: string): string {
  const ms = new Date(endedAt).getTime() - new Date(startedAt).getTime();
  const minutes = Math.round(ms / 60000);
  return `${minutes} min`;
}

export default async function MatchesPage() {
  const matches = await getRecentMatches(db, CONFIGURED_SERVER_BASE_URL);

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-3xl">Match history</h1>

      {matches.length === 0 ? (
        <p className="text-zinc-400">No matches have been recorded yet.</p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-white/10">
          <table className="w-full min-w-[560px] border-collapse text-sm">
            <thead>
              <tr className="border-b border-white/10 bg-zinc-900/60 text-left text-xs uppercase tracking-wide text-zinc-500">
                <th className="px-4 py-3 font-medium">Map</th>
                <th className="px-4 py-3 font-medium">Experience</th>
                <th className="px-4 py-3 font-medium">Players</th>
                <th className="px-4 py-3 font-medium">Duration</th>
                <th className="px-4 py-3 font-medium">Ended</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {matches.map((match) => (
                <tr key={match.id} className="hover:bg-white/5">
                  <td className="px-4 py-2.5 font-medium text-zinc-100">
                    {match.map}
                  </td>
                  <td className="px-4 py-2.5 text-zinc-300">
                    {match.experiences.join(", ")}
                  </td>
                  <td className="px-4 py-2.5 text-zinc-300">
                    {match.playerCount}
                  </td>
                  <td className="px-4 py-2.5 text-zinc-300">
                    {formatDuration(match.startedAt, match.endedAt)}
                  </td>
                  <td className="px-4 py-2.5 text-zinc-300">
                    {new Date(match.endedAt).toLocaleString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p className="text-xs text-zinc-500">
        Looking for one player&apos;s Matches? Find them on the{" "}
        <Link href="/players" className="text-brand-gold-500 hover:underline">
          Players
        </Link>{" "}
        page.
      </p>
    </div>
  );
}
