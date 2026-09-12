import { fileURLToPath } from "node:url";

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
