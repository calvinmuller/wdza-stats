"use client";

import { useTheme, type ThemeOverride } from "./theme-provider";

const AUTO = "auto";

const OPTIONS: { label: string; value: ThemeOverride }[] = [
  { label: "Auto", value: null },
  { label: "Light", value: "light" },
  { label: "Dusk", value: "dusk" },
  { label: "Dark", value: "dark" },
];

export function ThemeToggle() {
  const { override, setOverride } = useTheme();

  return (
    <label
      className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-zinc-900/60 py-1 pl-2.5 pr-1.5 text-xs text-zinc-500"
      title="Auto follows the in-game lighting"
    >
      Lighting
      <select
        value={override ?? AUTO}
        onChange={(event) =>
          setOverride(
            event.target.value === AUTO
              ? null
              : (event.target.value as ThemeOverride),
          )
        }
        className="cursor-pointer bg-transparent text-zinc-200 focus:outline-none"
      >
        {OPTIONS.map((option) => (
          <option
            key={option.label}
            value={option.value ?? AUTO}
            className="bg-zinc-900 text-zinc-200"
          >
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}
