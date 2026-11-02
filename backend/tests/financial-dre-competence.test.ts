import { describe, expect, it } from "vitest";
import {
  getMonthStr,
  getPreviousMonthStr,
  resolveDasCompetence,
  resolveGpsCompetence,
  resolveIcmsCompetence,
} from "../src/modules/financial/financial-dre-competence.js";

describe("Financial DRE Competence Engine", () => {
  it("computes month string and previous month string accurately", () => {
    expect(getMonthStr(new Date("2026-02-20T00:00:00Z"))).toBe("2026-02");
    expect(getPreviousMonthStr(new Date("2026-02-20T00:00:00Z"))).toBe("2026-01");
    expect(getPreviousMonthStr(new Date("2026-01-20T00:00:00Z"))).toBe("2025-12");
  });

  describe("DAS Competence", () => {
    it("shifts DAS due in Feb to Jan competence", () => {
      const res = resolveDasCompetence({
        sourceId: "10540",
        dueDate: new Date("2026-02-20T00:00:00Z"),
      });
      expect(res.referenceMonth).toBe("2026-01");
      expect(res.requiresReview).toBe(false);
    });

    it("shifts DAS due in Jan to Dec of previous year competence", () => {
      const res = resolveDasCompetence({
        sourceId: "10480",
        dueDate: new Date("2026-01-20T00:00:00Z"),
      });
      expect(res.referenceMonth).toBe("2025-12");
      expect(res.requiresReview).toBe(false);
    });

    it("shifts DAS due on 20/08/2026 (11382) to Jul/26 (2026-07) strictly by dueDate without override", () => {
      const res = resolveDasCompetence({
        sourceId: "11382",
        dueDate: new Date("2026-08-20T00:00:00Z"),
        confirmationDate: new Date("2026-09-21T00:00:00Z"),
        sourceCompetenceDate: new Date("2026-10-01T00:00:00Z"),
      });
      expect(res.referenceMonth).toBe("2026-07");
      expect(res.requiresReview).toBe(false);
    });

    it("shifts DAS due on 20/09/2026 (11256) to Ago/26 (2026-08)", () => {
      const res = resolveDasCompetence({
        sourceId: "11256",
        dueDate: new Date("2026-09-20T00:00:00Z"),
        confirmationDate: new Date("2026-09-20T00:00:00Z"),
      });
      expect(res.referenceMonth).toBe("2026-08");
      expect(res.requiresReview).toBe(false);
    });

    it("does not allow sourceCompetenceDate or confirmationDate to override dueDate", () => {
      const res = resolveDasCompetence({
        sourceId: "88888",
        dueDate: new Date("2026-04-20T00:00:00Z"),
        confirmationDate: new Date("2026-05-15T00:00:00Z"),
        sourceCompetenceDate: new Date("2026-01-01T00:00:00Z"),
      });
      expect(res.referenceMonth).toBe("2026-03");
      expect(res.requiresReview).toBe(false);
    });

    it("flags requiresReview when dueDate is missing or invalid without inventing competence", () => {
      expect(
        resolveDasCompetence({
          sourceId: "99998",
          dueDate: null,
        }),
      ).toEqual({ referenceMonth: null, requiresReview: true });

      expect(
        resolveDasCompetence({
          sourceId: "99999",
          dueDate: new Date("invalid"),
        }),
      ).toEqual({ referenceMonth: null, requiresReview: true });
    });
  });

  describe("GPS Competence", () => {
    it("shifts GPS due in Feb to Jan competence", () => {
      const res = resolveGpsCompetence({
        sourceId: "10541",
        dueDate: new Date("2026-02-20T00:00:00Z"),
      });
      expect(res.referenceMonth).toBe("2026-01");
      expect(res.requiresReview).toBe(false);
    });

    it("shifts GPS due in Jan to Dec of previous year competence", () => {
      const res = resolveGpsCompetence({
        sourceId: "10481",
        dueDate: new Date("2026-01-20T00:00:00Z"),
      });
      expect(res.referenceMonth).toBe("2025-12");
      expect(res.requiresReview).toBe(false);
    });

    it("shifts GPS due on 20/08/2026 (11255) to Jul/26 and 20/09/2026 (11385) to Ago/26 ignoring sourceCompetenceDate", () => {
      const jul = resolveGpsCompetence({
        sourceId: "11255",
        dueDate: new Date("2026-08-20T00:00:00Z"),
        sourceCompetenceDate: new Date("2026-10-10T00:00:00Z"),
      });
      expect(jul.referenceMonth).toBe("2026-07");
      expect(jul.requiresReview).toBe(false);

      const aug = resolveGpsCompetence({
        sourceId: "11385",
        dueDate: new Date("2026-09-20T00:00:00Z"),
      });
      expect(aug.referenceMonth).toBe("2026-08");
      expect(aug.requiresReview).toBe(false);
    });

    it("flags requiresReview when dueDate is missing or invalid", () => {
      expect(
        resolveGpsCompetence({
          sourceId: "77776",
          dueDate: null,
        }),
      ).toEqual({ referenceMonth: null, requiresReview: true });
    });
  });

  describe("ICMS Competence", () => {
    it("assigns ICMS competence to month of dueDate (e.g., 30/09/2026 -> 2026-09) ignoring sourceCompetenceDate", () => {
      const res = resolveIcmsCompetence({
        sourceId: "11383",
        dueDate: new Date("2026-09-30T00:00:00Z"),
        sourceCompetenceDate: new Date("2026-10-15T00:00:00Z"),
      });
      expect(res.referenceMonth).toBe("2026-09");
      expect(res.unresolved).toBe(false);
    });

    it("flags unresolved when dueDate is missing or invalid", () => {
      const res = resolveIcmsCompetence({
        sourceId: "77777",
        dueDate: null,
      });
      expect(res.referenceMonth).toBeNull();
      expect(res.unresolved).toBe(true);
    });
  });
});
