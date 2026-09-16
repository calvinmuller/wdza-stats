import { CountryFlag } from "./country-flag";
import { PlayerAvatar } from "./player-avatar";

// Renders nothing until a SteamProfile has been fetched for this player -
// avatarUrl and personaName always arrive together (both come from the same
// GetPlayerSummaries call), so either missing means neither is shown.
// countryCode is independent (can be null even when the others are set) and
// simply renders no flag when absent.
export function SteamAvatar({
  avatarUrl,
  personaName,
  countryCode = null,
}: {
  avatarUrl: string | null;
  personaName: string | null;
  countryCode?: string | null;
}) {
  if (!avatarUrl || !personaName) {
    return null;
  }

  return (
    <span className="inline-flex items-center gap-2 text-lg font-normal text-zinc-400">
      <PlayerAvatar avatarUrl={avatarUrl} size={32} />
      {personaName}
      <CountryFlag countryCode={countryCode} />
    </span>
  );
}
