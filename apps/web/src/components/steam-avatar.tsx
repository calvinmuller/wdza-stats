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
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={avatarUrl}
        alt=""
        width={32}
        height={32}
        className="size-8 shrink-0 rounded-full ring-1 ring-white/10"
      />
      {personaName}
    </span>
  );
}
