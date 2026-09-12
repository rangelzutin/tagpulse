import { describe, expect, it } from "vitest";
import {
  formatTagPlusDateSaoPaulo,
  truncateToSeconds,
} from "../src/integrations/tagplus/tagplus-date-formatter.js";

describe("TagPlus date formatter utilities", () => {
  it("truncates milliseconds to zero", () => {
    const original = new Date("2026-09-12T19:55:22.847Z");
    const truncated = truncateToSeconds(original);
    expect(truncated.toISOString()).toBe("2026-09-12T19:55:22.000Z");
    expect(truncated.getMilliseconds()).toBe(0);
  });

  it("converts UTC Date to America/Sao_Paulo YYYY-MM-DD HH:mm:ss string", () => {
    // 2026-09-12T19:55:22.000Z is 16:55:22 in Sao Paulo (UTC-3)
    const date = new Date("2026-09-12T19:55:22.000Z");
    const formatted = formatTagPlusDateSaoPaulo(date);
    expect(formatted).toBe("2026-09-12 16:55:22");
  });

  it("handles midnight and day boundary transitions correctly", () => {
    // 2026-09-12T01:30:00.000Z is 2026-09-11 22:30:00 in Sao Paulo
    const date = new Date("2026-09-12T01:30:00.000Z");
    const formatted = formatTagPlusDateSaoPaulo(date);
    expect(formatted).toBe("2026-09-11 22:30:00");
  });

  it("handles month and year boundary transitions correctly", () => {
    // 2026-01-01T02:00:00.000Z is 2025-12-31 23:00:00 in Sao Paulo
    const date = new Date("2026-01-01T02:00:00.000Z");
    const formatted = formatTagPlusDateSaoPaulo(date);
    expect(formatted).toBe("2025-12-31 23:00:00");
  });
});
