import { matches, servers } from "@wdza-stats/db";
import { and, eq } from "drizzle-orm";
import { notFound, redirect } from "next/navigation";
import { db } from "@/lib/db";
import { serverPath } from "@/lib/server-path";

// From before there was more than one Server. A Match belongs to exactly one
// Server, so this goes to that Server's page for it, not the default's.
export const dynamic = "force-dynamic";

export default async function LegacyMatchPage({ params }: { params: Promise<{ id: string }> }): Promise<never> {
  const { id } = await params;
  const matchId = Number(id);
  if (!Number.isInteger(matchId)) notFound();

  const [row] = await db
    .select({ slug: servers.slug })
    .from(matches)
    .innerJoin(servers, eq(servers.id, matches.serverId))
    .where(and(eq(matches.id, matchId), eq(servers.enabled, true)))
    .limit(1);
  if (!row) notFound();
  redirect(serverPath(row.slug, `/matches/${matchId}`));
}
