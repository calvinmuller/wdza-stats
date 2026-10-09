import { db } from "@/lib/db";
import { redirectToDefaultServer } from "@/lib/server-lookup";

// From before there was more than one Server: the default Server's page.
export const dynamic = "force-dynamic";

export default async function LegacyRankingsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}): Promise<never> {
  return redirectToDefaultServer(db, "/rankings", await searchParams);
}
