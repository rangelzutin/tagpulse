import { describe, expect, it, vi } from "vitest";
import {
  fetchAllPages,
  createFinancialReferenceSyncService,
} from "../src/modules/financial/financial-reference-sync.js";
import type { TagPlusClient } from "../src/integrations/tagplus/tagplus-client.js";
import type { FinancialReferenceRepository } from "../src/modules/financial/financial-reference-repository.js";

describe("Financial Reference Sync Service", () => {
  it("fetchAllPages fetches until array is shorter than perPage", async () => {
    const pages: Record<string, unknown[]> = {
      "/planos_orcamentarios?page=1&per_page=2": [{ id: 1 }, { id: 2 }],
      "/planos_orcamentarios?page=2&per_page=2": [{ id: 3 }],
    };

    const mockClient: TagPlusClient = {
      async get<T>(path: string) {
        const data = (pages[path] ?? []) as T;
        return {
          status: 200,
          data,
          paginationHeaders: {},
        };
      },
    };

    const results = await fetchAllPages(mockClient, "/planos_orcamentarios", 2);
    expect(results).toHaveLength(3);
    expect(results).toEqual([{ id: 1 }, { id: 2 }, { id: 3 }]);
  });

  it("syncAll orchestrates all 4 reference models correctly", async () => {
    const endpointsData: Record<string, unknown[]> = {
      "/planos_orcamentarios?page=1&per_page=100": [
        { id: 1, descricao: "Receitas", tipo: "E", posicao: "1" },
      ],
      "/contas?page=1&per_page=100": [
        { id: 10, descricao: "Itaú", banco: "341" },
      ],
      "/formas_pagamento?page=1&per_page=100": [
        { id: 100, descricao: "Boleto", ativo: true },
      ],
      "/departamentos?page=1&per_page=100": [
        { id: 50, descricao: "Administrativo" },
      ],
    };

    const mockClient: TagPlusClient = {
      async get<T>(path: string) {
        return {
          status: 200,
          data: (endpointsData[path] ?? []) as T,
          paginationHeaders: {},
        };
      },
    };

    const mockRepo: FinancialReferenceRepository = {
      saveBudgetPlans: vi.fn().mockResolvedValue({
        fetched: 1,
        inserted: 1,
        updated: 0,
        unchanged: 0,
        noLongerObserved: 0,
      }),
      saveBankAccounts: vi.fn().mockResolvedValue({
        fetched: 1,
        inserted: 1,
        updated: 0,
        unchanged: 0,
        noLongerObserved: 0,
      }),
      savePaymentMethods: vi.fn().mockResolvedValue({
        fetched: 1,
        inserted: 1,
        updated: 0,
        unchanged: 0,
        noLongerObserved: 0,
      }),
      saveDepartments: vi.fn().mockResolvedValue({
        fetched: 1,
        inserted: 1,
        updated: 0,
        unchanged: 0,
        noLongerObserved: 0,
      }),
    };

    const service = createFinancialReferenceSyncService(mockRepo);
    const result = await service.syncAll("conn-test-1", mockClient);

    expect(mockRepo.saveBudgetPlans).toHaveBeenCalledWith(
      "conn-test-1",
      expect.arrayContaining([
        expect.objectContaining({ sourceId: "1", description: "Receitas" }),
      ]),
      expect.any(Date),
    );

    expect(mockRepo.saveBankAccounts).toHaveBeenCalledWith(
      "conn-test-1",
      expect.arrayContaining([
        expect.objectContaining({ sourceId: "10", description: "Itaú" }),
      ]),
      expect.any(Date),
    );

    expect(mockRepo.savePaymentMethods).toHaveBeenCalledWith(
      "conn-test-1",
      expect.arrayContaining([
        expect.objectContaining({ sourceId: "100", description: "Boleto", sourceActive: true }),
      ]),
      expect.any(Date),
    );

    expect(mockRepo.saveDepartments).toHaveBeenCalledWith(
      "conn-test-1",
      expect.arrayContaining([
        expect.objectContaining({ sourceId: "50", description: "Administrativo" }),
      ]),
      expect.any(Date),
    );

    expect(result.budgetPlans.inserted).toBe(1);
    expect(result.bankAccounts.inserted).toBe(1);
    expect(result.paymentMethods.inserted).toBe(1);
    expect(result.departments.inserted).toBe(1);
  });
});
