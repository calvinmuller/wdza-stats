import { db } from "@/lib/db";
import { CONFIGURED_SERVER_BASE_URL } from "@/lib/live-server-config";
import { requireStaffPage } from "@/lib/require-staff";
import { getServerByBaseUrl } from "@/lib/server-lookup";
import { generateFeedTokenAction } from "../actions";
import { AdminShell } from "../admin-shell";
import { FeedTokenForm } from "../feed-token-form";

export const dynamic = "force-dynamic";

export default async function ServerTokenPage() {
  const staff = await requireStaffPage("admin");
  const feedServer = await getServerByBaseUrl(db, CONFIGURED_SERVER_BASE_URL);

  return (
    <AdminShell staff={staff} title="Server Token" description="The token the game server uses to push the kill feed.">
      <section className="flex flex-col gap-3">
        <h2 className="font-display text-xl text-zinc-100">Kill feed</h2>
        {feedServer ? (
          <FeedTokenForm action={generateFeedTokenAction} hasToken={feedServer.feedTokenHash !== null} />
        ) : (
          <p className="text-sm text-zinc-400">No Server is registered yet - the Worker creates it on its first poll.</p>
        )}
      </section>
    </AdminShell>
  );
}
