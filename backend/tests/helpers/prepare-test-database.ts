import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { getTestDatabaseUrl } from "./test-prisma.js";

const testDatabaseUrl = getTestDatabaseUrl();
const prismaCli = fileURLToPath(
  new URL("../../../node_modules/prisma/build/index.js", import.meta.url),
);
const schema = fileURLToPath(
  new URL("../../prisma/schema.prisma", import.meta.url),
);
const result = spawnSync(
  process.execPath,
  [prismaCli, "migrate", "deploy", "--schema", schema],
  {
    env: {
      ...process.env,
      DATABASE_URL: testDatabaseUrl,
      DIRECT_URL: testDatabaseUrl,
    },
    stdio: "inherit",
  },
);

if (result.error) {
  throw new Error("Test database migration process could not be started");
}
if (result.status !== 0) {
  throw new Error("Test database migrations failed");
}
