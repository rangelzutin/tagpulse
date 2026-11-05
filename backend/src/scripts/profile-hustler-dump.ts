import path from "path";
import { parseHustlerDump } from "../modules/historical/hustler/hustler-parser.js";
import {
  HUSTLER_TABLE_COLUMNS,
  HustlerSupportedTable,
} from "../modules/historical/hustler/hustler-schema.js";

async function main() {
  const defaultPath = "C:\\Users\\range\\Workspace\\stratix\\data\\hustlerskateshop.sql.gz";
  const dumpPath = process.argv[2] ? path.resolve(process.argv[2]) : defaultPath;

  console.log("==================================================");
  console.log("TAGPULSE — HISTORICAL IMPORT HUSTLER PROFILER");
  console.log("==================================================");
  console.log(`Target dump: ${dumpPath}`);

  const startMem = process.memoryUsage();
  const startTime = Date.now();

  try {
    const { summary } = await parseHustlerDump(dumpPath);
    const endTime = Date.now();
    const endMem = process.memoryUsage();

    const formatBytes = (bytes: number) => `${(bytes / (1024 * 1024)).toFixed(2)} MB`;

    console.log("\n---------------- DUMP FILE METADATA ----------------");
    console.log(`File Name:       ${summary.metadata.filename}`);
    console.log(`File Path:       ${summary.metadata.filePath}`);
    console.log(`File Size:       ${summary.metadata.sizeBytes.toLocaleString()} bytes (${summary.metadata.sizeMb} MB)`);
    console.log(`SHA-256:         ${summary.metadata.sha256}`);

    console.log("\n---------------- EXECUTION PERFORMANCE -------------");
    console.log(`Duration:        ${(summary.parseDurationMs / 1000).toFixed(2)} s (${summary.parseDurationMs} ms)`);
    console.log(`Initial Heap:    ${formatBytes(startMem.heapUsed)} (RSS: ${formatBytes(startMem.rss)})`);
    console.log(`Final Heap:      ${formatBytes(endMem.heapUsed)} (RSS: ${formatBytes(endMem.rss)})`);
    console.log(`Heap Delta:      ${formatBytes(endMem.heapUsed - startMem.heapUsed)}`);

    console.log("\n---------------- SUPPORTED TABLES ------------------");
    console.log(
      `${"Table Name".padEnd(28)} | ${"Columns".padStart(8)} | ${"Rows".padStart(10)}`
    );
    console.log("-".repeat(52));

    for (const tableName of summary.supportedTables as HustlerSupportedTable[]) {
      const colCount = HUSTLER_TABLE_COLUMNS[tableName]?.length ?? 0;
      const rowCount = summary.rowsByTable[tableName] ?? 0;
      console.log(
        `${tableName.padEnd(28)} | ${String(colCount).padStart(8)} | ${rowCount.toLocaleString().padStart(10)}`
      );
    }
    console.log("-".repeat(52));
    console.log(
      `${"TOTAL SUPPORTED ROWS".padEnd(28)} | ${"".padStart(8)} | ${summary.totalSupportedRows.toLocaleString().padStart(10)}`
    );

    console.log("\n---------------- DUMP TOTALS -----------------------");
    console.log(`Total Tables in Dump:      ${summary.tablesFoundCount}`);
    console.log(`Supported Tables:          ${summary.supportedTables.length}`);
    console.log(`Ignored Tables:            ${summary.tablesFoundCount - summary.supportedTables.length}`);
    console.log(`Ignored Rows:              ${summary.totalIgnoredRows.toLocaleString()}`);
    console.log(`Total Rows in Dump:        ${summary.totalRowsProcessed.toLocaleString()}`);
    console.log(`Parse Errors:              ${summary.parseErrorsCount}`);
    console.log("==================================================\n");
  } catch (err) {
    console.error("Profiling failed:", err);
    process.exit(1);
  }
}

main();
