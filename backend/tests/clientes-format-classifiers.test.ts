import { describe, expect, it } from "vitest";
import {
  classifyCnpj,
  classifyCpf,
  classifyDate,
  classifyEmail,
  classifyPhone,
} from "../src/integrations/tagplus/inspection/clientes-format-classifiers.js";
import {
  CHARACTERIZATION_PATHS,
  DEFERRED_PATHS,
} from "../src/integrations/tagplus/inspection/clientes-characterization-scope.js";

describe("clientes privacy-safe format classifiers", () => {
  it("keeps the adjusted 67-path scope explicit, unique, and separate from deferred paths", () => {
    expect(CHARACTERIZATION_PATHS).toHaveLength(67);
    expect(new Set(CHARACTERIZATION_PATHS).size).toBe(67);
    expect(
      CHARACTERIZATION_PATHS.filter((path) =>
        (DEFERRED_PATHS as readonly string[]).includes(path),
      ),
    ).toEqual([]);
  });

  it("classifies documents by syntax without validating digits", () => {
    expect(classifyCpf("111.111.111-11")).toBe("CPF_STANDARD_PUNCTUATED");
    expect(classifyCpf("11111111111")).toBe("CPF_DIGITS_ONLY");
    expect(classifyCpf("CPF_CANARY")).toBe("OTHER");
    expect(classifyCnpj("11.111.111/1111-11")).toBe("CNPJ_STANDARD_PUNCTUATED");
    expect(classifyCnpj("11111111111111")).toBe("CNPJ_DIGITS_ONLY");
    expect(classifyCnpj("CNPJ_CANARY")).toBe("OTHER");
    expect(classifyCpf("  ")).toBe("EMPTY");
    expect(classifyCnpj(null)).toBe("OTHER_TYPE");
  });

  it("classifies email and phone without returning fragments", () => {
    expect(classifyEmail("person@example.invalid")).toBe("EMAIL_LIKE");
    expect(classifyEmail("not-an-email")).toBe("NON_EMAIL_STRING");
    expect(classifyEmail(1)).toBe("OTHER_TYPE");
    expect(classifyPhone("11999999999")).toBe("PHONE_DIGITS_ONLY");
    expect(classifyPhone("(11) 99999-9999")).toBe("PHONE_FORMATTED");
    expect(classifyPhone("PHONE_CANARY")).toBe("PHONE_OTHER");
    expect(classifyPhone(" ")).toBe("EMPTY");
  });

  it("distinguishes date-only and datetimes with or without timezone", () => {
    expect(classifyDate("2026-08-28")).toBe("DATE_ONLY");
    expect(classifyDate("2026-08-28T12:34:56Z")).toBe("DATETIME_WITH_TIMEZONE");
    expect(classifyDate("2026-08-28T12:34:56-03:00")).toBe(
      "DATETIME_WITH_TIMEZONE",
    );
    expect(classifyDate("2026-08-28T12:34:56")).toBe(
      "DATETIME_WITHOUT_TIMEZONE",
    );
    expect(classifyDate("2026-99-99")).toBe("INVALID_OR_UNCLASSIFIED");
    expect(classifyDate(1)).toBe("OTHER_TYPE");
  });
});
