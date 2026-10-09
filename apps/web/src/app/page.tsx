import Link from "next/link";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getServerDirectory } from "@/lib/server-lookup";
import { serverPath } from "@/lib/server-path";

// A DB read via drizzle isn't a Request-time API, so Next won't otherwise
// know this route needs fresh data on every request - force it dynamic so
// visitors always see the latest poll.
export const dynamic = "force-dynamic";

// Every Server this site tracks, each linking to its own live dashboard. With
// just one there is nothing to choose, so it goes straight there.
export default async function HomePage() {
  const directory = await getServerDirectory(db);

  if (directory.length === 1) redirect(serverPath(directory[0].slug));

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-3xl">Servers</h1>
      {directory.length === 0 ? (
        <p className="text-zinc-400">No servers are being tracked yet.</p>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2">
          {directory.map((server) => (
            <li key={server.slug}>
              <Link
                href={serverPath(server.slug)}
                className="flex h-full flex-col gap-1 rounded-xl border border-white/10 bg-zinc-900/60 p-5 transition-colors hover:border-brand-gold-500/60"
              >
                <span className="font-display text-xl text-zinc-50">{server.name}</span>
                {server.live ? (
                  <span className="text-sm text-zinc-400">
                    <span className="text-zinc-200">
                      {server.live.playerCount}/{server.live.maxPlayers}
                    </span>{" "}
                    players online &middot; {server.live.map}
                  </span>
                ) : (
                  <span className="text-sm text-zinc-500">No live data yet</span>
                )}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
