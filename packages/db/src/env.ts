import path from "node:path";
import { fileURLToPath } from "node:url";

// This file lives at packages/db/src/env.ts, so the repo root is three
// directories up regardless of the caller's cwd (npm workspace scripts run
// with cwd set to the workspace dir, e.g. apps/worker, not the repo root).
const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");

// Loads the repo-root .env into process.env, mirroring the convention used by
// vitest.setup.ts. Safe to call from any workspace and safe to call more than
// once; missing .env (e.g. in CI, which sets real env vars) is not an error.
export function loadRootEnv() {
  try {
    process.loadEnvFile(path.join(REPO_ROOT, ".env"));
  } catch {
    // .env is optional locally; CI sets real env vars directly.
  }
}

export function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

// Runs `fn` only when the file that called this is executed directly (not imported).
export function runIfMain(moduleUrl: string, fn: () => Promise<void>) {
  const isMain = process.argv[1] === fileURLToPath(moduleUrl);
  if (isMain) {
    fn().catch((error) => {
      console.error(error);
      process.exitCode = 1;
    });
  }
}
