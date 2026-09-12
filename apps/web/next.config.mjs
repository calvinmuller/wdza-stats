import path from "node:path";
import { fileURLToPath } from "node:url";

// Next.js only loads .env from this app's own directory; the repo's shared
// .env lives at the monorepo root, so load it explicitly before any route
// module (e.g. src/lib/db.ts) reads process.env at import time.
//
// This can't import loadRootEnv from @wdza-stats/db: Next loads this file
// with a plain Node ESM loader (no TS extension resolution), and that
// package's extensionless "./schema" etc. imports only resolve under a
// TS-aware loader (tsx, Next's own compiler, vitest). So the loading logic
// is duplicated here directly.
try {
  const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
  process.loadEnvFile(path.join(repoRoot, ".env"));
} catch {
  // .env is optional locally; CI sets real env vars directly.
}

/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ["@wdza-stats/db"],
};

export default nextConfig;
