import { MAX_SERVER_SLUG_LENGTH } from "@wdza-stats/db";
import Link from "next/link";
import { ActionForm } from "@/components/action-form";
import { db } from "@/lib/db";
import { formatDateTime } from "@/lib/format-date";
import { requireStaffPage } from "@/lib/require-staff";
import { listServersForAdmin, type ServerListing } from "@/lib/server-management";
import { serverPath } from "@/lib/server-path";
import { AdminShell, buttonClass, labelClass, rowClass, textInputClass } from "../admin-shell";
import { addServerAction, generateFeedTokenAction, updateServerAction } from "./actions";
import { FeedTokenForm } from "./feed-token-form";

export const dynamic = "force-dynamic";

const SLUG_PATTERN = "[a-z0-9]+(-[a-z0-9]+)*";

// The fields adding and editing share. `server` is the row being edited, or
// undefined for the add form.
function ServerFields({ server }: { server?: ServerListing }) {
  return (
    <>
      <label className={`${labelClass} min-w-48 flex-[2]`}>
        Name
        <input name="name" required defaultValue={server?.name} autoComplete="off" className={textInputClass} />
      </label>
      <label className={`${labelClass} min-w-40 flex-1`}>
        URL name (/servers/…)
        <input
          name="slug"
          required
          defaultValue={server?.slug}
          pattern={SLUG_PATTERN}
          maxLength={MAX_SERVER_SLUG_LENGTH}
          placeholder="e.g. wdza-2"
          autoComplete="off"
          className={textInputClass}
        />
      </label>
      <label className={`${labelClass} min-w-56 flex-[2]`}>
        RCON URL
        <input
          name="baseUrl"
          type="url"
          required
          defaultValue={server?.baseUrl}
          placeholder="http://203.0.113.10:9006"
          autoComplete="off"
          className={textInputClass}
        />
      </label>
      <label className={`${labelClass} min-w-48 flex-[2]`}>
        {server ? "New RCON token" : "RCON token"}
        <input
          name="rconToken"
          type="password"
          required={!server}
          placeholder={server?.hasRconToken ? "Leave blank to keep the current one" : undefined}
          autoComplete="new-password"
          className={textInputClass}
        />
      </label>
      <label className="flex items-center gap-2 pb-2 text-sm text-zinc-300">
        <input name="enabled" type="checkbox" defaultChecked={server?.enabled ?? true} />
        Enabled
      </label>
    </>
  );
}

function pollStatus(server: ServerListing): string {
  if (!server.enabled) return "Disabled: not polled and not on the public site";
  if (!server.hasRconToken) return "No RCON token, so the Worker can't poll it";
  if (!server.lastSnapshotAt) return "Waiting for the Worker's first poll";
  return `Last polled ${formatDateTime(server.lastSnapshotAt.toISOString())}`;
}

export default async function ServersPage() {
  const staff = await requireStaffPage("admin");
  const servers = await listServersForAdmin(db);

  return (
    <AdminShell
      staff={staff}
      title="Servers"
      description="The game servers this site tracks. The Worker polls each enabled Server that has an RCON token, and picks up changes here within seconds. An RCON token is kept in the database so the Worker can use it, and is never shown again once saved. Disabling a Server stops polling and hides it from the public site; its history is kept."
    >
      <section className="flex flex-col gap-3">
        <h2 className="font-display text-xl text-zinc-100">Add a Server</h2>
        <ActionForm action={addServerAction} className={rowClass} successMessage="Server added. The Worker starts polling it shortly.">
          <ServerFields />
          <button type="submit" className={buttonClass}>
            Add
          </button>
        </ActionForm>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="font-display text-xl text-zinc-100">Servers</h2>
        {servers.length === 0 && <p className="text-sm text-zinc-500">No Servers yet.</p>}
        {servers.map((server) => (
          <div key={server.id} className="flex flex-col gap-4 rounded-lg border border-white/10 bg-zinc-900/60 px-4 py-3">
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <span className="text-zinc-100">{server.name}</span>
              {server.enabled ? (
                <Link href={serverPath(server.slug)} className="text-sm text-brand-gold-500 hover:underline">
                  {serverPath(server.slug)}
                </Link>
              ) : (
                <span className="text-sm text-zinc-500">{serverPath(server.slug)}</span>
              )}
              <span className="text-xs text-zinc-500">{pollStatus(server)}</span>
            </div>
            <ActionForm
              action={updateServerAction.bind(null, server.id)}
              className="flex flex-wrap items-end gap-3"
              successMessage="Saved."
            >
              <ServerFields server={server} />
              <button type="submit" className={buttonClass}>
                Save
              </button>
            </ActionForm>
            <div className="flex flex-col gap-2 border-t border-white/10 pt-3">
              <h3 className="text-sm font-medium text-zinc-200">Kill feed</h3>
              <FeedTokenForm action={generateFeedTokenAction.bind(null, server.id)} hasToken={server.hasFeedToken} />
            </div>
          </div>
        ))}
      </section>
    </AdminShell>
  );
}
