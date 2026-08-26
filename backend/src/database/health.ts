import type { PrismaClient } from "@prisma/client";

export interface DatabaseHealthChecker {
  check(): Promise<void>;
}

export function createDatabaseHealthChecker(
  client: Pick<PrismaClient, "$queryRaw">,
): DatabaseHealthChecker {
  return {
    async check(): Promise<void> {
      await client.$queryRaw`SELECT 1`;
    },
  };
}
