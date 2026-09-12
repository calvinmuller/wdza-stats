import { FactionSwatch } from "@/components/faction-swatch";
import { db } from "@/lib/db";
import { CONFIGURED_SERVER_BASE_URL } from "@/lib/live-server-config";
import { getPlayerCareerStat } from "@/lib/player-lookup";

// A DB read via drizzle isn't a Request-time API, so Next won't otherwise
// know this route needs fresh data on every request - force it dynamic so
// visitors always see current totals.
export const dynamic = "force-dynamic";

export default async function PlayerPage({
  params,
}: {
  params: Promise<{ steamId: string }>;
}) {
  const { steamId } = await params;
  const player = await getPlayerCareerStat(db, CONFIGURED_SERVER_BASE_URL, steamId);

  if (!player) {
    return (
      <main>
        <p>No player found with that Steam ID.</p>
      </main>
    );
  }

  return (
    <main>
      <h1>
        {player.factionColor && <FactionSwatch color={player.factionColor} />}
        {player.displayName}
      </h1>
      <dl className="player-stats">
        <dt>Kills</dt>
        <dd>{player.kills}</dd>
        <dt>Deaths</dt>
        <dd>{player.deaths}</dd>
        <dt>K/D</dt>
        <dd>{player.kd.toFixed(2)}</dd>
        <dt>Cash</dt>
        <dd>{player.cash}</dd>
        <dt>Matches played</dt>
        <dd>{player.matchesPlayed}</dd>
      </dl>
    </main>
  );
}
