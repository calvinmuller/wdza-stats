// Asks a visitor who isn't a Verified Player (see CONTEXT.md) to sign in with
// Steam, which claims their steamId. Signing in brings them back to `returnTo`.
export function SteamLinkBanner({ returnTo }: { returnTo: string }) {
  return (
    <section className="rounded-xl border border-l-4 border-white/10 border-l-brand-gold-500 bg-zinc-900/60 p-6">
      <h2 className="text-lg font-semibold text-zinc-50">Link your Steam account to join the Pack</h2>
      <p className="mt-2 max-w-xl text-sm text-zinc-400">
        Your profile isn&apos;t verified yet. Connect your Steam account to claim it and unlock the full Pack
        experience.
      </p>
      <a
        href={`/api/steam/sign-in?${new URLSearchParams({ returnTo })}`}
        className="mt-4 block rounded-md bg-sky-300 px-4 py-3 text-center font-mono text-sm font-semibold uppercase tracking-[0.2em] text-black hover:bg-sky-200"
      >
        Sign in through Steam
      </a>
    </section>
  );
}
