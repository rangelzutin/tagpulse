import fs from "fs";
import zlib from "zlib";
import crypto from "crypto";
import path from "path";
import {
  streamLegacySqlDump,
  LegacyParsedStatement,
} from "../legacy-sql-parser.js";
import {
  HUSTLER_SUPPORTED_TABLES,
  HustlerSupportedTable,
  validateHustlerTableColumns,
} from "./hustler-schema.js";
import {
  HustlerDumpFileMetadata,
  HustlerDumpProfileSummary,
} from "./hustler-types.js";

export interface HustlerParseOptions {
  onStatement?: (
    table: HustlerSupportedTable,
    columns: string[],
    rows: (string | null)[][],
    statementIndex: number,
  ) => void | Promise<void>;
  collectRows?: boolean;
}

export interface HustlerDumpParseResult {
  summary: HustlerDumpProfileSummary;
  collectedRows?: Record<string, (string | null)[][]>;
}

export async function calculateDumpFileMetadata(
  filePath: string,
): Promise<HustlerDumpFileMetadata> {
  if (!fs.existsSync(filePath)) {
    throw new Error(`Dump file not found: ${filePath}`);
  }

  const stat = fs.statSync(filePath);
  const hash = crypto.createHash("sha256");

  await new Promise<void>((resolve, reject) => {
    const stream = fs.createReadStream(filePath);
    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("end", () => resolve());
    stream.on("error", (err) => reject(err));
  });

  const sha256 = hash.digest("hex");
  const sizeBytes = stat.size;
  const sizeMb = Number((sizeBytes / (1024 * 1024)).toFixed(2));

  return {
    filename: path.basename(filePath),
    filePath: path.resolve(filePath),
    sizeBytes,
    sizeMb,
    sha256,
  };
}

/**
 * Parses the Hustler MySQL legacy dump in full streaming mode.
 * Zero database connections required.
 */
export async function parseHustlerDump(
  dumpFilePath: string,
  options: HustlerParseOptions = {},
): Promise<HustlerDumpParseResult> {
  const metadata = await calculateDumpFileMetadata(dumpFilePath);
  const startTime = Date.now();

  const supportedSet = new Set<string>(HUSTLER_SUPPORTED_TABLES);
  const collectedRows: Record<string, (string | null)[][]> = {};

  if (options.collectRows) {
    for (const t of HUSTLER_SUPPORTED_TABLES) {
      collectedRows[t] = [];
    }
  }

  const fileStream = fs.createReadStream(dumpFilePath);
  const decompressStream = fileStream.pipe(zlib.createGunzip());

  const stats = await streamLegacySqlDump(decompressStream, {
    supportedTables: supportedSet,
    onStatement: async (stmt: LegacyParsedStatement) => {
      const table = stmt.table as HustlerSupportedTable;
      validateHustlerTableColumns(table, stmt.columns);

      if (options.collectRows && collectedRows[table]) {
        for (let i = 0; i < stmt.rows.length; i++) {
          const row = stmt.rows[i];
          if (row) {
            collectedRows[table]!.push(row);
          }
        }
      }

      if (options.onStatement) {
        await options.onStatement(
          table,
          stmt.columns,
          stmt.rows,
          stmt.statementIndex,
        );
      }
    },
  });

  const parseDurationMs = Date.now() - startTime;

  const rowsByTable: Record<string, number> = {};
  let totalSupportedRows = 0;
  for (const t of HUSTLER_SUPPORTED_TABLES) {
    const count = stats.supportedRowsCount.get(t) || 0;
    rowsByTable[t] = count;
    totalSupportedRows += count;
  }

  const ignoredRowsByTable: Record<string, number> = {};
  const ignoredStatementsByTable: Record<string, number> = {};
  let totalIgnoredRows = 0;

  for (const [table, count] of stats.ignoredRowsCount.entries()) {
    ignoredRowsByTable[table] = count;
    totalIgnoredRows += count;
    ignoredStatementsByTable[table] =
      stats.ignoredStatementsCount.get(table) || 0;
  }

  const summary: HustlerDumpProfileSummary = {
    metadata,
    parseDurationMs,
    tablesFoundCount: stats.tablesFound.size,
    allTablesFound: Array.from(stats.tablesFound).sort(),
    supportedTables: [...HUSTLER_SUPPORTED_TABLES],
    rowsByTable,
    ignoredRowsByTable,
    ignoredStatementsByTable,
    totalSupportedRows,
    totalIgnoredRows,
    totalRowsProcessed: totalSupportedRows + totalIgnoredRows,
    parseErrorsCount: stats.errorsCount,
  };

  const result: HustlerDumpParseResult = { summary };
  if (options.collectRows) {
    result.collectedRows = collectedRows;
  }
  return result;
}
