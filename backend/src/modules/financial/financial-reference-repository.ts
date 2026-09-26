import { Prisma, type PrismaClient } from "@prisma/client";
import type {
  NormalizedBudgetPlan,
  NormalizedBankAccount,
  NormalizedPaymentMethod,
  NormalizedDepartment,
} from "../../integrations/tagplus/financial/index.js";

export interface UpsertReferenceResult {
  fetched: number;
  inserted: number;
  updated: number;
  unchanged: number;
  noLongerObserved: number;
}

export interface FinancialReferenceRepository {
  saveBudgetPlans(
    connectionId: string,
    plans: NormalizedBudgetPlan[],
    now?: Date,
  ): Promise<UpsertReferenceResult>;

  saveBankAccounts(
    connectionId: string,
    accounts: NormalizedBankAccount[],
    now?: Date,
  ): Promise<UpsertReferenceResult>;

  savePaymentMethods(
    connectionId: string,
    methods: NormalizedPaymentMethod[],
    now?: Date,
  ): Promise<UpsertReferenceResult>;

  saveDepartments(
    connectionId: string,
    departments: NormalizedDepartment[],
    now?: Date,
  ): Promise<UpsertReferenceResult>;
}

function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a == null && b == null) return true;
  if (a === Prisma.JsonNull && b == null) return true;
  if (b === Prisma.JsonNull && a == null) return true;
  if (a == null || b == null) return false;
  if (typeof a !== "object" || typeof b !== "object") return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) {
      if (!deepEqual(a[i], b[i])) return false;
    }
    return true;
  }
  const recordA = a as Record<string, unknown>;
  const recordB = b as Record<string, unknown>;
  const keysA = Object.keys(recordA);
  const keysB = Object.keys(recordB);
  if (keysA.length !== keysB.length) return false;
  for (const key of keysA) {
    if (!Object.prototype.hasOwnProperty.call(recordB, key)) return false;
    if (!deepEqual(recordA[key], recordB[key])) return false;
  }
  return true;
}

export function createFinancialReferenceRepository(
  prisma: Pick<
    PrismaClient,
    | "$transaction"
    | "financialBudgetPlan"
    | "bankAccount"
    | "paymentMethod"
    | "department"
  >,
): FinancialReferenceRepository {
  return {
    async saveBudgetPlans(
      connectionId: string,
      plans: NormalizedBudgetPlan[],
      now = new Date(),
    ): Promise<UpsertReferenceResult> {
      return prisma.$transaction(async (tx) => {
        const existing = await tx.financialBudgetPlan.findMany({
          where: { connectionId },
        });

        const existingMap = new Map(existing.map((p) => [p.sourceId, p]));
        const observedSourceIds = new Set<string>();

        let inserted = 0;
        let updated = 0;
        let unchanged = 0;

        // Step 1: Base upsert (initial insert sets parentSourceId = null to satisfy self-FK)
        for (const plan of plans) {
          observedSourceIds.add(plan.sourceId);
          const current = existingMap.get(plan.sourceId);

          if (!current) {
            await tx.financialBudgetPlan.create({
              data: {
                connectionId,
                sourceId: plan.sourceId,
                description: plan.description,
                parentSourceId: null,
                type: plan.type,
                position: plan.position,
                isProtected: plan.isProtected,
                sourceDreClassification:
                  (plan.sourceDreClassification as Prisma.InputJsonValue) ??
                  Prisma.JsonNull,
                sourcePresent: true,
                noLongerObservedAt: null,
                lastSeenAt: now,
              },
            });
            inserted++;
          } else {
            const hasBaseChanges =
              current.description !== plan.description ||
              (current.type ?? null) !== (plan.type ?? null) ||
              (current.position ?? null) !== (plan.position ?? null) ||
              Boolean(current.isProtected) !== Boolean(plan.isProtected) ||
              !deepEqual(
                current.sourceDreClassification,
                plan.sourceDreClassification,
              ) ||
              current.sourcePresent !== true ||
              current.noLongerObservedAt !== null;

            const hasParentChange =
              (current.parentSourceId ?? null) !== (plan.parentSourceId ?? null);

            if (hasBaseChanges || hasParentChange) {
              updated++;
              await tx.financialBudgetPlan.update({
                where: {
                  connectionId_sourceId: {
                    connectionId,
                    sourceId: plan.sourceId,
                  },
                },
                data: {
                  description: plan.description,
                  type: plan.type,
                  position: plan.position,
                  isProtected: plan.isProtected,
                  sourceDreClassification:
                    (plan.sourceDreClassification as Prisma.InputJsonValue) ??
                    Prisma.JsonNull,
                  sourcePresent: true,
                  noLongerObservedAt: null,
                  lastSeenAt: now,
                },
              });
            } else {
              unchanged++;
              await tx.financialBudgetPlan.update({
                where: {
                  connectionId_sourceId: {
                    connectionId,
                    sourceId: plan.sourceId,
                  },
                },
                data: {
                  lastSeenAt: now,
                },
              });
            }
          }
        }

        // Step 2: Relink parentSourceId only if changed or newly inserted
        for (const plan of plans) {
          const current = existingMap.get(plan.sourceId);
          const targetParent =
            plan.parentSourceId && observedSourceIds.has(plan.parentSourceId)
              ? plan.parentSourceId
              : null;

          if (!current || (current.parentSourceId ?? null) !== targetParent) {
            await tx.financialBudgetPlan.update({
              where: {
                connectionId_sourceId: {
                  connectionId,
                  sourceId: plan.sourceId,
                },
              },
              data: {
                parentSourceId: targetParent,
              },
            });
          }
        }

        // Step 3: Full scan reconciliation for unobserved records
        let noLongerObserved = 0;
        for (const prev of existing) {
          if (!observedSourceIds.has(prev.sourceId)) {
            if (prev.sourcePresent) {
              await tx.financialBudgetPlan.update({
                where: {
                  connectionId_sourceId: {
                    connectionId,
                    sourceId: prev.sourceId,
                  },
                },
                data: {
                  sourcePresent: false,
                  noLongerObservedAt: now,
                },
              });
              noLongerObserved++;
            }
          }
        }

        return {
          fetched: plans.length,
          inserted,
          updated,
          unchanged,
          noLongerObserved,
        };
      });
    },

    async saveBankAccounts(
      connectionId: string,
      accounts: NormalizedBankAccount[],
      now = new Date(),
    ): Promise<UpsertReferenceResult> {
      return prisma.$transaction(async (tx) => {
        const existing = await tx.bankAccount.findMany({
          where: { connectionId },
        });

        const existingMap = new Map(existing.map((a) => [a.sourceId, a]));
        const observedSourceIds = new Set<string>();

        let inserted = 0;
        let updated = 0;
        let unchanged = 0;

        for (const acc of accounts) {
          observedSourceIds.add(acc.sourceId);
          const current = existingMap.get(acc.sourceId);

          if (!current) {
            await tx.bankAccount.create({
              data: {
                connectionId,
                sourceId: acc.sourceId,
                description: acc.description,
                rawDetails:
                  (acc.rawDetails as Prisma.InputJsonValue) ?? Prisma.JsonNull,
                sourcePresent: true,
                noLongerObservedAt: null,
                lastSeenAt: now,
              },
            });
            inserted++;
          } else {
            const hasChanges =
              current.description !== acc.description ||
              !deepEqual(current.rawDetails, acc.rawDetails) ||
              current.sourcePresent !== true ||
              current.noLongerObservedAt !== null;

            if (hasChanges) {
              updated++;
              await tx.bankAccount.update({
                where: {
                  connectionId_sourceId: {
                    connectionId,
                    sourceId: acc.sourceId,
                  },
                },
                data: {
                  description: acc.description,
                  rawDetails:
                    (acc.rawDetails as Prisma.InputJsonValue) ??
                    Prisma.JsonNull,
                  sourcePresent: true,
                  noLongerObservedAt: null,
                  lastSeenAt: now,
                },
              });
            } else {
              unchanged++;
              await tx.bankAccount.update({
                where: {
                  connectionId_sourceId: {
                    connectionId,
                    sourceId: acc.sourceId,
                  },
                },
                data: {
                  lastSeenAt: now,
                },
              });
            }
          }
        }

        let noLongerObserved = 0;
        for (const prev of existing) {
          if (!observedSourceIds.has(prev.sourceId)) {
            if (prev.sourcePresent) {
              await tx.bankAccount.update({
                where: {
                  connectionId_sourceId: {
                    connectionId,
                    sourceId: prev.sourceId,
                  },
                },
                data: {
                  sourcePresent: false,
                  noLongerObservedAt: now,
                },
              });
              noLongerObserved++;
            }
          }
        }

        return {
          fetched: accounts.length,
          inserted,
          updated,
          unchanged,
          noLongerObserved,
        };
      });
    },

    async savePaymentMethods(
      connectionId: string,
      methods: NormalizedPaymentMethod[],
      now = new Date(),
    ): Promise<UpsertReferenceResult> {
      return prisma.$transaction(async (tx) => {
        const existing = await tx.paymentMethod.findMany({
          where: { connectionId },
        });

        const existingMap = new Map(existing.map((m) => [m.sourceId, m]));
        const observedSourceIds = new Set<string>();

        let inserted = 0;
        let updated = 0;
        let unchanged = 0;

        for (const m of methods) {
          observedSourceIds.add(m.sourceId);
          const current = existingMap.get(m.sourceId);

          if (!current) {
            await tx.paymentMethod.create({
              data: {
                connectionId,
                sourceId: m.sourceId,
                description: m.description,
                sourceActive: m.sourceActive,
                sourcePresent: true,
                noLongerObservedAt: null,
                lastSeenAt: now,
              },
            });
            inserted++;
          } else {
            const hasChanges =
              current.description !== m.description ||
              current.sourceActive !== m.sourceActive ||
              current.sourcePresent !== true ||
              current.noLongerObservedAt !== null;

            if (hasChanges) {
              updated++;
              await tx.paymentMethod.update({
                where: {
                  connectionId_sourceId: {
                    connectionId,
                    sourceId: m.sourceId,
                  },
                },
                data: {
                  description: m.description,
                  sourceActive: m.sourceActive,
                  sourcePresent: true,
                  noLongerObservedAt: null,
                  lastSeenAt: now,
                },
              });
            } else {
              unchanged++;
              await tx.paymentMethod.update({
                where: {
                  connectionId_sourceId: {
                    connectionId,
                    sourceId: m.sourceId,
                  },
                },
                data: {
                  lastSeenAt: now,
                },
              });
            }
          }
        }

        let noLongerObserved = 0;
        for (const prev of existing) {
          if (!observedSourceIds.has(prev.sourceId)) {
            if (prev.sourcePresent) {
              await tx.paymentMethod.update({
                where: {
                  connectionId_sourceId: {
                    connectionId,
                    sourceId: prev.sourceId,
                  },
                },
                data: {
                  sourcePresent: false,
                  noLongerObservedAt: now,
                },
              });
              noLongerObserved++;
            }
          }
        }

        return {
          fetched: methods.length,
          inserted,
          updated,
          unchanged,
          noLongerObserved,
        };
      });
    },

    async saveDepartments(
      connectionId: string,
      departments: NormalizedDepartment[],
      now = new Date(),
    ): Promise<UpsertReferenceResult> {
      return prisma.$transaction(async (tx) => {
        const existing = await tx.department.findMany({
          where: { connectionId },
        });

        const existingMap = new Map(existing.map((d) => [d.sourceId, d]));
        const observedSourceIds = new Set<string>();

        let inserted = 0;
        let updated = 0;
        let unchanged = 0;

        for (const d of departments) {
          observedSourceIds.add(d.sourceId);
          const current = existingMap.get(d.sourceId);

          if (!current) {
            await tx.department.create({
              data: {
                connectionId,
                sourceId: d.sourceId,
                description: d.description,
                sourcePresent: true,
                noLongerObservedAt: null,
                lastSeenAt: now,
              },
            });
            inserted++;
          } else {
            const hasChanges =
              current.description !== d.description ||
              current.sourcePresent !== true ||
              current.noLongerObservedAt !== null;

            if (hasChanges) {
              updated++;
              await tx.department.update({
                where: {
                  connectionId_sourceId: {
                    connectionId,
                    sourceId: d.sourceId,
                  },
                },
                data: {
                  description: d.description,
                  sourcePresent: true,
                  noLongerObservedAt: null,
                  lastSeenAt: now,
                },
              });
            } else {
              unchanged++;
              await tx.department.update({
                where: {
                  connectionId_sourceId: {
                    connectionId,
                    sourceId: d.sourceId,
                  },
                },
                data: {
                  lastSeenAt: now,
                },
              });
            }
          }
        }

        let noLongerObserved = 0;
        for (const prev of existing) {
          if (!observedSourceIds.has(prev.sourceId)) {
            if (prev.sourcePresent) {
              await tx.department.update({
                where: {
                  connectionId_sourceId: {
                    connectionId,
                    sourceId: prev.sourceId,
                  },
                },
                data: {
                  sourcePresent: false,
                  noLongerObservedAt: now,
                },
              });
              noLongerObserved++;
            }
          }
        }

        return {
          fetched: departments.length,
          inserted,
          updated,
          unchanged,
          noLongerObserved,
        };
      });
    },
  };
}
