# Servers are managed in the admin area

Every table was already keyed by Server, but a deployment could still track only one: the Worker took its Server from `RCON_BASE_URL`/`RCON_TOKEN`, and the web app looked up that same URL on every page. Admins now add, edit and disable Servers at `/admin/servers`. The Worker reads the `servers` table and runs one poller per enabled Server that has an RCON token. It re-reads the table on a `servers_changed` notification from the admin page, and every minute in case one was missed. Each public page lives under `/servers/{slug}/...`.

## Considered Options
- Keep RCON tokens in the Worker's environment, as a map from URL to token — rejected: adding a Server would still need a redeploy, which defeats managing them in the admin area.
- Seal each token with a keypair (the web app holds only the public key, the Worker the private key) — rejected for now as extra key handling. It is the upgrade path if plain text in Postgres stops being acceptable.
- A server picker saved in a cookie, with `?server=` on links — rejected in favour of the path: a page about a Server should have its own address, one that can be shared.
- `/{slug}/...` at the root — not possible: the root's one dynamic segment is already the staff bootstrap's `[adminSecret]`.

## Consequences
- **RCON tokens are stored in Postgres in plain text.** This reverses `.env.example`'s old rule that the token is never persisted and never reaches apps/web. The web app now receives a token when an admin saves the form, but it never reads one back: no page or API route selects `rcon_token`, and the audit log records only that a token was replaced. Anyone who can read the database, or a dump of it, can read every RCON token.
- apps/web still never calls the RCON API (`no-rcon-access.test.ts`). A KickVote's broadcast and kick go out through the Worker's client for that vote's own Server.
- A disabled Server is neither polled nor shown. Its history is kept, so enabling it again carries on where it left off. The Worker expires the closed-window KickVotes of a Server it isn't polling, since nothing else ever would.
- The old top-level URLs (`/stats`, `/players/{steamId}`, ...) redirect to the same page on the default Server, which is the oldest enabled one. `/matches/{id}` redirects to that Match's own Server. `/` lists the Servers, or goes straight to the only one.
- `/api/*` routes keep their paths and take the Server as `?server={slug}`, defaulting to the default Server so existing callers keep working. `/api/servers` lists the slugs.
- `RCON_BASE_URL`, `RCON_TOKEN` and `SERVER_NAME` are optional on the Worker. When set, they bring a deployment from before this change over: they make sure that Server has a row, and give it the token if it has none. They never overwrite what an admin has set.
- A Server's kill feed token is issued per Server on the same page. Seasons, bans, Staff, game config and Banners stay shared by every Server.
