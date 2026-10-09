import { db } from "@/lib/db";
import { redirectToDefaultServer } from "@/lib/server-lookup";

// From before there was more than one Server: this player on the default Server.
export const dynamic = "force-dynamic";

export default async function LegacyPlayerPage({
  params,
  searchParams,
}: {
  params: Promise<{ steamId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}): Promise<never> {
  const { steamId } = await params;
  return redirectToDefaultServer(db, `/players/${encodeURIComponent(steamId)}`, await searchParams);
}
