"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

// The header's Verified Player sign-in state (see CONTEXT.md). Read from
// /api/steam/me after load rather than in the root layout, which would
// otherwise read cookies and make every page dynamic.
type State = { status: "loading" } | { status: "signedOut"; failed: boolean } | { status: "signedIn"; steamId: string };

export function PlayerSignIn() {
  const pathname = usePathname();
  const [state, setState] = useState<State>({ status: "loading" });

  useEffect(() => {
    const failed = new URLSearchParams(window.location.search).get("steamSignIn") === "failed";
    fetch("/api/steam/me", { cache: "no-store" })
      .then((response) => response.json() as Promise<{ steamId: string | null }>)
      .then(({ steamId }) => setState(steamId ? { status: "signedIn", steamId } : { status: "signedOut", failed }))
      .catch(() => setState({ status: "signedOut", failed }));
  }, []);

  if (state.status === "loading") return null;

  if (state.status === "signedOut") {
    return (
      <span className="flex items-center gap-2 text-xs">
        {state.failed && <span className="text-red-400">Steam sign-in failed</span>}
        <a
          href={`/api/steam/sign-in?${new URLSearchParams({ returnTo: pathname })}`}
          className="rounded-full border border-white/10 px-3 py-1 text-zinc-300 hover:text-zinc-50"
        >
          Sign in with Steam
        </a>
      </span>
    );
  }

  return (
    <span className="flex items-center gap-2 text-xs">
      <Link
        href={`/players/${state.steamId}`}
        className="rounded-full border border-white/10 px-3 py-1 text-zinc-300 hover:text-zinc-50"
      >
        This is you
      </Link>
      <form action="/api/steam/sign-out" method="post">
        <input type="hidden" name="returnTo" value={pathname} />
        <button type="submit" className="text-zinc-500 hover:text-zinc-300">
          Sign out
        </button>
      </form>
    </span>
  );
}
