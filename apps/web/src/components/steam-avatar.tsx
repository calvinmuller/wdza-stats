import { PlayerAvatar } from "./player-avatar";

// Renders nothing until a SteamProfile has been fetched for this player -
// avatarUrl and personaName always arrive together (both come from the same
// GetPlayerSummaries call), so either missing means neither is shown.
export function SteamAvatar({
  avatarUrl,
  personaName,
}: {
  avatarUrl: string | null;
  personaName: string | null;
}) {
  if (!avatarUrl || !personaName) {
    return null;
  }

  return (
    <span className="inline-flex items-center gap-2 text-lg font-normal text-zinc-400">
      <PlayerAvatar avatarUrl={avatarUrl} size={32} />
      {personaName}
    </span>
  );
}
