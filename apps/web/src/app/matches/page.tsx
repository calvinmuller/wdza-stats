import Link from "next/link";
import { RecentMatchesTable } from "@/components/recent-matches-table";
import { db } from "@/lib/db";
import { CONFIGURED_SERVER_BASE_URL } from "@/lib/live-server-config";
import { getMatchesPage, parseMatchesPage } from "@/lib/match-history";

// A DB read via drizzle isn't a Request-time API, so Next won't otherwise
// know this route needs fresh data on every request - force it dynamic so
// visitors always see recently-closed Matches.
export const dynamic = "force-dynamic";

export default async function MatchesPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const { page: rawPage } = await searchParams;
  const page = parseMatchesPage(rawPage);

  const result = await getMatchesPage(db, CONFIGURED_SERVER_BASE_URL, page);

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-3xl">Match history</h1>

      {result.totalCount === 0 ? (
        <p className="text-zinc-400">No matches have been recorded yet.</p>
      ) : result.rows.length === 0 ? (
        <p className="text-zinc-400">
          There&apos;s no page {page} - there {result.totalPages === 1 ? "is" : "are"} only{" "}
          {result.totalPages} page{result.totalPages === 1 ? "" : "s"} of matches.{" "}
          <Link href="/matches" className="text-brand-gold-500 hover:underline">
            Back to page 1
          </Link>
          .
        </p>
      ) : (
        <>
          <RecentMatchesTable matches={result.rows} />

          {result.totalPages > 1 && (
            <div className="flex items-center gap-4 text-sm text-zinc-400">
              {page > 1 ? (
                <Link
                  href={`/matches?page=${page - 1}`}
                  className="hover:text-brand-gold-500"
                >
                  ← Previous
                </Link>
              ) : (
                <span className="opacity-40">← Previous</span>
              )}
              <span>
                Page {page} of {result.totalPages}
              </span>
              {page < result.totalPages ? (
                <Link
                  href={`/matches?page=${page + 1}`}
                  className="hover:text-brand-gold-500"
                >
                  Next →
                </Link>
              ) : (
                <span className="opacity-40">Next →</span>
              )}
            </div>
          )}
        </>
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
