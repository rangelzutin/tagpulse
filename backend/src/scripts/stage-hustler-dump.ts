import fs from "fs";
import path from "path";
import dotenv from "dotenv";
import { PrismaClient } from "@prisma/client";
import { stageHustlerDump } from "../modules/historical/hustler/hustler-staging.js";

// 1. Force Load backend/.env.development
const envDevPath = path.resolve(process.cwd(), "backend/.env.development");
const fallbackEnvDevPath = path.resolve(process.cwd(), ".env.development");
const targetEnvPath = fs.existsSync(envDevPath) ? envDevPath : fallbackEnvDevPath;

if (fs.existsSync(targetEnvPath)) {
  dotenv.config({ path: targetEnvPath, override: true });
}

// 2. Strict Production Guard
const dbUrl = process.env.DATABASE_URL || "";
const directUrl = process.env.DIRECT_URL || "";

if (
  dbUrl.includes("szahricoqxzckjytpnmg") ||
  directUrl.includes("szahricoqxzckjytpnmg")
) {
  console.error(
    "\n[FATAL GUARDRAIL] Production database 'szahricoqxzckjytpnmg' detected! Staging is strictly forbidden on production.",
  );
  process.exit(1);
}

if (!dbUrl.includes("pkjdzlfxsxulfkzksrow")) {
  console.error(
    "\n[FATAL GUARDRAIL] DATABASE_URL does not point to tagpulse-historical-dev ('pkjdzlfxsxulfkzksrow'). Aborting.",
  );
  process.exit(1);
}

// 3. Resolve Dump File Path
const candidatePaths = [
  process.argv[2],
  "D:\\NINECLOUDS\\BANCO DE DADOS\\hustlerskateshop.sql.gz",
  "C:\\Users\\range\\Workspace\\stratix\\data\\hustlerskateshop.sql.gz",
  "C:\\Users\\RANGEL\\Workspace\\stratix\\data\\hustlerskateshop.sql.gz",
].filter((p): p is string => Boolean(p && fs.existsSync(p)));

const dumpPath = candidatePaths[0];
if (!dumpPath) {
  console.error(
    "\n[FATAL] Hustler dump file not found! Provide valid path as argument or place dump in candidate locations.",
  );
  process.exit(1);
}
const validDumpPath: string = dumpPath;

async function main() {
  console.log("==================================================");
  console.log("TAGPULSE — HISTORICAL IMPORT HUSTLER STAGING (4C)");
  console.log("==================================================");
  console.log(`Database Target: tagpulse-historical-dev (pkjdzlfxsxulfkzksrow)`);
  console.log(`Target Dump:     ${validDumpPath}\n`);

  const prisma = new PrismaClient({
    datasources: {
      db: {
        url: dbUrl,
      },
    },
  });

  try {
    let lastReport = 0;
    const result = await stageHustlerDump({
      prisma,
      dumpFilePath: validDumpPath,
      chunkSize: 1000,
      onProgress: (inserted, total) => {
        const pct = ((inserted / total) * 100).toFixed(1);
        if (inserted - lastReport >= 5000 || inserted === total) {
          console.log(`Progress: ${inserted.toLocaleString()} / ${total.toLocaleString()} rows (${pct}%)`);
          lastReport = inserted;
        }
      },
    });

    console.log("\n---------------- STAGING EXECUTION SUMMARY ----------------");
    console.log(`Batch ID:             ${result.batchId}`);
    console.log(`Company:              ${result.companyName} (${result.companyId})`);
    console.log(`Source System:        ${result.sourceSystem}`);
    console.log(`Dump File:            ${result.filename}`);
    console.log(`Dump SHA-256:         ${result.checksumSha256}`);
    console.log(`Status:               ${result.status}`);
    console.log(`Idempotent Re-use:    ${result.isIdempotentReuse ? "YES (NOOP)" : "NO (Fresh Import)"}`);
    console.log(`Rows Inserted (Run):  ${result.totalRowsInserted.toLocaleString()}`);
    console.log(`Total Staged in DB:   ${result.totalStagedRows.toLocaleString()}`);
    console.log(`Duplicate Legacy PKs: ${result.duplicateLegacyPksCount}`);
    console.log(`Duplicate Row Hashes: ${result.duplicateRowHashesCount}`);
    console.log(`Duration:             ${(result.stagingDurationMs / 1000).toFixed(2)}s`);

    console.log("\n---------------- STAGED ROWS BY TABLE ---------------------");
    for (const [table, count] of Object.entries(result.rowsByTable)) {
      console.log(`${table.padEnd(26)} : ${count.toLocaleString().padStart(8)} rows`);
    }
    console.log("-----------------------------------------------------------");
    console.log(`TOTAL SUPPORTED ROWS       : ${result.totalStagedRows.toLocaleString().padStart(8)} rows`);
    console.log("===========================================================\n");
  } catch (err: any) {
    console.error("\n[STAGING FAILED]:", err.message);
    if (err.stack) console.error(err.stack);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();
