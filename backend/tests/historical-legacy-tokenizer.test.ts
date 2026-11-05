import { describe, it, expect } from "vitest";
import { parseSqlValues } from "../src/modules/historical/legacy-sql-tokenizer.js";

describe("LegacySqlTokenizer", () => {
  it("parses simple tuples with integers, strings and NULLs", () => {
    const input = "(1, 'skate', NULL), (2, 'truck', 'independent')";
    const rows = parseSqlValues(input);

    expect(rows).toEqual([
      ["1", "skate", null],
      ["2", "truck", "independent"],
    ]);
  });

  it("handles commas, parentheses, and semicolons inside strings", () => {
    const input = "(10, 'Shape Maple, 8.0 (Imported); Pro Model', 150.00)";
    const rows = parseSqlValues(input);

    expect(rows).toEqual([
      ["10", "Shape Maple, 8.0 (Imported); Pro Model", "150.00"],
    ]);
  });

  it("handles escaped quotes with backslash (\\') and doubled single quotes ('')", () => {
    const input = "(1, 'Bob\\'s Skate Shop', 'O''Connor Deck')";
    const rows = parseSqlValues(input);

    expect(rows).toEqual([
      ["1", "Bob's Skate Shop", "O'Connor Deck"],
    ]);
  });

  it("handles standard MySQL backslash escape sequences", () => {
    const input = "(1, 'Line 1\\nLine 2\\r\\nTab\\tDone', 'Null\\0Byte\\ZEOF\\\\Backslash')";
    const rows = parseSqlValues(input);

    expect(rows).toEqual([
      ["1", "Line 1\nLine 2\r\nTab\tDone", "Null\0Byte\x1aEOF\\Backslash"],
    ]);
  });

  it("distinguishes unquoted NULL from quoted string 'NULL' and empty string ''", () => {
    const input = "(1, NULL, 'NULL', '', '  ')";
    const rows = parseSqlValues(input);

    expect(rows).toEqual([
      ["1", null, "NULL", "", "  "],
    ]);
  });

  it("handles numbers, decimals, negative values and zero", () => {
    const input = "(101, 0, -42.50, 9999.99, NULL)";
    const rows = parseSqlValues(input);

    expect(rows).toEqual([
      ["101", "0", "-42.50", "9999.99", null],
    ]);
  });

  it("preserves UTF-8 multi-byte characters and accents", () => {
    const input = "(1, 'São Paulo — Skateboards & Acessórios', 'Atenção: Não Molhar')";
    const rows = parseSqlValues(input);

    expect(rows).toEqual([
      ["1", "São Paulo — Skateboards & Acessórios", "Atenção: Não Molhar"],
    ]);
  });

  it("handles multiple row tuples with trailing and internal whitespace", () => {
    const input = `
      ( 1 , 'Alpha' , 10 ) ,
      ( 2 , 'Beta'  , 20 ) ,
      ( 3 , 'Gamma' , 30 )
    `;
    const rows = parseSqlValues(input);

    expect(rows).toEqual([
      ["1", "Alpha", "10"],
      ["2", "Beta", "20"],
      ["3", "Gamma", "30"],
    ]);
  });
});
