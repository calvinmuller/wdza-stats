import Link from "next/link";
import { RecentMatchesTable } from "@/components/recent-matches-table";
import { db } from "@/lib/db";
import { CONFIGURED_SERVER_BASE_URL } from "@/lib/live-server-config";
import { getRecentMatches } from "@/lib/match-history";

// A DB read via drizzle isn't a Request-time API, so Next won't otherwise
// know this route needs fresh data on every request - force it dynamic so
// visitors always see recently-closed Matches.
export const dynamic = "force-dynamic";

export default async function MatchesPage() {
  const matches = await getRecentMatches(db, CONFIGURED_SERVER_BASE_URL);

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-3xl">Match history</h1>

      {matches.length === 0 ? (
        <p className="text-zinc-400">No matches have been recorded yet.</p>
      ) : (
        <RecentMatchesTable matches={matches} />
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
