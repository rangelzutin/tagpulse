/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi } from "vitest";
import { Prisma } from "@prisma/client";
import {
  resolveSinceDate,
  fetchRecentSourceIds,
  fetchCatalogTailSourceIds,
  getKnownMaxSourceId,
  collectIncrementalCandidates,
  runIncrementalSync,
} from "../src/modules/financial/financial-incremental-sync.js";
import {
  aggregateOperationalSummary,
  aggregateCashFlowSeries,
  aggregateUndatedConfirmedCash,
  calculateEffectiveCashAmount,
} from "../src/modules/financial/financial-operational-calculator.js";
import type { FinancialRecordRepository } from "../src/modules/financial/financial-record-repository.js";
import type { FinancialRecordWorker } from "../src/modules/financial/financial-record-worker.js";
import type { TagPlusClient } from "../src/integrations/tagplus/tagplus-client.js";

describe("Financial Incremental Sync — Unit Tests (Fase 5F)", () => {
  describe("Date resolution & lookback", () => {
    it("resolves explicit since date", () => {
      const res = resolveSinceDate({ since: "2026-08-01" });
      expect(res.sinceDate).toBe("2026-08-01");
      expect(res.lookbackDays).toBeUndefined();
    });

    it("throws on invalid since date format", () => {
      expect(() => resolveSinceDate({ since: "01-08-2026" })).toThrow(/Invalid --since date format/);
      expect(() => resolveSinceDate({ since: "invalid" })).toThrow(/Invalid --since date format/);
    });

    it("calculates default 30 days lookback in America/Sao_Paulo", () => {
      // 2026-09-28 01:00 UTC is 2026-09-27 22:00 in America/Sao_Paulo (UTC-3)
      const now = new Date("2026-09-28T01:00:00Z");
      const res = resolveSinceDate({ now });
      expect(res.lookbackDays).toBe(30);
      expect(res.sinceDate).toBe("2026-08-28");
    });

    it("supports custom lookbackDays", () => {
      const now = new Date("2026-09-28T01:00:00Z");
      const res = resolveSinceDate({ lookbackDays: 10, now });
      expect(res.lookbackDays).toBe(10);
      expect(res.sinceDate).toBe("2026-09-17");
    });
  });

  describe("Candidate collection & deduplication", () => {
    it("Test A: correctly unifies and deduplicates recent, open, and undated candidates", async () => {
      // recentIds = [1, 2, 3], openIds = [3, 4], undatedIds = [4, 5] => [1, 2, 3, 4, 5]
      const mockClient = {
        get: vi.fn().mockImplementation(async (path: string) => {
          const url = new URL(path, "http://localhost");
          const page = url.searchParams.get("page");
          if (page === "1") {
            return {
              status: 200,
              data: [{ id: 1 }, { id: 2 }, { id: 3 }],
            };
          }
          return { status: 200, data: [] };
        }),
      } as unknown as TagPlusClient;

      const mockPrisma = {
        financialRecord: {
          findMany: vi.fn().mockImplementation(async ({ where }: any) => {
            if (where.isConfirmed === false) {
              return [{ sourceId: "3" }, { sourceId: "4" }];
            }
            if (where.isConfirmed === true && where.confirmationDate === null) {
              return [{ sourceId: "4" }, { sourceId: "5" }];
            }
            return [];
          }),
        },
      } as unknown as any;

      const result = await collectIncrementalCandidates({
        prisma: mockPrisma,
        getClient: () => mockClient,
        connectionId: "conn-1",
        pageDelayMs: 0,
      });

      expect(result.recentCandidates).toEqual(["1", "2", "3"]);
      expect(result.openCandidates).toEqual(["3", "4"]);
      expect(result.undatedCandidates).toEqual(["4", "5"]);
      expect(result.uniqueCandidates.sort()).toEqual(["1", "2", "3", "4", "5"]);
      // 3 + 2 + 2 = 7 total entries; 5 unique => 2 overlap deduplicated
      expect(result.overlapDeduplicated).toBe(2);
    });

    it("Test B: open title from years ago outside lookback remains candidate", async () => {
      const mockClient = {
        get: vi.fn().mockResolvedValue({ status: 200, data: [] }),
      } as unknown as TagPlusClient;

      const mockPrisma = {
        financialRecord: {
          findMany: vi.fn().mockImplementation(async ({ where }: any) => {
            if (where.isConfirmed === false) {
              return [{ sourceId: "old-open-9999" }];
            }
            return [];
          }),
        },
      } as unknown as any;

      const result = await collectIncrementalCandidates({
        prisma: mockPrisma,
        getClient: () => mockClient,
        connectionId: "conn-1",
        lookbackDays: 30,
        pageDelayMs: 0,
      });

      expect(result.uniqueCandidates).toContain("old-open-9999");
      expect(result.openCandidates).toContain("old-open-9999");
    });

    it("Test C: undated confirmed cash outside lookback remains candidate", async () => {
      const mockClient = {
        get: vi.fn().mockResolvedValue({ status: 200, data: [] }),
      } as unknown as TagPlusClient;

      const mockPrisma = {
        financialRecord: {
          findMany: vi.fn().mockImplementation(async ({ where }: any) => {
            if (where.isConfirmed === true && where.confirmationDate === null) {
              return [{ sourceId: "undated-11191" }];
            }
            return [];
          }),
        },
      } as unknown as any;

      const result = await collectIncrementalCandidates({
        prisma: mockPrisma,
        getClient: () => mockClient,
        connectionId: "conn-1",
        lookbackDays: 30,
        pageDelayMs: 0,
      });

      expect(result.uniqueCandidates).toContain("undated-11191");
      expect(result.undatedCandidates).toContain("undated-11191");
    });
  });

  describe("Pagination & termination rules (Section 21)", () => {
    it("simulates page 1 = 100, page 2 = 40, page 3 = 20, page 4 = [] and collects 160 IDs without stopping on short pages", async () => {
      const page1 = Array.from({ length: 100 }, (_, i) => ({ id: i + 1 }));
      const page2 = Array.from({ length: 40 }, (_, i) => ({ id: i + 101 }));
      const page3 = Array.from({ length: 20 }, (_, i) => ({ id: i + 141 }));
      const page4: any[] = [];

      const mockClient = {
        get: vi.fn().mockImplementation(async (path: string) => {
          const page = new URL(path, "http://localhost").searchParams.get("page");
          if (page === "1") return { status: 200, data: page1 };
          if (page === "2") return { status: 200, data: page2 };
          if (page === "3") return { status: 200, data: page3 };
          if (page === "4") return { status: 200, data: page4 };
          return { status: 200, data: [] };
        }),
      } as unknown as TagPlusClient;

      const ids = await fetchRecentSourceIds(() => mockClient, "2026-08-28", { pageDelayMs: 0 });

      expect(ids.length).toBe(160);
      expect(ids[0]).toBe("1");
      expect(ids[159]).toBe("160");
      expect(mockClient.get).toHaveBeenCalledTimes(4);
    });

    it("deduplicates IDs that appear across multiple pages", async () => {
      const page1 = [{ id: 10 }, { id: 20 }];
      const page2 = [{ id: 20 }, { id: 30 }];
      const page3: any[] = [];

      const mockClient = {
        get: vi.fn().mockImplementation(async (path: string) => {
          const page = new URL(path, "http://localhost").searchParams.get("page");
          if (page === "1") return { status: 200, data: page1 };
          if (page === "2") return { status: 200, data: page2 };
          return { status: 200, data: page3 };
        }),
      } as unknown as TagPlusClient;

      const ids = await fetchRecentSourceIds(() => mockClient, "2026-08-28", { pageDelayMs: 0 });
      expect(ids).toEqual(["10", "20", "30"]);
    });
  });

  describe("Refresh semantics & checkpointing (Section 7 & 6)", () => {
    it("Test D & E: prepareIncrementalCandidates queues new IDs and refreshes existing COMPLETED items without losing attemptCount/lastError", async () => {
      const mockPrisma = {
        financialRecordSyncItem: {
          findMany: vi.fn().mockResolvedValue([
            {
              sourceId: "existing-completed-1",
              status: "COMPLETED",
              attemptCount: 2,
              lastError: null,
              lastHttpStatus: 200,
            },
          ]),
          createMany: vi.fn().mockResolvedValue({ count: 1 }),
          updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        },
      } as unknown as any;

      // We test the repository implementation logic
      const { createFinancialRecordRepository } = await import(
        "../src/modules/financial/financial-record-repository.js"
      );
      const repo = createFinancialRecordRepository(mockPrisma);

      const prepResult = await repo.prepareIncrementalCandidates("conn-1", [
        "existing-completed-1",
        "new-id-2",
      ]);

      expect(prepResult.total).toBe(2);
      expect(prepResult.newlyCreated).toBe(1);
      expect(prepResult.refreshed).toBe(1);

      // Verify createMany created new-id-2 with status PENDING, attemptCount 0, catalogSeenAt null
      expect(mockPrisma.financialRecordSyncItem.createMany).toHaveBeenCalledWith({
        data: [
          expect.objectContaining({
            sourceId: "new-id-2",
            status: "PENDING",
            attemptCount: 0,
            catalogSeenAt: null,
          }),
        ],
        skipDuplicates: true,
      });

      // Verify updateMany refreshed existing item to PENDING without clearing attemptCount or error and without altering catalogSeenAt
      expect(mockPrisma.financialRecordSyncItem.updateMany).toHaveBeenCalledWith({
        where: {
          connectionId: "conn-1",
          sourceId: { in: ["existing-completed-1"] },
        },
        data: {
          status: "PENDING",
        },
      });
    });

    it("CASO A: prepareIncrementalCandidates preserves existing catalogSeenAt timestamp when refreshing", async () => {
      const existingDate = new Date("2026-09-20T12:00:00Z");
      const mockPrisma = {
        financialRecordSyncItem: {
          findMany: vi.fn().mockResolvedValue([
            {
              sourceId: "item-seen-at-catalog",
              status: "COMPLETED",
              attemptCount: 1,
              catalogSeenAt: existingDate,
              lastError: null,
              lastHttpStatus: 200,
            },
          ]),
          createMany: vi.fn(),
          updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        },
      } as unknown as any;

      const { createFinancialRecordRepository } = await import(
        "../src/modules/financial/financial-record-repository.js"
      );
      const repo = createFinancialRecordRepository(mockPrisma);

      await repo.prepareIncrementalCandidates("conn-1", ["item-seen-at-catalog"]);

      // Verify updateMany did NOT include catalogSeenAt in data
      expect(mockPrisma.financialRecordSyncItem.updateMany).toHaveBeenCalledWith({
        where: {
          connectionId: "conn-1",
          sourceId: { in: ["item-seen-at-catalog"] },
        },
        data: {
          status: "PENDING",
        },
      });
      const updateData = mockPrisma.financialRecordSyncItem.updateMany.mock.calls[0][0].data;
      expect(updateData).not.toHaveProperty("catalogSeenAt");
    });

    it("CASO B: prepareIncrementalCandidates preserves null catalogSeenAt on existing items and sets null for new items", async () => {
      const mockPrisma = {
        financialRecordSyncItem: {
          findMany: vi.fn().mockResolvedValue([
            {
              sourceId: "item-null-seen",
              status: "COMPLETED",
              attemptCount: 1,
              catalogSeenAt: null,
              lastError: null,
              lastHttpStatus: 200,
            },
          ]),
          createMany: vi.fn().mockResolvedValue({ count: 1 }),
          updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        },
      } as unknown as any;

      const { createFinancialRecordRepository } = await import(
        "../src/modules/financial/financial-record-repository.js"
      );
      const repo = createFinancialRecordRepository(mockPrisma);

      await repo.prepareIncrementalCandidates("conn-1", ["item-null-seen", "brand-new-item"]);

      // Existing item: updateMany does NOT set catalogSeenAt
      const updateData = mockPrisma.financialRecordSyncItem.updateMany.mock.calls[0][0].data;
      expect(updateData).not.toHaveProperty("catalogSeenAt");
      expect(updateData.status).toBe("PENDING");

      // New item: createMany sets catalogSeenAt to null
      expect(mockPrisma.financialRecordSyncItem.createMany).toHaveBeenCalledWith({
        data: [
          expect.objectContaining({
            sourceId: "brand-new-item",
            status: "PENDING",
            catalogSeenAt: null,
          }),
        ],
        skipDuplicates: true,
      });
    });

    it("CASO C: incremental sync does not alter sourcePresent or noLongerObservedAt on existing FinancialRecord", async () => {
      const mockRepo = {
        prepareIncrementalCandidates: vi.fn().mockResolvedValue({ total: 1, newlyCreated: 0, refreshed: 1 }),
        markUnobservedFinancialRecords: vi.fn(),
      } as unknown as FinancialRecordRepository;

      const mockWorker = {
        processQueue: vi.fn().mockResolvedValue({
          processed: 1,
          completed: 1,
          failed: 0,
          notFound: 0,
          elapsedMs: 50,
          inserted: 0,
          updated: 0,
          unchanged: 1,
        }),
      } as unknown as FinancialRecordWorker;

      const mockPrisma = {
        financialRecord: {
          findMany: vi.fn().mockResolvedValue([{ sourceId: "rec-open" }]),
        },
      } as unknown as any;

      const mockClient = {
        get: vi.fn().mockResolvedValue({ status: 200, data: [] }),
      } as unknown as TagPlusClient;

      await runIncrementalSync({
        prisma: mockPrisma,
        repository: mockRepo,
        worker: mockWorker,
        getClient: () => mockClient,
        connectionId: "conn-1",
        lookbackDays: 30,
        pageDelayMs: 0,
      });

      // markUnobservedFinancialRecords is NEVER invoked
      expect(mockRepo.markUnobservedFinancialRecords).not.toHaveBeenCalled();
    });

    it("CASO D: records with sourcePresent=false are never picked up by open/undated candidate discovery", async () => {
      const mockPrisma = {
        financialRecord: {
          findMany: vi.fn().mockImplementation(async ({ where }: any) => {
            // open and undated candidates filter must explicitly require sourcePresent: true
            expect(where.sourcePresent).toBe(true);
            return [];
          }),
        },
      } as unknown as any;

      const mockClient = {
        get: vi.fn().mockResolvedValue({ status: 200, data: [] }),
      } as unknown as TagPlusClient;

      await collectIncrementalCandidates({
        prisma: mockPrisma,
        getClient: () => mockClient,
        connectionId: "conn-1",
        lookbackDays: 30,
        pageDelayMs: 0,
      });

      expect(mockPrisma.financialRecord.findMany).toHaveBeenCalledTimes(2);
    });
  });

  describe("Transitions & Operational Calculations (Sections 8, 9, 10)", () => {
    it("Test F: transition OPEN -> CONFIRMED removes title from Receivables and adds to Cash", () => {
      const openTitle: any = {
        id: "rec-1",
        connectionId: "conn-1",
        sourceId: "100",
        type: "ENTRADA",
        isConfirmed: false,
        isTransfer: false,
        dueDate: new Date("2026-09-20"),
        confirmationDate: null,
        paidAmount: new Prisma.Decimal(0),
        totalAmount: new Prisma.Decimal(500),
        sourcePresent: true,
      };

      const summaryBefore = aggregateOperationalSummary([openTitle], "2026-09-27");
      expect(summaryBefore.openCount).toBe(1);
      expect(summaryBefore.openTotal).toBe(500);
      expect(calculateEffectiveCashAmount(openTitle).toNumber()).toBe(0);

      // Simulate API detail update: title is paid & confirmed on 2026-09-25
      const confirmedTitle: any = {
        ...openTitle,
        isConfirmed: true,
        confirmationDate: new Date("2026-09-25"),
        paidAmount: new Prisma.Decimal(500),
      };

      const summaryAfter = aggregateOperationalSummary([confirmedTitle], "2026-09-27");
      // Leaves open receivables
      expect(summaryAfter.openCount).toBe(0);
      expect(summaryAfter.openTotal).toBe(0);

      // Enters cash inflows
      expect(calculateEffectiveCashAmount(confirmedTitle).toNumber()).toBe(500);
      const cashSeries = aggregateCashFlowSeries([confirmedTitle], {
        from: "2026-09-01",
        to: "2026-09-30",
        granularity: "month",
      });
      expect(cashSeries.totals.inflows).toBe(500);
      expect(cashSeries.totals.netCashFlow).toBe(500);
    });

    it("Test H: OPEN title with paidAmount > 0 remains without cash", () => {
      const openWithPaid: any = {
        id: "rec-partial",
        connectionId: "conn-1",
        sourceId: "101",
        type: "ENTRADA",
        isConfirmed: false,
        isTransfer: false,
        dueDate: new Date("2026-09-20"),
        confirmationDate: null,
        paidAmount: new Prisma.Decimal(250),
        totalAmount: new Prisma.Decimal(500),
        sourcePresent: true,
      };

      const summary = aggregateOperationalSummary([openWithPaid], "2026-09-27");
      // Still in open receivables
      expect(summary.openCount).toBe(1);
      expect(summary.openTotal).toBe(500);

      // Zero cash realized!
      expect(calculateEffectiveCashAmount(openWithPaid).toNumber()).toBe(0);
    });

    it("Test G: transition UNDATED -> DATED moves entry from undated confirmed cash to cash timeseries", () => {
      const undatedEntry: any = {
        id: "rec-undated",
        connectionId: "conn-1",
        sourceId: "11191",
        type: "ENTRADA",
        isConfirmed: true,
        isTransfer: false,
        dueDate: new Date("2026-08-10"),
        confirmationDate: null,
        paidAmount: new Prisma.Decimal(100),
        totalAmount: new Prisma.Decimal(100),
        sourcePresent: true,
      };

      const undatedBefore = aggregateUndatedConfirmedCash([undatedEntry]);
      expect(undatedBefore.undatedConfirmedCount).toBe(1);
      expect(undatedBefore.undatedConfirmedInflows).toBe(100);

      // Now TagPlus provides corrected confirmationDate
      const datedEntry: any = {
        ...undatedEntry,
        confirmationDate: new Date("2026-08-11"),
      };

      const undatedAfter = aggregateUndatedConfirmedCash([datedEntry]);
      expect(undatedAfter.undatedConfirmedCount).toBe(0);
      expect(undatedAfter.undatedConfirmedInflows).toBe(0);

      const cashSeries = aggregateCashFlowSeries([datedEntry], {
        from: "2026-08-01",
        to: "2026-08-31",
        granularity: "month",
      });
      expect(cashSeries.totals.inflows).toBe(100);
      expect(cashSeries.totals.netCashFlow).toBe(100);
    });
  });

  describe("Safety, Source Presence & 404 (Sections 12 & 13)", () => {
    it("Test I: partial since scan never alters sourcePresent of absent records", async () => {
      // In runIncrementalSync, markUnobservedFinancialRecords is NEVER invoked.
      const mockRepo = {
        prepareIncrementalCandidates: vi.fn().mockResolvedValue({ total: 1, newlyCreated: 0, refreshed: 1 }),
        markUnobservedFinancialRecords: vi.fn(),
      } as unknown as FinancialRecordRepository;

      const mockWorker = {
        processQueue: vi.fn().mockResolvedValue({
          processed: 1,
          completed: 1,
          failed: 0,
          notFound: 0,
          elapsedMs: 100,
          inserted: 0,
          updated: 1,
          unchanged: 0,
        }),
      } as unknown as FinancialRecordWorker;

      const mockPrisma = {
        financialRecord: {
          findMany: vi.fn().mockResolvedValue([]),
        },
      } as unknown as any;

      const mockClient = {
        get: vi.fn().mockResolvedValue({ status: 200, data: [] }),
      } as unknown as TagPlusClient;

      await runIncrementalSync({
        prisma: mockPrisma,
        repository: mockRepo,
        worker: mockWorker,
        getClient: () => mockClient,
        connectionId: "conn-1",
        lookbackDays: 30,
        pageDelayMs: 0,
      });

      expect(mockRepo.markUnobservedFinancialRecords).not.toHaveBeenCalled();
    });

    it("Test J: 404 response does not delete FinancialRecord", async () => {
      const mockPrisma = {
        $transaction: vi.fn().mockImplementation(async (promises: any[]) => Promise.all(promises)),
        financialRecordSyncItem: {
          findUnique: vi.fn().mockResolvedValue({ id: "item-1", sourceId: "404-id", attemptCount: 0 }),
          update: vi.fn().mockResolvedValue({}),
          updateMany: vi.fn().mockResolvedValue({ count: 0 }),
        },
        financialRecord: {
          delete: vi.fn(),
          deleteMany: vi.fn(),
          update: vi.fn(),
          updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        },
      } as unknown as any;

      const { createFinancialRecordWorker } = await import(
        "../src/modules/financial/financial-record-worker.js"
      );
      const { createFinancialRecordRepository } = await import(
        "../src/modules/financial/financial-record-repository.js"
      );
      const { TagPlusHttpError } = await import(
        "../src/integrations/tagplus/tagplus-client.js"
      );

      const repo = createFinancialRecordRepository(mockPrisma);
      const mockClient = {
        get: vi.fn().mockRejectedValue(new TagPlusHttpError(404)),
      } as unknown as TagPlusClient;

      const worker = createFinancialRecordWorker({
        prisma: mockPrisma,
        repository: repo,
        getClient: () => mockClient,
      });

      const summary = await worker.processQueue("conn-1", {
        candidateSourceIds: ["404-id"],
        rateLimitDelayMs: 0,
      });

      expect(summary.notFound).toBe(1);
      expect(summary.failed).toBe(0);
      expect(mockPrisma.financialRecord.delete).not.toHaveBeenCalled();
      expect(mockPrisma.financialRecord.deleteMany).not.toHaveBeenCalled();
    });

    it("Test K: second execution is idempotent and does not duplicate records", async () => {
      // In dry-run or live sync, processing the same candidate twice updates or leaves unchanged
      const mockRepo = {
        prepareIncrementalCandidates: vi.fn().mockResolvedValue({ total: 2, newlyCreated: 0, refreshed: 2 }),
      } as unknown as FinancialRecordRepository;

      const mockWorker = {
        processQueue: vi.fn().mockResolvedValue({
          processed: 2,
          completed: 2,
          failed: 0,
          notFound: 0,
          elapsedMs: 200,
          inserted: 0,
          updated: 0,
          unchanged: 2,
        }),
      } as unknown as FinancialRecordWorker;

      const mockPrisma = {
        financialRecord: {
          findMany: vi.fn().mockResolvedValue([]),
        },
      } as unknown as any;

      const mockClient = {
        get: vi.fn().mockResolvedValue({ status: 200, data: [] }),
      } as unknown as TagPlusClient;

      const report1 = await runIncrementalSync({
        prisma: mockPrisma,
        repository: mockRepo,
        worker: mockWorker,
        getClient: () => mockClient,
        connectionId: "conn-1",
        lookbackDays: 30,
        pageDelayMs: 0,
      });

      const report2 = await runIncrementalSync({
        prisma: mockPrisma,
        repository: mockRepo,
        worker: mockWorker,
        getClient: () => mockClient,
        connectionId: "conn-1",
        lookbackDays: 30,
        pageDelayMs: 0,
      });

      expect(report1.workerSummary?.inserted).toBe(0);
      expect(report1.workerSummary?.unchanged).toBe(2);
      expect(report2.workerSummary?.inserted).toBe(0);
      expect(report2.workerSummary?.unchanged).toBe(2);
    });
  });

  describe("Deterministic Blind-Spot Regression Tests (Fase 5D.3.1)", () => {
    it("Caso A: Sync em 25/10 com registro criado em 25/10 mas dueDate em 10/09 (já confirmado) é descoberto via cauda e ingerido", async () => {
      const mockPrisma = {
        financialRecordSyncItem: {
          count: vi.fn().mockResolvedValue(10450), // indicates ~105 pages
        },
        financialRecord: {
          findMany: vi.fn().mockResolvedValue([]), // no open or undated records
        },
      } as unknown as any;

      const mockClient = {
        get: vi.fn().mockImplementation(async (path: string) => {
          if (path.includes("since=")) {
            // endpoint filtering by dueDate >= 2026-09-25 returns nothing
            return { status: 200, data: [] };
          }
          if (path.includes("page=101")) {
            return { status: 200, data: [{ id: 11400 }] };
          }
          if (path.includes("page=102")) {
            return { status: 200, data: [{ id: 11450 }] };
          }
          if (path.includes("page=103")) {
            // Target item 11491 is at the tail of the catalog!
            return { status: 200, data: [{ id: 11491 }, { id: 11492 }, { id: 11493 }] };
          }
          return { status: 200, data: [] };
        }),
      } as unknown as TagPlusClient;

      const candidates = await collectIncrementalCandidates({
        prisma: mockPrisma,
        getClient: () => mockClient,
        connectionId: "conn-1",
        now: new Date("2026-10-25T12:00:00Z"),
        lookbackDays: 30,
        enableTailScan: true,
        tailLookbackPages: 3,
        pageDelayMs: 0,
      });

      expect(candidates.recentCandidates).toEqual([]);
      expect(candidates.openCandidates).toEqual([]);
      expect(candidates.tailCandidates).toEqual(["11400", "11450", "11491", "11492", "11493"]);
      expect(candidates.uniqueCandidates).toContain("11491");
      expect(candidates.uniqueCandidates).toContain("11492");
      expect(candidates.uniqueCandidates).toContain("11493");

      const mockRepo = {
        prepareIncrementalCandidates: vi.fn().mockResolvedValue({ total: 5, newlyCreated: 3, refreshed: 2 }),
      } as unknown as FinancialRecordRepository;

      const mockWorker = {
        processQueue: vi.fn().mockResolvedValue({
          processed: 5,
          completed: 5,
          failed: 0,
          notFound: 0,
          elapsedMs: 150,
          inserted: 3,
          updated: 2,
          unchanged: 0,
        }),
      } as unknown as FinancialRecordWorker;

      const report = await runIncrementalSync({
        prisma: mockPrisma,
        repository: mockRepo,
        worker: mockWorker,
        getClient: () => mockClient,
        connectionId: "conn-1",
        now: new Date("2026-10-25T12:00:00Z"),
        lookbackDays: 30,
        enableTailScan: true,
        tailLookbackPages: 3,
        pageDelayMs: 0,
      });

      expect(report.candidates.uniqueCount).toBe(5);
      expect(report.candidates.tailCount).toBe(5);
      expect(report.candidates.recentCount).toBe(0);
      expect(mockRepo.prepareIncrementalCandidates).toHaveBeenCalledWith(
        "conn-1",
        expect.arrayContaining(["11491", "11492", "11493"]),
      );
      expect(mockWorker.processQueue).toHaveBeenCalledWith(
        "conn-1",
        expect.objectContaining({
          candidateSourceIds: expect.arrayContaining(["11491", "11492", "11493"]),
        }),
      );
    });

    it("Caso B: Registro antigo sem alteração recente não é reprocessado nem duplicado", async () => {
      const mockPrisma = {
        financialRecordSyncItem: {
          count: vi.fn().mockResolvedValue(10000),
        },
        financialRecord: {
          findMany: vi.fn().mockResolvedValue([]),
        },
      } as unknown as any;

      const mockClient = {
        get: vi.fn().mockImplementation(async (path: string) => {
          if (path.includes("since=")) {
            return { status: 200, data: [] };
          }
          if (path.includes("page=97")) {
            return { status: 200, data: [{ id: 9900 }] };
          }
          return { status: 200, data: [] };
        }),
      } as unknown as TagPlusClient;

      const candidates = await collectIncrementalCandidates({
        prisma: mockPrisma,
        getClient: () => mockClient,
        connectionId: "conn-1",
        now: new Date("2026-10-25T12:00:00Z"),
        lookbackDays: 30,
        enableTailScan: true,
        pageDelayMs: 0,
      });

      expect(candidates.uniqueCandidates).not.toContain("5000");
    });

    it("Caso C: Registro aberto antigo posteriormente confirmado é descoberto via openCandidates e atualizado", async () => {
      const mockPrisma = {
        financialRecordSyncItem: {
          count: vi.fn().mockResolvedValue(0),
        },
        financialRecord: {
          findMany: vi.fn().mockImplementation(async ({ where }: any) => {
            if (where.isConfirmed === false) {
              return [{ sourceId: "777" }];
            }
            return [];
          }),
        },
      } as unknown as any;

      const mockClient = {
        get: vi.fn().mockResolvedValue({ status: 200, data: [] }),
      } as unknown as TagPlusClient;

      const candidates = await collectIncrementalCandidates({
        prisma: mockPrisma,
        getClient: () => mockClient,
        connectionId: "conn-1",
        pageDelayMs: 0,
      });

      expect(candidates.openCandidates).toContain("777");
      expect(candidates.uniqueCandidates).toContain("777");
    });

    it("Caso D: Mesmo registro retornado por mais de uma via de descoberta é unificado e ingerido uma única vez", async () => {
      const mockPrisma = {
        financialRecordSyncItem: {
          count: vi.fn().mockResolvedValue(100),
        },
        financialRecord: {
          findMany: vi.fn().mockResolvedValue([]),
        },
      } as unknown as any;

      const mockClient = {
        get: vi.fn().mockImplementation(async (path: string) => {
          if (path.includes("since=") && path.includes("page=1&")) {
            return { status: 200, data: [{ id: 999 }, { id: 1001 }] };
          }
          if (!path.includes("since=") && path.includes("page=1&")) {
            return { status: 200, data: [{ id: 999 }, { id: 1002 }] };
          }
          return { status: 200, data: [] };
        }),
      } as unknown as TagPlusClient;

      const candidates = await collectIncrementalCandidates({
        prisma: mockPrisma,
        getClient: () => mockClient,
        connectionId: "conn-1",
        additionalCandidateIds: ["999", "1003"],
        pageDelayMs: 0,
      });

      expect(candidates.recentCandidates).toContain("999");
      expect(candidates.tailCandidates).toContain("999");
      expect(candidates.additionalCandidates).toContain("999");

      const countOf999 = candidates.uniqueCandidates.filter((id) => id === "999").length;
      expect(countOf999).toBe(1);
      expect(candidates.uniqueCandidates.sort()).toEqual(["1001", "1002", "1003", "999"].sort());
      expect(candidates.overlapDeduplicated).toBeGreaterThanOrEqual(2);
    });

    it("Caso E: Registro removido/cancelado na origem (404) tem sourcePresent marcado como false", async () => {
      const mockPrisma = {
        $transaction: vi.fn().mockImplementation(async (promises: any[]) => {
          return Promise.all(promises);
        }),
        financialRecordSyncItem: {
          update: vi.fn().mockResolvedValue({ id: "sync-1", status: "NOT_FOUND" }),
        },
        financialRecord: {
          updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        },
      } as unknown as any;

      const { createFinancialRecordRepository } = await import(
        "../src/modules/financial/financial-record-repository.js"
      );
      const repo = createFinancialRecordRepository(mockPrisma);

      await repo.markItemNotFound("conn-1", "deleted-123", 404);

      expect(mockPrisma.$transaction).toHaveBeenCalled();
      expect(mockPrisma.financialRecordSyncItem.update).toHaveBeenCalledWith({
        where: {
          connectionId_sourceId: {
            connectionId: "conn-1",
            sourceId: "deleted-123",
          },
        },
        data: expect.objectContaining({
          status: "NOT_FOUND",
          lastHttpStatus: 404,
        }),
      });
      expect(mockPrisma.financialRecord.updateMany).toHaveBeenCalledWith({
        where: {
          connectionId: "conn-1",
          sourceId: "deleted-123",
        },
        data: expect.objectContaining({
          sourcePresent: false,
          noLongerObservedAt: expect.any(Date),
        }),
      });
    });
  });

  describe("Tail Scan Completeness & Volume Tests (Fase 5D.3.2)", () => {
    // Factory to simulate TagPlus catalog pagination with N existing IDs and M new IDs
    function createCatalogMock(totalExistingPages: number, newPagesCount: number) {
      const perPage = 100;
      const totalPages = totalExistingPages + newPagesCount;

      const getMock = vi.fn().mockImplementation(async (path: string) => {
        // since= returns nothing because all new records have retroactive dueDate outside lookback
        if (path.includes("since=")) {
          return { status: 200, data: [] };
        }

        const match = path.match(/page=(\d+)/);
        const page = match ? Number.parseInt(match[1], 10) : 1;

        if (page < 1 || page > totalPages) {
          return { status: 200, data: [] };
        }

        const startId = (page - 1) * perPage + 1;
        const pageItems = Array.from({ length: perPage }, (_, i) => ({
          id: startId + i,
        }));

        return { status: 200, data: pageItems };
      });

      return {
        client: { get: getMock } as unknown as TagPlusClient,
        existingCount: totalExistingPages * perPage,
        maxExistingId: totalExistingPages * perPage,
        expectedNewIds: Array.from(
          { length: newPagesCount * perPage },
          (_, i) => String(totalExistingPages * perPage + 1 + i),
        ),
      };
    }

    it("Cenário A: 1 página de novos registros (100 IDs novos) — 100% descobertos", async () => {
      // 100 existing pages (10,000 IDs), 1 new page (IDs 10001..10100)
      const { client, existingCount, maxExistingId, expectedNewIds } = createCatalogMock(100, 1);

      const mockPrisma = {
        financialRecordSyncItem: {
          count: vi.fn().mockResolvedValue(existingCount),
          findMany: vi.fn().mockResolvedValue([{ sourceId: String(maxExistingId) }]),
        },
        financialRecord: {
          findMany: vi.fn().mockResolvedValue([]),
        },
      } as unknown as any;

      const discoveredIds = await fetchCatalogTailSourceIds(
        () => client,
        mockPrisma,
        "conn-1",
        { pageDelayMs: 0, knownMaxSourceId: maxExistingId },
      );

      // Verify all 100 new IDs are discovered
      const discoveredSet = new Set(discoveredIds);
      const allFound = expectedNewIds.every((id) => discoveredSet.has(id));
      expect(allFound).toBe(true);
      expect(expectedNewIds.length).toBe(100);
    });

    it("Cenário B: 3 páginas de novos registros (300 IDs novos) — 100% descobertos", async () => {
      // 100 existing pages, 3 new pages (IDs 10001..10300)
      const { client, existingCount, maxExistingId, expectedNewIds } = createCatalogMock(100, 3);

      const mockPrisma = {
        financialRecordSyncItem: {
          count: vi.fn().mockResolvedValue(existingCount),
          findMany: vi.fn().mockResolvedValue([{ sourceId: String(maxExistingId) }]),
        },
        financialRecord: {
          findMany: vi.fn().mockResolvedValue([]),
        },
      } as unknown as any;

      const discoveredIds = await fetchCatalogTailSourceIds(
        () => client,
        mockPrisma,
        "conn-1",
        { pageDelayMs: 0, knownMaxSourceId: maxExistingId },
      );

      const discoveredSet = new Set(discoveredIds);
      const allFound = expectedNewIds.every((id) => discoveredSet.has(id));
      expect(allFound).toBe(true);
      expect(expectedNewIds.length).toBe(300);
    });

    it("Cenário C: 4 páginas de novos registros (400 IDs novos) — 100% descobertos", async () => {
      // 100 existing pages, 4 new pages (IDs 10001..10400)
      const { client, existingCount, maxExistingId, expectedNewIds } = createCatalogMock(100, 4);

      const mockPrisma = {
        financialRecordSyncItem: {
          count: vi.fn().mockResolvedValue(existingCount),
          findMany: vi.fn().mockResolvedValue([{ sourceId: String(maxExistingId) }]),
        },
        financialRecord: {
          findMany: vi.fn().mockResolvedValue([]),
        },
      } as unknown as any;

      const discoveredIds = await fetchCatalogTailSourceIds(
        () => client,
        mockPrisma,
        "conn-1",
        { pageDelayMs: 0, knownMaxSourceId: maxExistingId },
      );

      const discoveredSet = new Set(discoveredIds);
      const allFound = expectedNewIds.every((id) => discoveredSet.has(id));
      expect(allFound).toBe(true);
      expect(expectedNewIds.length).toBe(400);
    });

    it("Cenário D: 10 páginas de novos registros (1000 IDs novos) — 100% descobertos", async () => {
      // 100 existing pages, 10 new pages (IDs 10001..11000)
      const { client, existingCount, maxExistingId, expectedNewIds } = createCatalogMock(100, 10);

      const mockPrisma = {
        financialRecordSyncItem: {
          count: vi.fn().mockResolvedValue(existingCount),
          findMany: vi.fn().mockResolvedValue([{ sourceId: String(maxExistingId) }]),
        },
        financialRecord: {
          findMany: vi.fn().mockResolvedValue([]),
        },
      } as unknown as any;

      const discoveredIds = await fetchCatalogTailSourceIds(
        () => client,
        mockPrisma,
        "conn-1",
        { pageDelayMs: 0, knownMaxSourceId: maxExistingId },
      );

      const discoveredSet = new Set(discoveredIds);
      const allFound = expectedNewIds.every((id) => discoveredSet.has(id));
      expect(allFound).toBe(true);
      expect(expectedNewIds.length).toBe(1000);
    });

    it("Cenário E: Deslocamento de catálogo (deletions / boundary shift) aciona step-back e recupera 100% dos IDs", async () => {
      // Suppose local DB recorded knownCount = 10500, but catalog was shifted and new IDs began on page 98
      // startPage initially computed as 105 - 2 = 103, where firstId is 10301 > knownMaxId (9800)
      const { client, expectedNewIds } = createCatalogMock(97, 5); // pages 98..102 are new (IDs 9701..10200)

      const mockPrisma = {
        financialRecordSyncItem: {
          count: vi.fn().mockResolvedValue(10500), // skewed high count
          findMany: vi.fn().mockResolvedValue([{ sourceId: "9700" }]),
        },
        financialRecord: {
          findMany: vi.fn().mockResolvedValue([]),
        },
      } as unknown as any;

      const discoveredIds = await fetchCatalogTailSourceIds(
        () => client,
        mockPrisma,
        "conn-1",
        { pageDelayMs: 0, knownMaxSourceId: 9700 },
      );

      const discoveredSet = new Set(discoveredIds);
      const allFound = expectedNewIds.every((id) => discoveredSet.has(id));
      expect(allFound).toBe(true);
      expect(expectedNewIds.length).toBe(500);
    });
  });
});
