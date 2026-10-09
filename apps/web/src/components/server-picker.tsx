"use client";

import { useParams, usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { parseServerPath, serverPath } from "@/lib/server-path";

type ServerOption = { name: string; slug: string };

// Switches the header between Servers, staying on the same section (a
// player's page stays on that player). Read from /api/servers after load, like
// PlayerSignIn, so the root layout stays static. Hidden with fewer than two
// Servers - there is nothing to switch between.
export function ServerPicker() {
  const router = useRouter();
  const pathname = usePathname();
  const serverSlug = useParams<{ server?: string }>()?.server;
  const [servers, setServers] = useState<ServerOption[]>([]);

  useEffect(() => {
    fetch("/api/servers")
      .then((response) => (response.ok ? (response.json() as Promise<{ servers: ServerOption[] }>) : { servers: [] }))
      .then((body) => setServers(body.servers))
      .catch(() => setServers([]));
  }, []);

  if (servers.length < 2) return null;

  // A Match belongs to one Server, so another Server gets its match history.
  const rest = parseServerPath(pathname)?.rest.replace(/^\/matches\/.+$/, "/matches") ?? "";

  return (
    <select
      aria-label="Server"
      value={serverSlug ?? ""}
      onChange={(event) => router.push(serverPath(event.target.value, rest))}
      className="max-w-56 truncate rounded-lg border border-white/10 bg-zinc-900/60 px-2 py-1.5 text-sm text-zinc-100 focus:border-brand-gold-500 focus:outline-none"
    >
      {!serverSlug && (
        <option value="" disabled>
          Choose a server
        </option>
      )}
      {servers.map((server) => (
        <option key={server.slug} value={server.slug}>
          {server.name}
        </option>
      ))}
    </select>
  );
}
