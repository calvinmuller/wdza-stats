import type { ReactNode } from "react";

/** A bordered panel under a small gold heading, e.g. Personal bests. */
export function StatPanel({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-3 rounded-lg border border-white/10 bg-zinc-900/60 px-5 py-4">
      {/* `!` because globals.css styles every h2 outside a Tailwind layer. */}
      <h2 className="text-xs font-semibold uppercase tracking-[0.2em]! text-brand-gold-500!">{title}</h2>
      {children}
    </section>
  );
}
