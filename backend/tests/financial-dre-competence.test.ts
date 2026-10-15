import { describe, expect, it } from "vitest";
import {
  getMonthStr,
  getPreviousMonthStr,
  KNOWN_DAS_COMPETENCE_OVERRIDES,
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

    it("applies explicit override for sourceId 11382", () => {
      expect(KNOWN_DAS_COMPETENCE_OVERRIDES["11382"]).toBe("2026-08");

      const res = resolveDasCompetence({
        sourceId: "11382",
        dueDate: new Date("2026-08-20T00:00:00Z"),
        confirmationDate: new Date("2026-09-21T00:00:00Z"),
      });
      expect(res.referenceMonth).toBe("2026-08");
      expect(res.requiresReview).toBe(false);
    });

    it("flags requiresReview when dueDate and confirmationDate diverge > 25 days without override", () => {
      const res = resolveDasCompetence({
        sourceId: "99999",
        dueDate: new Date("2026-03-20T00:00:00Z"),
        confirmationDate: new Date("2026-05-15T00:00:00Z"),
      });
      expect(res.referenceMonth).toBe("2026-02");
      expect(res.requiresReview).toBe(true);
    });

    it("uses sourceCompetenceDate when valid", () => {
      const res = resolveDasCompetence({
        sourceId: "88888",
        dueDate: new Date("2026-04-20T00:00:00Z"),
        sourceCompetenceDate: new Date("2026-03-01T00:00:00Z"),
      });
      expect(res.referenceMonth).toBe("2026-03");
      expect(res.requiresReview).toBe(false);
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
  });

  describe("ICMS Competence", () => {
    it("assigns ICMS competence to month of dueDate", () => {
      const res = resolveIcmsCompetence({
        sourceId: "10594",
        dueDate: new Date("2026-02-27T00:00:00Z"),
      });
      expect(res.referenceMonth).toBe("2026-02");
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
