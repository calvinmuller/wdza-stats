import { db } from "@/lib/db";
import { requireStaffPage } from "@/lib/require-staff";
import { getOwnSteamId } from "@/lib/staff-steam-link";
import { AdminShell, buttonClass, dangerButtonClass, rowClass } from "../admin-shell";
import { unlinkOwnSteamIdAction } from "./actions";

export const dynamic = "force-dynamic";

const OUTCOMES: Record<string, { text: string; className: string }> = {
  linked: { text: "Steam account linked.", className: "text-emerald-400" },
  taken: { text: "That Steam account is already linked to another Staff Member.", className: "text-red-400" },
  failed: { text: "Steam sign-in didn't complete, so nothing was linked.", className: "text-red-400" },
};

// A Staff Member's own linked steamId (docs/adr/0007): proven by signing in
// with Steam, and never a KickVote's target once linked.
export default async function AccountPage({
  searchParams,
}: {
  searchParams: Promise<{ steamLink?: string }>;
}) {
  const staff = await requireStaffPage("moderator");
  const [steamId, { steamLink }] = await Promise.all([getOwnSteamId(db, staff.id), searchParams]);
  const outcome = steamLink ? OUTCOMES[steamLink] : undefined;

  return (
    <AdminShell
      staff={staff}
      title="Steam account"
      description="Link your own Steam account so it can never be the target of a KickVote. You prove it's yours by signing in with Steam; nobody can link one for you."
    >
      {outcome && <p className={`text-sm ${outcome.className}`}>{outcome.text}</p>}
      <div className={rowClass}>
        {steamId ? (
          <>
            <p className="flex-1 text-sm text-zinc-300">
              Linked to Steam ID <span className="font-mono text-zinc-100">{steamId}</span>
            </p>
            <form action={unlinkOwnSteamIdAction}>
              <button type="submit" className={dangerButtonClass}>
                Unlink
              </button>
            </form>
          </>
        ) : (
          <>
            <p className="flex-1 text-sm text-zinc-400">No Steam account linked.</p>
            <a href="/api/steam/staff-link/start" className={buttonClass}>
              Link with Steam
            </a>
          </>
        )}
      </div>
    </AdminShell>
  );
}
