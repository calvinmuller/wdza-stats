try {
  process.loadEnvFile(".env");
} catch {
  // .env is optional locally; CI sets real env vars directly.
}

if (process.env.TEST_DATABASE_URL) {
  process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
}

// Staff sign-in (apps/web/src/lib/auth.ts) needs a signing secret; tests don't
// care what it is.
process.env.BETTER_AUTH_SECRET ??= "test-only-better-auth-secret-not-used-anywhere-else";

// Never relay test batches to the real Warcon (apps/web/src/lib/warcon-relay.ts).
delete process.env.WARCON_FEED_URL;
delete process.env.WARCON_FEED_TOKEN;
