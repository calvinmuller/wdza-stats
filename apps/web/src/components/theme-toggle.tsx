"use client";

import { useTheme, type ThemeOverride } from "./theme-provider";

const OPTIONS: { label: string; value: ThemeOverride }[] = [
  { label: "Auto", value: null },
  { label: "Light", value: "light" },
  { label: "Dusk", value: "dusk" },
  { label: "Dark", value: "dark" },
];

export function ThemeToggle() {
  const { override, setOverride } = useTheme();

  return (
    <div className="inline-flex items-center rounded-full border border-white/10 bg-zinc-900/60 p-0.5 text-xs">
      {OPTIONS.map((option) => (
        <button
          key={option.label}
          type="button"
          onClick={() => setOverride(option.value)}
          title={option.value === null ? "Based off game lighting" : undefined}
          className={
            override === option.value
              ? "rounded-full bg-zinc-50 px-2.5 py-1 text-zinc-950"
              : "rounded-full px-2.5 py-1 text-zinc-400 hover:text-zinc-200"
          }
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
