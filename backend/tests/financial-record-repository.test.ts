import { describe, it, expect, vi } from "vitest";
import { Prisma, type PrismaClient } from "@prisma/client";
import { createFinancialRecordRepository } from "../src/modules/financial/financial-record-repository.js";
import type { NormalizedFinancialRecord } from "../src/integrations/tagplus/financial/financial-record-normalizer.js";

describe("financial-record-repository", () => {
  const sampleRecord: NormalizedFinancialRecord = {
    sourceId: "10469",
    type: "ENTRADA",
    isConfirmed: true,
    isTransfer: false,
    description: "Lançamento NF 2751",
    documentNumber: "000002751001",
    linkedMovementNumber: "55 - 2751",
    dueDate: new Date(Date.UTC(2026, 1, 19)),
    confirmationDate: new Date(Date.UTC(2026, 1, 23)),
    sourceCompetenceDate: new Date(Date.UTC(2026, 0, 15)),
    postingDate: new Date(Date.UTC(2026, 0, 15)),
    sourceUpdatedAt: new Date(Date.UTC(2026, 1, 23, 10, 13, 18)),
    originalAmount: new Prisma.Decimal(696.67),
    grossAmount: new Prisma.Decimal(696.67),
    paidAmount: new Prisma.Decimal(696.67),
    totalAmount: new Prisma.Decimal(696.67),
    discountAmount: new Prisma.Decimal(0),
    surchargeAmount: new Prisma.Decimal(0),
    lateInterestAmount: new Prisma.Decimal(0),
    dailyInterestRate: new Prisma.Decimal(0),
    installmentNumber: 1,
    installmentCount: 3,
    budgetPlanSourceId: "1",
    bankAccountSourceId: "4",
    paymentMethodSourceId: "2",
    departmentSourceId: "1",
    entitySourceId: "24",
    entityType: "C",
    entityName: "BLEND SHOP LTDA",
    linkedInvoiceInstallmentSourceId: "8638",
    sourcePayload: { id: 10469, descricao: "Lançamento NF 2751" },
  };

  it("inserts new record when not existing", async () => {
    const mockPrisma = {
      financialRecord: {
        findUnique: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockResolvedValue({ id: "uuid-created" }),
      },
    } as unknown as PrismaClient;

    const repo = createFinancialRecordRepository(mockPrisma);
    const result = await repo.saveFinancialRecord("conn-1", sampleRecord);

    expect(result.action).toBe("inserted");
    expect(result.id).toBe("uuid-created");
    expect(mockPrisma.financialRecord.create).toHaveBeenCalledTimes(1);
    expect(mockPrisma.financialRecord.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          sourceId: "10469",
          sourcePresent: true,
          noLongerObservedAt: null,
        }),
      }),
    );
  });

  it("marks unchanged when record in DB is identical", async () => {
    const existingInDb = {
      id: "uuid-existing",
      connectionId: "conn-1",
      sourceId: "10469",
      type: "ENTRADA",
      isConfirmed: true,
      isTransfer: false,
      description: "Lançamento NF 2751",
      documentNumber: "000002751001",
      linkedMovementNumber: "55 - 2751",
      dueDate: new Date(Date.UTC(2026, 1, 19)),
      confirmationDate: new Date(Date.UTC(2026, 1, 23)),
      sourceCompetenceDate: new Date(Date.UTC(2026, 0, 15)),
      postingDate: new Date(Date.UTC(2026, 0, 15)),
      sourceUpdatedAt: new Date(Date.UTC(2026, 1, 23, 10, 13, 18)),
      originalAmount: new Prisma.Decimal(696.67),
      grossAmount: new Prisma.Decimal(696.67),
      paidAmount: new Prisma.Decimal(696.67),
      totalAmount: new Prisma.Decimal(696.67),
      discountAmount: new Prisma.Decimal(0),
      surchargeAmount: new Prisma.Decimal(0),
      lateInterestAmount: new Prisma.Decimal(0),
      dailyInterestRate: new Prisma.Decimal(0),
      installmentNumber: 1,
      installmentCount: 3,
      budgetPlanSourceId: "1",
      bankAccountSourceId: "4",
      paymentMethodSourceId: "2",
      departmentSourceId: "1",
      entitySourceId: "24",
      entityType: "C",
      entityName: "BLEND SHOP LTDA",
      linkedInvoiceInstallmentSourceId: "8638",
      sourcePayload: { id: 10469, descricao: "Lançamento NF 2751" },
      sourcePresent: true,
      noLongerObservedAt: null,
    };

    const mockPrisma = {
      financialRecord: {
        findUnique: vi.fn().mockResolvedValue(existingInDb),
        update: vi.fn().mockResolvedValue(existingInDb),
      },
    } as unknown as PrismaClient;

    const repo = createFinancialRecordRepository(mockPrisma);
    const result = await repo.saveFinancialRecord("conn-1", sampleRecord);

    expect(result.action).toBe("unchanged");
    expect(result.id).toBe("uuid-existing");
    expect(mockPrisma.financialRecord.update).toHaveBeenCalledWith({
      where: { id: "uuid-existing" },
      data: { lastSeenAt: expect.any(Date) },
    });
  });

  it("updates when record in DB has changed and clears noLongerObservedAt", async () => {
    const existingInDb = {
      id: "uuid-existing",
      connectionId: "conn-1",
      sourceId: "10469",
      type: "ENTRADA",
      isConfirmed: false, // Changed from false to true in sampleRecord!
      isTransfer: false,
      description: "Old description",
      dueDate: new Date(Date.UTC(2026, 1, 19)),
      originalAmount: new Prisma.Decimal(500),
      sourcePresent: false, // Re-observed
      noLongerObservedAt: new Date(),
    };

    const mockPrisma = {
      financialRecord: {
        findUnique: vi.fn().mockResolvedValue(existingInDb),
        update: vi.fn().mockResolvedValue(existingInDb),
      },
    } as unknown as PrismaClient;

    const repo = createFinancialRecordRepository(mockPrisma);
    const result = await repo.saveFinancialRecord("conn-1", sampleRecord);

    expect(result.action).toBe("updated");
    expect(mockPrisma.financialRecord.update).toHaveBeenCalledWith({
      where: { id: "uuid-existing" },
      data: expect.objectContaining({
        isConfirmed: true,
        sourcePresent: true,
        noLongerObservedAt: null,
      }),
    });
  });
});
