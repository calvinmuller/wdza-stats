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
