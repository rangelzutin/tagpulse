import readline from "readline";
import { Readable } from "stream";
import { parseSqlValues } from "./legacy-sql-tokenizer.js";

export class LegacySqlColumnCountMismatchError extends Error {
  public readonly table: string;
  public readonly statementIndex: number;
  public readonly rowIndex: number;
  public readonly expectedColumns: number;
  public readonly actualColumns: number;

  constructor(details: {
    table: string;
    statementIndex: number;
    rowIndex: number;
    expectedColumns: number;
    actualColumns: number;
  }) {
    super(
      `Column count mismatch in table '${details.table}' (stmt ${details.statementIndex}, row ${details.rowIndex}): expected ${details.expectedColumns} columns, got ${details.actualColumns}`,
    );
    this.name = "LegacySqlColumnCountMismatchError";
    this.table = details.table;
    this.statementIndex = details.statementIndex;
    this.rowIndex = details.rowIndex;
    this.expectedColumns = details.expectedColumns;
    this.actualColumns = details.actualColumns;
  }
}

export interface LegacyParsedStatement {
  table: string;
  columns: string[];
  rows: (string | null)[][];
  statementIndex: number;
}

export interface StreamSqlDumpOptions {
  onStatement?: (stmt: LegacyParsedStatement) => void | Promise<void>;
  supportedTables?: Set<string>;
}

export interface StreamSqlDumpStats {
  statementsProcessed: number;
  tablesFound: Set<string>;
  supportedRowsCount: Map<string, number>;
  ignoredRowsCount: Map<string, number>;
  ignoredStatementsCount: Map<string, number>;
  errorsCount: number;
}

/**
 * Streams and tokenizes a decompressed MySQL dump, parsing REPLACE INTO statements.
 * Validates column counts deterministically.
 */
export async function streamLegacySqlDump(
  decompressedStream: Readable,
  options: StreamSqlDumpOptions = {},
): Promise<StreamSqlDumpStats> {
  const rl = readline.createInterface({
    input: decompressedStream,
    crlfDelay: Infinity,
  });

  const stats: StreamSqlDumpStats = {
    statementsProcessed: 0,
    tablesFound: new Set<string>(),
    supportedRowsCount: new Map<string, number>(),
    ignoredRowsCount: new Map<string, number>(),
    ignoredStatementsCount: new Map<string, number>(),
    errorsCount: 0,
  };

  let accumulator = "";
  let statementIndex = 0;

  for await (const line of rl) {
    const trimmed = line.trim();
    if (
      !trimmed ||
      trimmed.startsWith("--") ||
      trimmed.startsWith("/*") ||
      trimmed.startsWith("#")
    ) {
      continue;
    }

    accumulator += (accumulator ? "\n" : "") + line;

    if (trimmed.endsWith(";")) {
      const stmt = accumulator.trim();
      accumulator = "";

      const match = stmt.match(
        /^(?:REPLACE|INSERT)\s+INTO\s+`([^`]+)`\s*\(([^)]+)\)\s*VALUES\s*([\s\S]+);$/i,
      );
      if (!match || !match[1] || !match[2] || !match[3]) {
        continue;
      }

      statementIndex++;
      stats.statementsProcessed++;

      const table = match[1];
      const colsRaw = match[2];
      const valuesStr = match[3];

      stats.tablesFound.add(table);

      const isSupported =
        !options.supportedTables || options.supportedTables.has(table);

      const cols = colsRaw
        .split(",")
        .map((c) => c.trim().replace(/`/g, ""));

      const rows = parseSqlValues(valuesStr);

      // Validate column count across all parsed rows
      for (let r = 0; r < rows.length; r++) {
        const row = rows[r];
        if (!row || row.length !== cols.length) {
          stats.errorsCount++;
          throw new LegacySqlColumnCountMismatchError({
            table,
            statementIndex,
            rowIndex: r,
            expectedColumns: cols.length,
            actualColumns: row ? row.length : 0,
          });
        }
      }

      if (isSupported) {
        const currentCount = stats.supportedRowsCount.get(table) || 0;
        stats.supportedRowsCount.set(table, currentCount + rows.length);

        if (options.onStatement) {
          await options.onStatement({
            table,
            columns: cols,
            rows,
            statementIndex,
          });
        }
      } else {
        const currentIgnoredRows = stats.ignoredRowsCount.get(table) || 0;
        stats.ignoredRowsCount.set(table, currentIgnoredRows + rows.length);

        const currentIgnoredStmts = stats.ignoredStatementsCount.get(table) || 0;
        stats.ignoredStatementsCount.set(table, currentIgnoredStmts + 1);
      }
    }
  }

  return stats;
}
