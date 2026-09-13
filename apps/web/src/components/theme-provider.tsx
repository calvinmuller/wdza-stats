"use client";

import { SNAPSHOT_POLL_INTERVAL_MS } from "@wdza-stats/db/snapshot";
import { createContext, useContext, useEffect, useState } from "react";
import { getLightingInfo, type ColorScheme } from "@/lib/lighting";
import type { LiveSnapshotView } from "@/lib/live-snapshot";

// null means "follow the live server's lighting" - the toggle only ever
// stores an explicit override.
export type ThemeOverride = ColorScheme | null;

const STORAGE_KEY = "wdza-theme-override";
const SCHEMES: readonly ColorScheme[] = ["light", "dusk", "dark"];

type ThemeContextValue = {
  override: ThemeOverride;
  setOverride: (value: ThemeOverride) => void;
  resolved: ColorScheme;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function useTheme(): ThemeContextValue {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error("useTheme must be used within a ThemeProvider");
  }
  return context;
}

function readStoredOverride(): ThemeOverride {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return (SCHEMES as string[]).includes(stored ?? "")
      ? (stored as ColorScheme)
      : null;
  } catch {
    return null;
  }
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [override, setOverrideState] = useState<ThemeOverride>(null);
  const [autoTheme, setAutoTheme] = useState<ColorScheme>("dark");
  // Fog is an atmospheric effect layered on top of whichever color scheme
  // is active - it tracks the live weather even when the user has
  // overridden the color scheme itself.
  const [foggy, setFoggy] = useState(false);

  useEffect(() => {
    setOverrideState(readStoredOverride());
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function pollLighting() {
      try {
        const response = await fetch("/api/live-snapshot");
        if (!response.ok) {
          return;
        }
        const data: LiveSnapshotView = await response.json();
        if (!cancelled) {
          const info = getLightingInfo(data.snapshot.lighting);
          setAutoTheme(info.scheme);
          setFoggy(info.weather === "fog" || info.weather === "grayFog");
        }
      } catch {
        // Keep the last known auto theme/fog state until the next poll
        // succeeds.
      }
    }

    pollLighting();
    const interval = setInterval(pollLighting, SNAPSHOT_POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  const resolved = override ?? autoTheme;

  useEffect(() => {
    for (const scheme of SCHEMES) {
      document.documentElement.classList.toggle(scheme, resolved === scheme);
    }
  }, [resolved]);

  useEffect(() => {
    document.documentElement.classList.toggle("foggy", foggy);
  }, [foggy]);

  function setOverride(value: ThemeOverride) {
    setOverrideState(value);
    try {
      if (value === null) {
        localStorage.removeItem(STORAGE_KEY);
      } else {
        localStorage.setItem(STORAGE_KEY, value);
      }
    } catch {
      // Best-effort persistence only - the toggle still works this tab.
    }
  }

  return (
    <ThemeContext.Provider value={{ override, setOverride, resolved }}>
      <div aria-hidden="true" className="fog-overlay" />
      {children}
    </ThemeContext.Provider>
  );
}
