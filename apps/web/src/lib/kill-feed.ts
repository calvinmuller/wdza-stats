import { createHash } from "node:crypto";

// The pure part of the Kill feed: what the game POSTs to [WDServerFeed] Url
// and how one batch becomes Kills. Kill is defined in CONTEXT.md.

export const FEED_TOKEN_PATTERN = /^wkf_[A-Za-z0-9_-]{43}$/;

export function hashFeedToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/** The feed token in an Authorization header when it is shaped like one of ours; else null. */
export function parseFeedBearer(header: string | null): string | null {
  const match = /^Bearer\s+(\S+)\s*$/i.exec(header ?? "");
  return match && FEED_TOKEN_PATTERN.test(match[1]) ? match[1] : null;
}

/** The game never sent more than ten events; a batch this size is not the game. */
export const MAX_BATCH = 200;
export const MAX_BODY_BYTES = 65_536;

export class BatchTooLargeError extends Error {}

export type ParsedKill = {
  eventId: string;
  matchId: string;
  eventTime: number;
  map: string;
  killerSteamId: string | null;
  killerName: string | null;
  victimSteamId: string;
  victimName: string;
  cause: string | null;
  distanceM: number | null;
  headshot: boolean;
  suicide: boolean;
  tags: string[];
};

export type ParsedBatch = {
  instanceId: string;
  kills: ParsedKill[];
  /** events that were not kills, or kills missing what a row needs */
  skipped: number;
};

const STEAM_ID = /^\d{17}$/;
const text = (value: unknown, max = 200): string =>
  typeof value === "string" ? value.slice(0, max) : "";
const finite = (value: unknown): number | null =>
  typeof value === "number" && Number.isFinite(value) ? value : null;

const TAG_PREFIXES = [
  "Meta.Progression.Context.Player.KillContext.",
  "Meta.PlayerKillFlag.Player.",
];
// Local.Kill and Local.Death are on every event and say nothing.
const NOISE_TAGS = new Set(["Local.Kill", "Local.Death"]);

/** Context tags in short form: the known prefixes stripped, the two constant flags dropped. */
function shortTags(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const tags: string[] = [];
  for (const tag of raw) {
    if (typeof tag !== "string") continue;
    let short = tag;
    for (const prefix of TAG_PREFIXES) {
      if (short.startsWith(prefix)) short = short.slice(prefix.length);
    }
    if (!NOISE_TAGS.has(short) && !tags.includes(short))
      tags.push(short.slice(0, 60));
  }
  return tags;
}

function parseKill(event: unknown): ParsedKill | null {
  if (!event || typeof event !== "object") return null;
  const e = event as Record<string, unknown>;
  if (e.type !== "killed") return null;

  const eventId = text(e.eventId, 64);
  const victimSteamId = text(e.victimSteamId, 17);
  const eventTime = finite(e.eventTime);
  if (!eventId || !STEAM_ID.test(victimSteamId) || eventTime === null)
    return null;

  const killerSteamId = STEAM_ID.test(text(e.killerSteamId, 17))
    ? text(e.killerSteamId, 17)
    : null;
  const distance = finite(e.distance);
  const tags = shortTags(e.contextTags);
  return {
    eventId,
    matchId: text(e.matchId, 64),
    eventTime,
    map: text(e.mapName, 64),
    killerSteamId,
    killerName: killerSteamId ? text(e.killerName) : null,
    victimSteamId,
    victimName: text(e.victimName),
    cause: text(e.cause) || null,
    // Unreal units are centimetres.
    distanceM: distance === null ? null : Math.round(distance) / 100,
    headshot: tags.includes("Headshot"),
    suicide:
      tags.includes("Suicide") ||
      (killerSteamId !== null && killerSteamId === victimSteamId),
    tags: tags.filter((tag) => tag !== "Headshot" && tag !== "Suicide"),
  };
}

export function parseBatch(body: unknown): ParsedBatch {
  const events = (body as { events?: unknown } | null)?.events;
  if (!Array.isArray(events))
    throw new Error("Expected { serverId, serverName, events: [] }.");
  if (events.length > MAX_BATCH) {
    throw new BatchTooLargeError(
      `Too many events in one batch (${events.length}).`,
    );
  }

  const kills: ParsedKill[] = [];
  let skipped = 0;
  for (const event of events) {
    const kill = parseKill(event);
    if (kill) kills.push(kill);
    else skipped++;
  }
  return {
    instanceId: text((body as { serverId?: unknown }).serverId, 64),
    kills,
    skipped,
  };
}
