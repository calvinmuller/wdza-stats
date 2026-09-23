import { getCurrentKickVoteInitiator } from "@/lib/current-kick-vote-initiator";
import { db } from "@/lib/db";
import { CONFIGURED_SERVER_BASE_URL } from "@/lib/live-server-config";
import { getLiveSnapshot } from "@/lib/live-snapshot";
import { LiveServerView } from "./live-server";

// A DB read via drizzle isn't a Request-time API, so Next won't otherwise
// know this route needs fresh data on every request instead of the build-time
// snapshot - force it dynamic so visitors always see the latest poll.
export const dynamic = "force-dynamic";

export default async function HomePage() {
  const [initial, viewer] = await Promise.all([
    getLiveSnapshot(db, CONFIGURED_SERVER_BASE_URL),
    getCurrentKickVoteInitiator(),
  ]);

  return <LiveServerView initial={initial} viewer={viewer} />;
}
