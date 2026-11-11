import fs from "fs";
import path from "path";
import dotenv from "dotenv";
import { PrismaClient, OperationUnit, SourceSystem } from "@prisma/client";
import {
  DEV_PROJECT_REF,
  PRODUCTION_PROJECT_REF,
  assertSafeDatabaseUrl,
} from "../modules/historical/hustler/hustler-financial-planner.js";

// Force load backend/.env.development
const envDevPath = path.resolve(process.cwd(), "backend/.env.development");
const fallbackEnvDevPath = path.resolve(process.cwd(), ".env.development");
const targetEnvPath = fs.existsSync(envDevPath) ? envDevPath : fallbackEnvDevPath;
if (fs.existsSync(targetEnvPath)) {
  dotenv.config({ path: targetEnvPath, override: true });
}

const dbUrl = process.env.DATABASE_URL || "";
const directUrl = process.env.DIRECT_URL || "";

assertSafeDatabaseUrl(dbUrl, directUrl);

const prisma = new PrismaClient();

export interface PreAuditResult {
  sales: {
    total: number;
    nullCount: number;
    hustlerCount: number;
    ninecloudsCount: number;
    otherCount: number;
  };
  ssds: {
    total: number;
    nullCount: number;
    hustlerCount: number;
    ninecloudsCount: number;
    otherCount: number;
    nullWithHustlerParent: number;
    nullWithNinecloudsParent: number;
  };
  financialRecords: {
    total: number;
    nullCount: number;
    hustlerCount: number;
    ninecloudsCount: number;
    otherCount: number;
  };
}

export async function auditOperationUnits(p: PrismaClient): Promise<PreAuditResult> {
  const salesCounts: any = await p.$queryRawUnsafe(`
    SELECT 
      COUNT(*)::int as total,
      COUNT(CASE WHEN operation_unit IS NULL THEN 1 END)::int as null_count,
      COUNT(CASE WHEN operation_unit = 'HUSTLER' THEN 1 END)::int as hustler_count,
      COUNT(CASE WHEN operation_unit = 'NINECLOUDS' THEN 1 END)::int as nineclouds_count,
      COUNT(CASE WHEN operation_unit NOT IN ('HUSTLER', 'NINECLOUDS') THEN 1 END)::int as other_count
    FROM sales
  `);

  const ssdsCounts: any = await p.$queryRawUnsafe(`
    SELECT 
      COUNT(*)::int as total,
      COUNT(CASE WHEN ssd.operation_unit IS NULL THEN 1 END)::int as null_count,
      COUNT(CASE WHEN ssd.operation_unit = 'HUSTLER' THEN 1 END)::int as hustler_count,
      COUNT(CASE WHEN ssd.operation_unit = 'NINECLOUDS' THEN 1 END)::int as nineclouds_count,
      COUNT(CASE WHEN ssd.operation_unit NOT IN ('HUSTLER', 'NINECLOUDS') THEN 1 END)::int as other_count,
      COUNT(CASE WHEN ssd.operation_unit IS NULL AND s.operation_unit = 'HUSTLER' THEN 1 END)::int as null_with_hustler_parent,
      COUNT(CASE WHEN ssd.operation_unit IS NULL AND (s.operation_unit IS NULL OR s.operation_unit = 'NINECLOUDS') THEN 1 END)::int as null_with_nineclouds_parent
    FROM sale_source_documents ssd
    JOIN sales s ON s.id = ssd.sale_id
  `);

  const finCounts: any = await p.$queryRawUnsafe(`
    SELECT 
      COUNT(*)::int as total,
      COUNT(CASE WHEN operation_unit IS NULL THEN 1 END)::int as null_count,
      COUNT(CASE WHEN operation_unit = 'HUSTLER' THEN 1 END)::int as hustler_count,
      COUNT(CASE WHEN operation_unit = 'NINECLOUDS' THEN 1 END)::int as nineclouds_count,
      COUNT(CASE WHEN operation_unit NOT IN ('HUSTLER', 'NINECLOUDS') THEN 1 END)::int as other_count
    FROM financial_records
  `);

  return {
    sales: {
      total: salesCounts[0].total,
      nullCount: salesCounts[0].null_count,
      hustlerCount: salesCounts[0].hustler_count,
      ninecloudsCount: salesCounts[0].nineclouds_count,
      otherCount: salesCounts[0].other_count,
    },
    ssds: {
      total: ssdsCounts[0].total,
      nullCount: ssdsCounts[0].null_count,
      hustlerCount: ssdsCounts[0].hustler_count,
      ninecloudsCount: ssdsCounts[0].nineclouds_count,
      otherCount: ssdsCounts[0].other_count,
      nullWithHustlerParent: ssdsCounts[0].null_with_hustler_parent,
      nullWithNinecloudsParent: ssdsCounts[0].null_with_nineclouds_parent,
    },
    financialRecords: {
      total: finCounts[0].total,
      nullCount: finCounts[0].null_count,
      hustlerCount: finCounts[0].hustler_count,
      ninecloudsCount: finCounts[0].nineclouds_count,
      otherCount: finCounts[0].other_count,
    },
  };
}

async function main() {
  const isPersist = process.argv.includes("--persist");

  console.log("==================================================");
  console.log("TAGPULSE — OPERATION UNIT NORMALIZATION");
  console.log("==================================================");
  console.log(`DEV Database Ref: ${DEV_PROJECT_REF}`);
  console.log(`Execution Mode:   ${isPersist ? "PERSIST (Writing to DEV)" : "DRY-RUN (Zero writes)"}`);
  console.log("");

  // 1. Audit Before
  console.log("--- 1. AUDIT BEFORE ---");
  const before = await auditOperationUnits(prisma);
  console.log("Sales:", before.sales);
  console.log("Sale Source Documents:", before.ssds);
  console.log("Financial Records:", before.financialRecords);
  console.log("");

  // Sample IDs of records to convert
  const sampleSales: any = await prisma.$queryRawUnsafe(`
    SELECT id, anchor_type, anchor_source_id, net_amount, commercial_date, source_system
    FROM sales
    WHERE operation_unit IS NULL
    ORDER BY commercial_date DESC
    LIMIT 5
  `);
  console.log("Sample Sales to convert to NINECLOUDS (5 of " + before.sales.nullCount + "):");
  console.table(sampleSales);

  const sampleSsdsHustler: any = await prisma.$queryRawUnsafe(`
    SELECT ssd.id, ssd.doc_type, ssd.source_id, ssd.net_amount, ssd.realized_date, s.operation_unit as parent_op_unit
    FROM sale_source_documents ssd
    JOIN sales s ON s.id = ssd.sale_id
    WHERE ssd.operation_unit IS NULL AND s.operation_unit = 'HUSTLER'
  `);
  console.log("All 9 Hustler SSDs to convert to HUSTLER:");
  console.table(sampleSsdsHustler);

  const sampleSsdsNc: any = await prisma.$queryRawUnsafe(`
    SELECT ssd.id, ssd.doc_type, ssd.source_id, ssd.net_amount, ssd.realized_date, s.operation_unit as parent_op_unit
    FROM sale_source_documents ssd
    JOIN sales s ON s.id = ssd.sale_id
    WHERE ssd.operation_unit IS NULL AND (s.operation_unit IS NULL OR s.operation_unit = 'NINECLOUDS')
    ORDER BY ssd.realized_date DESC
    LIMIT 5
  `);
  console.log("Sample SSDs to convert to NINECLOUDS (5 of " + before.ssds.nullWithNinecloudsParent + "):");
  console.table(sampleSsdsNc);

  const sampleFin: any = await prisma.$queryRawUnsafe(`
    SELECT id, type, original_amount, due_date, source_system
    FROM financial_records
    WHERE operation_unit IS NULL
    ORDER BY due_date DESC
    LIMIT 5
  `);
  console.log("Sample Financial Records to convert to NINECLOUDS (5 of " + before.financialRecords.nullCount + "):");
  console.table(sampleFin);

  if (!isPersist) {
    console.log("\n[DRY-RUN COMPLETE] No writes performed. Re-run with --persist to execute.");
    return;
  }

  // 2. Execute Backfill in a transaction
  console.log("\n--- 2. EXECUTING BACKFILL IN DEV ---");
  await prisma.$transaction(async (tx) => {
    // A. 9 Hustler SSDs
    const hustlerSsdUpdated: any = await tx.$executeRawUnsafe(`
      UPDATE sale_source_documents ssd
      SET operation_unit = 'HUSTLER', updated_at = NOW()
      FROM sales s
      WHERE ssd.sale_id = s.id
        AND s.operation_unit = 'HUSTLER'
        AND ssd.operation_unit IS NULL
    `);
    console.log(`Updated Hustler SSDs: ${hustlerSsdUpdated}`);

    // B. Remaining SSDs to NINECLOUDS
    const ncSsdUpdated: any = await tx.$executeRawUnsafe(`
      UPDATE sale_source_documents
      SET operation_unit = 'NINECLOUDS', updated_at = NOW()
      WHERE operation_unit IS NULL
    `);
    console.log(`Updated Nineclouds SSDs: ${ncSsdUpdated}`);

    // C. Sales to NINECLOUDS
    const ncSalesUpdated: any = await tx.$executeRawUnsafe(`
      UPDATE sales
      SET operation_unit = 'NINECLOUDS', updated_at = NOW()
      WHERE operation_unit IS NULL
    `);
    console.log(`Updated Nineclouds Sales: ${ncSalesUpdated}`);

    // D. Financial records to NINECLOUDS
    const ncFinUpdated: any = await tx.$executeRawUnsafe(`
      UPDATE financial_records
      SET operation_unit = 'NINECLOUDS', updated_at = NOW()
      WHERE operation_unit IS NULL
    `);
    console.log(`Updated Nineclouds Financial Records: ${ncFinUpdated}`);
  });

  // 3. Post-Validation
  console.log("\n--- 3. POST-VALIDATION AUDIT ---");
  const after = await auditOperationUnits(prisma);
  console.log("Sales:", after.sales);
  console.log("Sale Source Documents:", after.ssds);
  console.log("Financial Records:", after.financialRecords);

  if (after.sales.nullCount !== 0 || after.ssds.nullCount !== 0 || after.financialRecords.nullCount !== 0) {
    throw new Error("POST-VALIDATION FAILED: Residual NULL operation_units detected!");
  }

  console.log("\n[SUCCESS] Operation unit normalization successfully committed to DEV!");
}

main()
  .catch((e) => {
    console.error("FATAL ERROR:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
