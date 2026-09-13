// The RCON API's v1/lightings endpoint returns this fixed set of 8 values -
// no night phases are exposed, so we don't need to handle any.
export type LightingId =
  | "DayStartClear"
  | "DayEarlyClear"
  | "DayEarlyFog"
  | "DayClear"
  | "DayLateClear"
  | "DayLateGray"
  | "DayLateGrayFog"
  | "DayEndClear";

// The site theme each lighting drives - "dusk" is a dimmer, warm-toned
// scheme (not a plain darkened "light") reserved for the DayLate* group,
// which reads as flatter/duller light in-game than early/midday sun.
export type ColorScheme = "light" | "dusk" | "dark";

export type LightingInfo = {
  label: string;
  horizon: "low" | "high";
  weather: "clear" | "fog" | "gray" | "grayFog";
  scheme: ColorScheme;
};

const LIGHTING_INFO: Record<LightingId, LightingInfo> = {
  DayStartClear: { label: "Dawn", horizon: "low", weather: "clear", scheme: "light" },
  DayEarlyClear: {
    label: "Early morning",
    horizon: "high",
    weather: "clear",
    scheme: "light",
  },
  DayEarlyFog: {
    label: "Early morning fog",
    horizon: "high",
    weather: "fog",
    scheme: "dark",
  },
  DayClear: { label: "Midday", horizon: "high", weather: "clear", scheme: "light" },
  DayLateClear: {
    label: "Afternoon",
    horizon: "high",
    weather: "clear",
    scheme: "dusk",
  },
  DayLateGray: {
    label: "Overcast afternoon",
    horizon: "high",
    weather: "gray",
    scheme: "dusk",
  },
  DayLateGrayFog: {
    label: "Overcast & foggy afternoon",
    horizon: "high",
    weather: "grayFog",
    scheme: "dusk",
  },
  DayEndClear: { label: "Dusk", horizon: "low", weather: "clear", scheme: "light" },
};

export function getLightingInfo(lighting: string): LightingInfo {
  return (
    LIGHTING_INFO[lighting as LightingId] ?? {
      label: lighting,
      horizon: "high",
      weather: "clear",
      scheme: "light",
    }
  );
}
