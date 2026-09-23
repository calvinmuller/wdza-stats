// The game's [WDServerFeed] posts to exactly one Url, and that Url is ours, but
// Warcon needs the same kill feed. So every batch from a known Server is passed
// on to Warcon untouched: the raw body, with Warcon's own bearer token. Off
// unless both env vars are set.
const TIMEOUT_MS = 10_000;

/**
 * Sends the raw batch to Warcon. Never throws: Warcon being slow or down must
 * not fail or delay our own ingest.
 */
export async function relayToWarcon(body: string): Promise<void> {
  const url = process.env.WARCON_FEED_URL;
  const token = process.env.WARCON_FEED_TOKEN;
  if (!url || !token) return;
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${token}`,
      },
      body,
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!response.ok) {
      console.warn(`[web] warcon relay got HTTP ${response.status}`);
    }
  } catch (error) {
    console.warn("[web] warcon relay failed:", error);
  }
}
