import "dotenv/config";
import type { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  CONNECTION_NAME,
  ensureTagPlusConnection,
} from "../../src/scripts/ensure-tagplus-connection.js";
import { createTestPrismaClient } from "../helpers/test-prisma.js";

describe.sequential(
  "TagPlus connection bootstrap on isolated PostgreSQL",
  () => {
    let prisma: PrismaClient;
    let companyId: string;
    const slug = `gate-e1b-synthetic-${process.pid}-${Date.now()}`;

    beforeAll(async () => {
      prisma = createTestPrismaClient();
      const company = await prisma.company.create({
        data: { name: "Gate E1B Synthetic", slug },
      });
      companyId = company.id;
    });

    afterAll(async () => {
      if (prisma) {
        await prisma.tagPlusConnection.deleteMany({ where: { companyId } });
        await prisma.company.delete({ where: { id: companyId } });
        await prisma.$disconnect();
      }
    });

    it("creates once and reuses the same connection", async () => {
      const first = await ensureTagPlusConnection(prisma, companyId);
      const second = await ensureTagPlusConnection(prisma, companyId);
      expect(second.id).toBe(first.id);
      expect(
        await prisma.tagPlusConnection.count({
          where: { companyId, name: CONNECTION_NAME },
        }),
      ).toBe(1);
    });
  },
);
