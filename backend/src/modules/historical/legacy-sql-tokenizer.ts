/**
 * Tokenizer for MySQL dump values tuples.
 * Correctly handles:
 * - single quotes '...'
 * - escaped quotes (\' and '')
 * - backslash escapes (\\, \n, \r, \t, \0, \Z, \b, \', \")
 * - commas, parentheses, semicolons inside strings
 * - NULL keyword -> null
 * - empty strings '' -> "" (preserves empty string when quoted)
 * - unquoted numbers and identifiers
 * - multiple row tuples per statement: (1, 'a'), (2, 'b')
 */

export function parseSqlValues(valuesStr: string): (string | null)[][] {
  const rows: (string | null)[][] = [];
  let currentRow: (string | null)[] = [];
  let currentVal = "";
  let inString = false;
  let inTuple = false;
  let escape = false;
  let wasQuoted = false;

  const len = valuesStr.length;

  for (let i = 0; i < len; i++) {
    const c = valuesStr[i];

    if (inString) {
      if (escape) {
        switch (c) {
          case "0":
            currentVal += "\0";
            break;
          case "b":
            currentVal += "\b";
            break;
          case "n":
            currentVal += "\n";
            break;
          case "r":
            currentVal += "\r";
            break;
          case "t":
            currentVal += "\t";
            break;
          case "Z":
            currentVal += "\x1a";
            break;
          case "'":
            currentVal += "'";
            break;
          case '"':
            currentVal += '"';
            break;
          case "\\":
            currentVal += "\\";
            break;
          default:
            currentVal += c;
            break;
        }
        escape = false;
      } else if (c === "\\") {
        escape = true;
      } else if (c === "'") {
        // Check for doubled single quote: ''
        if (i + 1 < len && valuesStr[i + 1] === "'") {
          currentVal += "'";
          i++; // Skip next quote
        } else {
          inString = false;
        }
      } else {
        currentVal += c;
      }
      continue;
    }

    // Outside string
    if (c === "'") {
      inString = true;
      wasQuoted = true;
      continue;
    }

    if (c === "(") {
      if (!inTuple) {
        inTuple = true;
        currentRow = [];
        currentVal = "";
        wasQuoted = false;
      } else {
        currentVal += c;
      }
      continue;
    }

    if (c === ")") {
      if (inTuple) {
        if (wasQuoted) {
          currentRow.push(currentVal);
        } else {
          const trimmed = currentVal.trim();
          currentRow.push(trimmed === "" || trimmed.toUpperCase() === "NULL" ? null : trimmed);
        }
        rows.push(currentRow);
        currentRow = [];
        currentVal = "";
        wasQuoted = false;
        inTuple = false;
      }
      continue;
    }

    if (c === ",") {
      if (inTuple) {
        if (wasQuoted) {
          currentRow.push(currentVal);
        } else {
          const trimmed = currentVal.trim();
          currentRow.push(trimmed === "" || trimmed.toUpperCase() === "NULL" ? null : trimmed);
        }
        currentVal = "";
        wasQuoted = false;
      }
      continue;
    }

    if (c === " " || c === "\t" || c === "\r" || c === "\n") {
      // Ignore whitespace outside quotes
      continue;
    }

    currentVal += c;
  }

  return rows;
}
