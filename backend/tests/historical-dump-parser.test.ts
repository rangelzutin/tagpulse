import { describe, it, expect } from "vitest";
import { Readable } from "stream";
import {
  streamLegacySqlDump,
  LegacySqlColumnCountMismatchError,
} from "../src/modules/historical/legacy-sql-parser.js";
import {
  validateHustlerTableColumns,
  HustlerSchemaValidationError,
  HUSTLER_TABLE_COLUMNS,
} from "../src/modules/historical/hustler/hustler-schema.js";

describe("HistoricalDumpParser (Streaming & Schema Validation)", () => {
  function createSyntheticSqlStream(lines: string[]): Readable {
    return Readable.from(lines.map((l) => l + "\n"));
  }

  it("successfully parses statements for supported tables and ignores comments and blank lines", async () => {
    const vendaCols = HUSTLER_TABLE_COLUMNS.venda.map((c) => `\`${c}\``).join(", ");
    // 22 values matching venda columns:
    const vendaRow1 = "(101, 1, 201, 1, 301, 1, '2020-01-15 14:30:00', 0, 0, '123', '456', 0, 0, 150.00, 150.00, 0, 'Venda Balcão', 0, 1, 1, 1, 'abc123hash')";
    const vendaRow2 = "(102, 1, 202, 1, 302, 1, '2020-01-15 15:00:00', 0, 0, '124', '457', 0, 0, 89.90, 89.90, 0, NULL, 0, 1, 1, 1, 'def456hash')";

    const sqlLines = [
      "-- MySQL dump 10.13",
      "/* Set options */;",
      "",
      `REPLACE INTO \`venda\` (${vendaCols}) VALUES ${vendaRow1}, ${vendaRow2};`,
      "",
      "-- Another table that is not in supported list",
      "REPLACE INTO `unsupported_log` (`id`, `msg`) VALUES (1, 'ignored log');",
    ];

    const capturedRows: Record<string, (string | null)[][]> = {};
    const supportedTables = new Set(["venda"]);

    const stats = await streamLegacySqlDump(createSyntheticSqlStream(sqlLines), {
      supportedTables,
      onStatement: (stmt) => {
        validateHustlerTableColumns(stmt.table as any, stmt.columns);
        capturedRows[stmt.table] = capturedRows[stmt.table] || [];
        capturedRows[stmt.table].push(...stmt.rows);
      },
    });

    expect(stats.statementsProcessed).toBe(2);
    expect(stats.tablesFound.has("venda")).toBe(true);
    expect(stats.tablesFound.has("unsupported_log")).toBe(true);
    expect(stats.supportedRowsCount.get("venda")).toBe(2);
    expect(stats.ignoredRowsCount.get("unsupported_log")).toBe(1);
    expect(stats.errorsCount).toBe(0);

    expect(capturedRows.venda).toHaveLength(2);
    expect(capturedRows.venda[0][0]).toBe("101");
    expect(capturedRows.venda[0][13]).toBe("150.00");
    expect(capturedRows.venda[1][0]).toBe("102");
    expect(capturedRows.venda[1][16]).toBe(null); // observacoes NULL
  });

  it("fails fast with LegacySqlColumnCountMismatchError when a row tuple has fewer or more values than declared columns", async () => {
    const sql = "REPLACE INTO `teste` (`col1`, `col2`, `col3`) VALUES ('a', 'b'), ('c', 'd', 'e');";

    await expect(
      streamLegacySqlDump(createSyntheticSqlStream([sql])),
    ).rejects.toThrow(LegacySqlColumnCountMismatchError);
  });

  it("fails fast with HustlerSchemaValidationError when table columns differ from contract", () => {
    // venda expects 22 columns
    const partialColumns = ["id", "id_empresa", "id_cliente"];
    expect(() => {
      validateHustlerTableColumns("venda", partialColumns);
    }).toThrow(HustlerSchemaValidationError);

    // column name mismatch
    const modifiedColumns = [...HUSTLER_TABLE_COLUMNS.venda];
    modifiedColumns[0] = "wrong_id_name";
    expect(() => {
      validateHustlerTableColumns("venda", modifiedColumns);
    }).toThrow(HustlerSchemaValidationError);
  });

  it("guarantees determinism and idempotency across multiple runs on identical input", async () => {
    const vendaCols = HUSTLER_TABLE_COLUMNS.venda.map((c) => `\`${c}\``).join(", ");
    const row = "(1, 1, 1, 1, 1, 1, '2020-01-01 00:00:00', 0, 0, NULL, NULL, 0, 0, 100, 100, 0, 'Test', 0, 1, 1, 1, 'h')";
    const sqlLines = [`REPLACE INTO \`venda\` (${vendaCols}) VALUES ${row};`];

    const run1Rows: (string | null)[][] = [];
    await streamLegacySqlDump(createSyntheticSqlStream(sqlLines), {
      onStatement: (stmt) => {
        run1Rows.push(...stmt.rows);
      },
    });

    const run2Rows: (string | null)[][] = [];
    await streamLegacySqlDump(createSyntheticSqlStream(sqlLines), {
      onStatement: (stmt) => {
        run2Rows.push(...stmt.rows);
      },
    });

    expect(run1Rows).toEqual(run2Rows);
    expect(JSON.stringify(run1Rows)).toBe(JSON.stringify(run2Rows));
  });
});
