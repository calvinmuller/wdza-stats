// Steam sign-in for Verified Players (see CONTEXT.md and docs/adr/0007): Steam
// speaks OpenID 2.0, not OAuth2, so this is the whole relying-party side by
// hand - send the browser to Steam, then, when it comes back, ask Steam
// directly whether the assertion it carries is genuine. Nothing in the
// returned query string is trusted until Steam says `is_valid:true`.

const STEAM_OPENID_ENDPOINT = "https://steamcommunity.com/openid/login";
const OPENID_NS = "http://specs.openid.net/auth/2.0";
const IDENTIFIER_SELECT = "http://specs.openid.net/auth/2.0/identifier_select";
const CLAIMED_ID_PATTERN = /^https:\/\/steamcommunity\.com\/openid\/id\/(\d{17})$/;

/** Where the browser goes to sign in; Steam sends it back to `returnTo`. */
export function buildSteamSignInUrl(realm: string, returnTo: string): string {
  const params = new URLSearchParams({
    "openid.ns": OPENID_NS,
    "openid.mode": "checkid_setup",
    "openid.return_to": returnTo,
    "openid.realm": realm,
    "openid.identity": IDENTIFIER_SELECT,
    "openid.claimed_id": IDENTIFIER_SELECT,
  });
  return `${STEAM_OPENID_ENDPOINT}?${params}`;
}

/**
 * The steamId Steam vouches for in this callback, or null for anything that
 * isn't a genuine, successful sign-in meant for `expectedReturnTo` (origin +
 * path of our callback; its query string is ours and not compared).
 *
 * Replay of a captured callback URL is left to Steam: in stateless mode it
 * answers `is_valid:false` for a nonce it has already verified once.
 */
export async function verifySteamAssertion(
  query: URLSearchParams,
  expectedReturnTo: string,
  fetchImpl: typeof fetch = fetch,
): Promise<string | null> {
  if (query.get("openid.mode") !== "id_res") return null;
  if (query.get("openid.op_endpoint") !== STEAM_OPENID_ENDPOINT) return null;

  const returnTo = query.get("openid.return_to");
  if (!returnTo || stripQuery(returnTo) !== stripQuery(expectedReturnTo)) return null;

  const claimedId = query.get("openid.claimed_id");
  if (!claimedId || query.get("openid.identity") !== claimedId) return null;
  const match = CLAIMED_ID_PATTERN.exec(claimedId);
  if (!match) return null;

  // Echo back exactly the openid.* fields Steam sent, as the spec requires,
  // with only the mode changed.
  const body = new URLSearchParams();
  for (const [key, value] of query) {
    if (key.startsWith("openid.")) body.set(key, value);
  }
  body.set("openid.mode", "check_authentication");

  let text: string;
  try {
    const response = await fetchImpl(STEAM_OPENID_ENDPOINT, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body,
    });
    if (!response.ok) return null;
    text = await response.text();
  } catch {
    return null;
  }

  return text.split("\n").some((line) => line.trim() === "is_valid:true") ? match[1] : null;
}

/**
 * `raw` as a path on this site, otherwise "/". Resolved the way a browser
 * would, against a placeholder origin, so "//host", "/\host" and "/\t/host"
 * (browsers drop tabs and newlines) are all caught as another site.
 */
export function safeReturnPath(raw: string | null | undefined): string {
  if (!raw || !raw.startsWith("/")) return "/";
  const placeholder = "http://return-path.invalid";
  let parsed: URL;
  try {
    parsed = new URL(raw, placeholder);
  } catch {
    return "/";
  }
  if (parsed.origin !== placeholder) return "/";
  return `${parsed.pathname}${parsed.search}${parsed.hash}`;
}

function stripQuery(url: string): string {
  try {
    const parsed = new URL(url);
    return `${parsed.origin}${parsed.pathname}`;
  } catch {
    return "";
  }
}
