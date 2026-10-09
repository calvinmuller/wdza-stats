import { createDb, servers, type Database } from "@wdza-stats/db";
import { afterAll, afterEach, describe, expect, it } from "vitest";
import { bootstrapEnvServer } from "./heartbeat";

const db: Database = createDb(process.env.DATABASE_URL!);

afterEach(async () => {
  await db.delete(servers);
});

afterAll(async () => {
  await db.$client.end();
});

const ENV_SERVER = { name: "WDZA Test", baseUrl: "http://rcon.test:9006", rconToken: "env-token" };

describe("bootstrapEnvServer", () => {
  it("creates the env-configured Server, with its RCON token, when it has no row", async () => {
    const result = await bootstrapEnvServer(db, ENV_SERVER);

    expect(result).toMatchObject({ name: "WDZA Test", baseUrl: "http://rcon.test:9006", rconToken: "env-token" });
  });

  it("gives an existing row the env's RCON token when it has none", async () => {
    await db.insert(servers).values({ name: "Renamed", baseUrl: ENV_SERVER.baseUrl });

    const result = await bootstrapEnvServer(db, ENV_SERVER);

    expect(result).toMatchObject({ name: "Renamed", rconToken: "env-token" });
  });

  it("keeps the name and token an admin already set", async () => {
    await db
      .insert(servers)
      .values({ name: "Renamed", baseUrl: ENV_SERVER.baseUrl, rconToken: "admin-token" });

    const result = await bootstrapEnvServer(db, ENV_SERVER);

    expect(result).toMatchObject({ name: "Renamed", rconToken: "admin-token" });
  });
});
