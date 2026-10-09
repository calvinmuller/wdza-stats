import { LiveServerView } from "@/app/live-server";
import { getBanner } from "@/lib/banners";
import { getCurrentKickVoteInitiator } from "@/lib/current-kick-vote-initiator";
import { getCurrentVerifiedPlayerSteamId } from "@/lib/current-verified-player";
import { db } from "@/lib/db";
import { getLiveSnapshot } from "@/lib/live-snapshot";
import { requirePublicServer } from "@/lib/server-lookup";

// A DB read via drizzle isn't a Request-time API, so Next won't otherwise
// know this route needs fresh data on every request instead of the build-time
// snapshot - force it dynamic so visitors always see the latest poll.
export const dynamic = "force-dynamic";

export default async function ServerLivePage({ params }: { params: Promise<{ server: string }> }) {
  const server = await requirePublicServer(db, params);
  const [initial, viewer, playerSteamId] = await Promise.all([
    getLiveSnapshot(db, server.baseUrl),
    getCurrentKickVoteInitiator(),
    getCurrentVerifiedPlayerSteamId(),
  ]);

  return (
    <LiveServerView
      serverSlug={server.slug}
      initial={initial}
      viewer={viewer}
      showSteamLink={playerSteamId === null}
      sidebarBanner={getBanner("sidebar")}
    />
  );
}
