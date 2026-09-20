# WDZA Stats

Public stats site for the WDZA Wardogs server. See `CONTEXT.md` for the domain
glossary and `docs/adr/` for architecture decisions.

## Structure

- `apps/worker` - long-running process that polls the RCON API and writes history to Postgres
- `apps/web` - Next.js app serving the public site, reading only from Postgres
- `packages/db` - shared Drizzle schema, migrations, and DB client used by both apps

## Local development

```sh
cp .env.example .env        # fill in RCON_TOKEN
docker compose up -d        # local Postgres (dev + test databases)
npm install
npm run db:migrate          # apply schema to the dev database
npm run db:seed             # seed the one configured Server row
```

Run the worker: `npm run dev --workspace=@wdza-stats/worker`
Run the web app: `npm run dev --workspace=@wdza-stats/web`

Steam profile enrichment (avatars, persona names, achievements) needs
`STEAM_API_KEY` set; the running worker fetches it automatically as new
players are seen online, but for players already known before you set the
key up (or before this feature shipped), backfill them once with:

```sh
npm run backfill:steam --workspace=@wdza-stats/worker
```

Safe to re-run - already-cached players are skipped.

## Admin access

The admin area (`/admin`) is for Staff Members, who sign in with an email and
password (`/admin/sign-in`). A **moderator** can ban and unban players; an
**admin** can also edit the game's config, issue the kill feed token, and manage
Staff Members (`/admin/staff`). There is no public sign-up and no email is ever
sent, so an admin sets each new Staff Member's first password (they must change
it at first sign-in) and resets any that is lost. Every admin action is recorded
in the `staff_audit_log` table. See `docs/adr/0005-staff-login-replaces-the-secret-admin-url.md`.

`ADMIN_PATH_SECRET` is no longer an admin password. It gates one page only,
`/<ADMIN_PATH_SECRET>/bootstrap`, which creates the **first** admin while none
exists and, at any time, resets an admin's password when no admin can sign in.
Keep it secret and long; it is the recovery path.

The web service needs `BETTER_AUTH_SECRET` (signs session cookies; generate one
with `openssl rand -hex 32`), `BETTER_AUTH_URL` (the site's public origin) and
`ADMIN_PATH_SECRET`. First-time setup: open the bootstrap page once and create
your admin.

## Testing

```sh
npm test        # migrates the test database, then runs the full suite
npm run typecheck
```

Tests run against a real local Postgres (`TEST_DATABASE_URL`), never mocks.

## Deployment (Railway)

`railway.worker.json` and `railway.web.json` document each service's build/start
commands. Since Railway login is an interactive, per-human step this repo can't
perform on its own, run:

```sh
./scripts/railway-deploy-wizard.sh
```

It walks through logging in, provisioning Postgres, creating the two services,
and deploying. **Rotate the RCON token before running it** - any token typed
into chat during design/discovery must be treated as compromised.
