import Link from "next/link";
import type { PublicListPlayer } from "@/lib/public-lists";
import { CountryFlag } from "./country-flag";
import { PlayerAvatar } from "./player-avatar";

const linkClass = "font-medium text-zinc-100 hover:text-brand-gold-500";

// One player on /bans or /whitelist: their name links to their overview when
// they have one, else to their Steam profile, since a steamId nobody here has
// a name for is still worth being able to look up.
export function PublicListPlayerCell({ player }: { player: PublicListPlayer }) {
  const label = player.name ?? player.steamId;

  return (
    <span className="flex items-center gap-2">
      <PlayerAvatar avatarUrl={player.avatarUrl} size={24} />
      {player.hasStats ? (
        <Link href={`/players/${encodeURIComponent(player.steamId)}`} className={linkClass}>
          {label}
        </Link>
      ) : (
        <a
          href={`https://steamcommunity.com/profiles/${encodeURIComponent(player.steamId)}`}
          target="_blank"
          rel="noopener noreferrer"
          className={linkClass}
        >
          {label}
        </a>
      )}
      <CountryFlag countryCode={player.countryCode} />
    </span>
  );
}
