import Link from "next/link";
import { notFound } from "next/navigation";
import { MatchPlayerTable } from "@/components/match-player-table";
import { db } from "@/lib/db";
import { CONFIGURED_SERVER_BASE_URL } from "@/lib/live-server-config";
import { formatDateTime } from "@/lib/format-date";
import { formatMatchDuration } from "@/lib/format-duration";
import { getMatchDetail } from "@/lib/match-history";

// A DB read via drizzle isn't a Request-time API, so Next won't otherwise
// know this route needs fresh data on every request - force it dynamic so
// visitors always see the latest recorded stats.
export const dynamic = "force-dynamic";

export default async function MatchDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const matchId = Number(id);

  if (!Number.isInteger(matchId)) {
    notFound();
  }

  const match = await getMatchDetail(db, CONFIGURED_SERVER_BASE_URL, matchId);

  if (!match) {
    notFound();
  }

  const summary = [
    { label: "Winning faction", value: match.winningFaction ?? "Unknown" },
    { label: "MVP", value: match.mvpDisplayName ?? "Unknown" },
    { label: "Total kills", value: match.totalKills },
    { label: "Total deaths", value: match.totalDeaths },
    { label: "Total cash", value: match.totalCash },
    { label: "Duration", value: formatMatchDuration(match.startedAt, match.endedAt) },
  ];

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link
          href="/matches"
          className="text-xs text-brand-gold-500 hover:underline"
        >
          &larr; Back to match history
        </Link>
        <h1 className="mt-1 text-3xl">{match.map}</h1>
        <p className="text-sm text-zinc-400">
          {match.experiences.join(", ")} &middot;{" "}
          {formatDateTime(match.endedAt)}
        </p>
      </div>

      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {summary.map((stat) => (
          <div
            key={stat.label}
            className="rounded-lg border border-white/10 bg-zinc-900/60 px-4 py-3"
          >
            <dt className="text-xs uppercase tracking-wide text-zinc-500">
              {stat.label}
            </dt>
            <dd className="font-display text-2xl text-zinc-50">
              {stat.value}
            </dd>
          </div>
        ))}
      </dl>

      {match.firstBlood && (
        <div className="rounded-lg border border-white/10 bg-zinc-900/60 px-4 py-3 text-sm text-zinc-300">
          <span className="text-brand-gold-500">First blood:</span>{" "}
          <span className="text-zinc-100">{match.firstBlood.killerDisplayName}</span>
          {match.firstBlood.victimDisplayName && (
            <>
              {" "}
              on <span className="text-zinc-100">{match.firstBlood.victimDisplayName}</span>
            </>
          )}
        </div>
      )}

      <div className="flex flex-col gap-3">
        <h2 className="text-xl text-zinc-100">Player stats</h2>
        {match.players.length === 0 ? (
          <p className="text-zinc-400">No player stats recorded for this match.</p>
        ) : (
          <MatchPlayerTable players={match.players} />
        )}
      </div>
    </div>
  );
}
