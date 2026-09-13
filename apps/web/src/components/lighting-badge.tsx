import { getLightingInfo } from "@/lib/lighting";

// Renders the sun low (dawn/dusk) or high (rest of the day), tinted amber
// when clear and dulled with a cloud overlay when overcast/foggy - the only
// two axes the RCON API's lighting values vary along.
function SunIcon({
  horizon,
  weather,
}: {
  horizon: "low" | "high";
  weather: "clear" | "fog" | "gray" | "grayFog";
}) {
  const overcast = weather !== "clear";
  const sunClassName = overcast ? "text-zinc-500" : "text-amber-300";
  const sunCy = horizon === "low" ? 15 : 10;

  return (
    <svg viewBox="0 0 24 24" className="size-4 shrink-0" aria-hidden="true">
      <circle cx="12" cy={sunCy} r="5" className={sunClassName} fill="currentColor" />
      {overcast && (
        <path
          d="M4 16.5a3.5 3.5 0 0 1 3.5-3.5c.3-1.7 1.8-3 3.6-3 1.8 0 3.3 1.3 3.6 3H15a3 3 0 0 1 0 6H7a3 3 0 0 1-3-2.5Z"
          className="text-zinc-400"
          fill="currentColor"
        />
      )}
    </svg>
  );
}

export function LightingBadge({ lighting }: { lighting: string }) {
  const info = getLightingInfo(lighting);

  return (
    <span className="inline-flex items-center gap-1.5 text-zinc-200">
      <SunIcon horizon={info.horizon} weather={info.weather} />
      {info.label}
    </span>
  );
}
