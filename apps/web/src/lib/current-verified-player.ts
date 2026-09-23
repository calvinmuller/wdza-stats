import { cookies } from "next/headers";
import { db } from "./db";
import { getVerifiedPlayerSteamId, VERIFIED_PLAYER_COOKIE } from "./verified-player";

/** The signed-in Verified Player's steamId for this request, or null. */
export async function getCurrentVerifiedPlayerSteamId(): Promise<string | null> {
  const token = (await cookies()).get(VERIFIED_PLAYER_COOKIE)?.value;
  return token ? getVerifiedPlayerSteamId(db, token) : null;
}
