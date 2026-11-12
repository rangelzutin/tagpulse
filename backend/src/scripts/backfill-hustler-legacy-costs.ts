import { PrismaClient } from "@prisma/client";
import dotenv from "dotenv";
import path from "path";

import fs from "fs";

const envPath = fs.existsSync(path.resolve(process.cwd(), ".env.development"))
  ? path.resolve(process.cwd(), ".env.development")
  : path.resolve(process.cwd(), "backend/.env.development");
dotenv.config({ path: envPath, override: true });

const dbUrl = process.env.DATABASE_URL || "";
if (!dbUrl.includes("pkjdzlfxsxulfkzksrow")) {
  console.error("SAFETY BLOCK: Only DEV database (pkjdzlfxsxulfkzksrow) is allowed.");
  process.exit(1);
}

const prisma = new PrismaClient({
  datasources: {
    db: { url: dbUrl },
  },
});

async function main() {
  const apply = process.argv.includes("--apply");
  console.log(`=== BACKFILL HUSTLER LEGACY EFFECTIVE COST (Mode: ${apply ? "APPLY" : "DRY-RUN PREVIEW"}) ===`);

  // Find all 2026 sale items with HUSTLER_LEGACY products where effectiveCost IS NULL
  const saleItems2026 = await prisma.saleItem.findMany({
    where: {
      sale: {
        commercialDate: {
          gte: new Date("2026-01-01T00:00:00.000Z"),
        },
      },
      sourceProductId: { startsWith: "HUSTLER_LEGACY:" },
    },
    include: {
      product: true,
    },
  });

  const targetProductsMap = new Map<
    string,
    {
      id: string;
      sourceId: string;
      description: string | null;
      currentEffectiveCost: number | null;
    }
  >();

  for (const item of saleItems2026) {
    if (item.product && item.product.effectiveCost === null) {
      targetProductsMap.set(item.product.sourceId, {
        id: item.product.id,
        sourceId: item.product.sourceId,
        description: item.product.description,
        currentEffectiveCost: null,
      });
    }
  }

  const candidates = Array.from(targetProductsMap.values());
  console.log(`Found ${candidates.length} distinct HUSTLER_LEGACY products in 2026 with effectiveCost IS NULL.\n`);

  const previewRows: Array<{
    productId: string;
    sourceId: string;
    description: string;
    currentEffectiveCost: number | null;
    stagingCustoUtilizado: number | null;
    proposedEffectiveCost: number;
  }> = [];

  for (const prod of candidates) {
    const rawId = prod.sourceId.replace("HUSTLER_LEGACY:", "");
    const stagingRow = await prisma.historicalStagingRow.findFirst({
      where: {
        sourceTable: "produto_base",
        sourcePrimaryKey: rawId,
      },
    });

    const payload = (stagingRow?.payload ?? {}) as Record<string, unknown>;
    const rawCusto = payload["custo_utilizado"];
    const parsedCusto =
      rawCusto !== null && rawCusto !== undefined && String(rawCusto).trim() !== ""
        ? parseFloat(String(rawCusto))
        : NaN;

    if (!isNaN(parsedCusto) && parsedCusto > 0) {
      previewRows.push({
        productId: prod.id,
        sourceId: prod.sourceId,
        description: prod.description || "",
        currentEffectiveCost: prod.currentEffectiveCost,
        stagingCustoUtilizado: parsedCusto,
        proposedEffectiveCost: parsedCusto,
      });
    }
  }

  console.log("PRODUCT_ID | SOURCE_ID | DESCRIPTION | CURRENT_EFFECTIVE_COST | STAGING_CUSTO_UTILIZADO | PROPOSED_EFFECTIVE_COST");
  for (const row of previewRows) {
    console.log(
      `${row.productId} | ${row.sourceId} | ${row.description} | ${row.currentEffectiveCost} | ${row.stagingCustoUtilizado} | ${row.proposedEffectiveCost}`
    );
  }

  console.log(`\nPREVIEW_COUNT: ${previewRows.length}`);

  if (previewRows.length !== 33 && !apply) {
    console.warn(`WARNING: Expected 33 products, found ${previewRows.length}`);
  }

  if (apply) {
    let updatedCount = 0;
    for (const row of previewRows) {
      await prisma.product.update({
        where: { id: row.productId },
        data: {
          effectiveCost: row.proposedEffectiveCost,
        },
      });
      updatedCount++;
    }
    console.log(`UPDATED_PRODUCTS: ${updatedCount}`);
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
