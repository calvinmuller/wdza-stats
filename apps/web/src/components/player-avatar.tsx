// Renders nothing when there's no cached avatar - used both standalone in
// player-listing tables and composed into SteamAvatar for the player page
// header.
export function PlayerAvatar({
  avatarUrl,
  size = 32,
}: {
  avatarUrl: string | null;
  size?: number;
}) {
  if (!avatarUrl) {
    return null;
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={avatarUrl}
      alt=""
      width={size}
      height={size}
      style={{ width: size, height: size }}
      className="inline-block shrink-0 rounded-full ring-1 ring-white/10 align-middle"
    />
  );
}
