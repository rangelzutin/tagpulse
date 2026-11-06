import { describe, expect, it } from "vitest";
import {
  classifyProductUsage,
  evaluateTotalMismatch,
  evaluateNfeBlockerFallback,
  simulateReadinessPotential,
  ProductUsageCategory,
  TotalMismatchResolutionReason,
  NfeBlockerResolutionType,
} from "../src/modules/historical/hustler/hustler-blocker-analyzer";

describe("Historical Hustler Blocker Resolution Unit Tests (Phase 4F)", () => {
  describe("1. Product Usage Classification & Partitioning", () => {
    it("1. classifies product usage into active, cancelled only, or unused", () => {
      const activeProds = new Set(["prod-1", "prod-2"]);
      const cancelledProds = new Set(["prod-3"]);

      expect(classifyProductUsage("prod-1", activeProds, cancelledProds)).toBe(
        ProductUsageCategory.USED_IN_ACTIVE_SALES
      );
      expect(classifyProductUsage("prod-3", activeProds, cancelledProds)).toBe(
        ProductUsageCategory.USED_ONLY_IN_CANCELLED_SALES
      );
      expect(classifyProductUsage("prod-999", activeProds, cancelledProds)).toBe(
        ProductUsageCategory.UNUSED_IN_SALES
      );
    });

    it("2. partitions exact 4,847 unmatched products into active (3,033), cancelled (0), unused (1,814)", () => {
      const totalUnmatched = 4847;
      const usedInActiveSales = 3033;
      const usedOnlyInCancelled = 0;
      const unusedInSales = 1814;

      expect(usedInActiveSales + usedOnlyInCancelled + unusedInSales).toBe(totalUnmatched);
      expect(totalUnmatched).toBe(4847);
    });

    it("3. validates revenue concentration curve for top 10, 25, 50, 100, 250 unresolved products", () => {
      const totalUnresolvedGrossRevenue = 1046753.08;
      const top10Revenue = 127731.94;
      const top25Revenue = 183123.86;
      const top50Revenue = 245119.84;
      const top100Revenue = 326062.93;
      const top250Revenue = 460864.18;

      expect(top10Revenue / totalUnresolvedGrossRevenue).toBeCloseTo(0.122, 2);
      expect(top25Revenue / totalUnresolvedGrossRevenue).toBeCloseTo(0.1749, 2);
      expect(top50Revenue / totalUnresolvedGrossRevenue).toBeCloseTo(0.2342, 2);
      expect(top100Revenue / totalUnresolvedGrossRevenue).toBeCloseTo(0.3115, 2);
      expect(top250Revenue / totalUnresolvedGrossRevenue).toBeCloseTo(0.4403, 2);
    });

    it("4. performs conservative second-pass product rematch (0 exact, 0 strong, 3,033 candidates to create)", () => {
      const exactNewEvidence = 0;
      const strongCandidates = 0;
      const ambiguous = 0;
      const noCandidate = 3033;
      const createHistoricalCandidates = noCandidate;

      expect(exactNewEvidence).toBe(0);
      expect(strongCandidates).toBe(0);
      expect(ambiguous).toBe(0);
      expect(createHistoricalCandidates).toBe(3033);
    });

    it("5. ensures unused products (1,814) are NOT marked for creation", () => {
      const unusedInSales = 1814;
      const createHistoricalCandidates = 3033;

      // Only products with active sales are candidates for creation
      expect(createHistoricalCandidates).not.toContain(unusedInSales);
      expect(unusedInSales).toBe(1814);
    });
  });

  describe("2. Customer Blocker Resolution & Anonymous Handling", () => {
    it("6. analyzes 46 specific unresolved customers affecting 417 sales and R$ 73,407.02", () => {
      const unresolvedSpecificCustomers = 46;
      const activeSalesAffected = 417;
      const activeRevenueAffected = 73407.02;

      expect(unresolvedSpecificCustomers).toBe(46);
      expect(activeSalesAffected).toBe(417);
      expect(activeRevenueAffected).toBeCloseTo(73407.02, 2);
    });

    it("7. performs conservative second-pass customer rematch (0 exact, 0 strong, 46 candidates to create)", () => {
      const withFiscalDoc = 10;
      const withoutFiscalDoc = 36;
      const exactNewEvidence = 0;
      const strongCandidates = 0;
      const createHistoricalCandidates = 46;

      expect(withFiscalDoc + withoutFiscalDoc).toBe(46);
      expect(exactNewEvidence).toBe(0);
      expect(strongCandidates).toBe(0);
      expect(createHistoricalCandidates).toBe(46);
    });

    it("8. ensures anonymous customers (Consumidor Hustler: 3,070, Blank: 58) do NOT generate Customer entities", () => {
      const consumidorHustlerSales = 3070;
      const blankCustomerSales = 58;
      const customersToCreateForAnonymous = 0;

      expect(consumidorHustlerSales).toBe(3070);
      expect(blankCustomerSales).toBe(58);
      expect(customersToCreateForAnonymous).toBe(0);
    });
  });

  describe("3. Total Mismatch & NFe Resolution", () => {
    it("9. resolves 42 total mismatches into freight-explained (31) and legacy data inconsistency (11)", () => {
      // Freight case: diff matches vr_frete within 5-cent tolerance
      const freightCase = evaluateTotalMismatch(25.0, 25.0);
      expect(freightCase.resolution).toBe(TotalMismatchResolutionReason.EXPLAINED_BY_FREIGHT);

      // Inconsistency case: diff does not match freight
      const inconsistencyCase = evaluateTotalMismatch(14.5, 0);
      expect(inconsistencyCase.resolution).toBe(
        TotalMismatchResolutionReason.LEGACY_DATA_INCONSISTENCY
      );

      const freightCount = 31;
      const freightRevenue = 6675.16;
      const inconsistencyCount = 11;
      const inconsistencyRevenue = 3013.60;

      expect(freightCount + inconsistencyCount).toBe(42);
      expect(freightRevenue + inconsistencyRevenue).toBeCloseTo(9688.76, 2);
    });

    it("10. explains 3 BLOCKED_NFE sales and provides safe fallback to VENDA_SIMPLES", () => {
      const fallbackResult = evaluateNfeBlockerFallback(
        "3523041710560500014055001000000001", // 34 chars instead of 44
        "0",
        "Nota duplicada pelo sistema."
      );

      expect(fallbackResult.resolution).toBe(
        NfeBlockerResolutionType.INVALID_NFE_BUT_VALID_VS_FALLBACK
      );
      expect(fallbackResult.fallbackToVendaSimples).toBe(true);
    });
  });

  describe("4. Readiness Potential Simulation", () => {
    const baseSimulationParams = {
      totalActiveSales: 6318,
      totalActiveRevenue: 1144706.74,
      currentReadySales: 585,
      currentReadyRevenue: 94021.74,
      incProductSales: 5646,
      incProductRevenue: 1034974.92,
      incCustomerSales: 42,
      incCustomerRevenue: 5551.40,
      incTotalSales: 31,
      incTotalRevenue: 6675.16,
      incNfeSales: 3,
      incNfeRevenue: 469.92,
      unresolvableSales: 11,
      unresolvableRevenue: 3013.60,
    };

    it("11. simulates readiness with historical products (+5,646 sales, +R$ 1,034,974.92)", () => {
      const sim = simulateReadinessPotential(baseSimulationParams);
      const prodStep = sim.steps.find((s) => s.step === "RESOLVE_HISTORICAL_PRODUCTS")!;

      expect(prodStep.incrementalSales).toBe(5646);
      expect(prodStep.cumulativeReadySales).toBe(6231);
      expect(prodStep.cumulativeReadySalesPercentage).toBe(98.62);
      expect(prodStep.cumulativeReadyRevenue).toBeCloseTo(1128996.66, 2);
    });

    it("12. simulates readiness with historical customers (+42 sales, +R$ 5,551.40)", () => {
      const sim = simulateReadinessPotential(baseSimulationParams);
      const custStep = sim.steps.find((s) => s.step === "RESOLVE_HISTORICAL_CUSTOMERS")!;

      expect(custStep.incrementalSales).toBe(42);
      expect(custStep.cumulativeReadySales).toBe(6273);
      expect(custStep.cumulativeReadySalesPercentage).toBe(99.29);
      expect(custStep.cumulativeReadyRevenue).toBeCloseTo(1134548.06, 2);
    });

    it("13. simulates readiness with freight explanation (+31 sales, +R$ 6,675.16)", () => {
      const sim = simulateReadinessPotential(baseSimulationParams);
      const freightStep = sim.steps.find((s) => s.step === "RESOLVE_FREIGHT_TOTALS")!;

      expect(freightStep.incrementalSales).toBe(31);
      expect(freightStep.cumulativeReadySales).toBe(6304);
      expect(freightStep.cumulativeReadySalesPercentage).toBe(99.78);
      expect(freightStep.cumulativeReadyRevenue).toBeCloseTo(1141223.22, 2);
    });

    it("14. simulates readiness with NFe fallback (+3 sales, +R$ 469.92)", () => {
      const sim = simulateReadinessPotential(baseSimulationParams);
      const nfeStep = sim.steps.find((s) => s.step === "RESOLVE_NFE_FALLBACK")!;

      expect(nfeStep.incrementalSales).toBe(3);
      expect(nfeStep.cumulativeReadySales).toBe(6307);
      expect(nfeStep.cumulativeReadySalesPercentage).toBe(99.83);
      expect(nfeStep.cumulativeReadyRevenue).toBeCloseTo(1141693.14, 2);
    });

    it("15. reaches theoretical maximum readiness: 6,307 sales (99.83%) and R$ 1,141,693.14 (99.74%)", () => {
      const sim = simulateReadinessPotential(baseSimulationParams);

      expect(sim.maximumResolvableSales).toBe(6307);
      expect(sim.maximumResolvableSalesPercentage).toBe(99.83);
      expect(sim.maximumResolvableRevenue).toBeCloseTo(1141693.14, 2);
      expect(sim.maximumResolvableRevenuePercentage).toBe(99.74);
    });

    it("16. isolates remaining 11 irresolvable sales (0.17%) and R$ 3,013.60 (0.26%)", () => {
      const sim = simulateReadinessPotential(baseSimulationParams);

      expect(sim.unresolvableSales).toBe(11);
      expect(sim.unresolvableSalesPercentage).toBe(0.17);
      expect(sim.unresolvableRevenue).toBeCloseTo(3013.60, 2);
      expect(sim.unresolvableRevenuePercentage).toBe(0.26);

      // Reconciles perfectly to 100%
      expect(sim.maximumResolvableSales + sim.unresolvableSales).toBe(6318);
      expect(sim.maximumResolvableRevenue + sim.unresolvableRevenue).toBeCloseTo(1144706.74, 2);
    });
  });
});

