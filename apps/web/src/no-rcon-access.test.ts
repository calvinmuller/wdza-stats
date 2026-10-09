import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

// Enforces the ticket-03 requirement that the Web app never talks to the RCON
// API directly - it only ever reads Snapshots the Worker already wrote to
// Postgres. Since docs/adr/0011 an admin's form hands a Server's RCON token to
// the web app to store for the Worker, but the web app never reads one back,
// never holds one in its environment, and never imports the Worker's client.
function listSourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) return listSourceFiles(fullPath);
    return /\.(ts|tsx)$/.test(entry.name) ? [fullPath] : [];
  });
}

describe("apps/web RCON isolation", () => {
  it("never references RCON_TOKEN or the Worker's RCON client", () => {
    const srcDir = path.join(import.meta.dirname, "..");
    const offenders = listSourceFiles(srcDir)
      .filter((file) => !file.endsWith("no-rcon-access.test.ts"))
      .filter((file) => {
        const contents = readFileSync(file, "utf-8");
        return /RCON_TOKEN|rcon-client/.test(contents);
      });

    expect(offenders).toEqual([]);
  });
});
