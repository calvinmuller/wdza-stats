try {
  process.loadEnvFile(".env");
} catch {
  // .env is optional locally; CI sets real env vars directly.
}

if (process.env.TEST_DATABASE_URL) {
  process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
}
