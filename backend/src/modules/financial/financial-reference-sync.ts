import type { TagPlusClient } from "../../integrations/tagplus/tagplus-client.js";
import {
  normalizeTagPlusBudgetPlan,
  normalizeTagPlusBankAccount,
  normalizeTagPlusPaymentMethod,
  normalizeTagPlusDepartment,
  type RawTagPlusBudgetPlan,
  type RawTagPlusBankAccount,
  type RawTagPlusPaymentMethod,
  type RawTagPlusDepartment,
} from "../../integrations/tagplus/financial/index.js";
import type {
  FinancialReferenceRepository,
  UpsertReferenceResult,
} from "./financial-reference-repository.js";

export interface FinancialReferenceSyncResult {
  budgetPlans: UpsertReferenceResult;
  bankAccounts: UpsertReferenceResult;
  paymentMethods: UpsertReferenceResult;
  departments: UpsertReferenceResult;
}

export async function fetchAllPages<T>(
  client: TagPlusClient,
  endpoint: string,
  perPage = 100,
): Promise<T[]> {
  const all: T[] = [];
  let page = 1;

  while (true) {
    const separator = endpoint.includes("?") ? "&" : "?";
    const path = `${endpoint}${separator}page=${page}&per_page=${perPage}`;
    const response = await client.get<T[]>(path);
    const items = Array.isArray(response.data) ? response.data : [];

    if (items.length === 0) {
      break;
    }

    all.push(...items);

    if (items.length < perPage) {
      break;
    }

    page++;
  }

  return all;
}

export interface FinancialReferenceSyncService {
  syncAll(
    connectionId: string,
    client: TagPlusClient,
    now?: Date,
  ): Promise<FinancialReferenceSyncResult>;

  syncBudgetPlans(
    connectionId: string,
    client: TagPlusClient,
    now?: Date,
  ): Promise<UpsertReferenceResult>;

  syncBankAccounts(
    connectionId: string,
    client: TagPlusClient,
    now?: Date,
  ): Promise<UpsertReferenceResult>;

  syncPaymentMethods(
    connectionId: string,
    client: TagPlusClient,
    now?: Date,
  ): Promise<UpsertReferenceResult>;

  syncDepartments(
    connectionId: string,
    client: TagPlusClient,
    now?: Date,
  ): Promise<UpsertReferenceResult>;
}

export function createFinancialReferenceSyncService(
  repository: FinancialReferenceRepository,
): FinancialReferenceSyncService {
  async function syncBudgetPlans(
    connectionId: string,
    client: TagPlusClient,
    now = new Date(),
  ): Promise<UpsertReferenceResult> {
    const rawItems = await fetchAllPages<RawTagPlusBudgetPlan>(
      client,
      "/planos_orcamentarios",
    );
    const normalized = rawItems.map(normalizeTagPlusBudgetPlan);
    return repository.saveBudgetPlans(connectionId, normalized, now);
  }

  async function syncBankAccounts(
    connectionId: string,
    client: TagPlusClient,
    now = new Date(),
  ): Promise<UpsertReferenceResult> {
    const rawItems = await fetchAllPages<RawTagPlusBankAccount>(
      client,
      "/contas",
    );
    const normalized = rawItems.map(normalizeTagPlusBankAccount);
    return repository.saveBankAccounts(connectionId, normalized, now);
  }

  async function syncPaymentMethods(
    connectionId: string,
    client: TagPlusClient,
    now = new Date(),
  ): Promise<UpsertReferenceResult> {
    const rawItems = await fetchAllPages<RawTagPlusPaymentMethod>(
      client,
      "/formas_pagamento",
    );
    const normalized = rawItems.map(normalizeTagPlusPaymentMethod);
    return repository.savePaymentMethods(connectionId, normalized, now);
  }

  async function syncDepartments(
    connectionId: string,
    client: TagPlusClient,
    now = new Date(),
  ): Promise<UpsertReferenceResult> {
    const rawItems = await fetchAllPages<RawTagPlusDepartment>(
      client,
      "/departamentos",
    );
    const normalized = rawItems.map(normalizeTagPlusDepartment);
    return repository.saveDepartments(connectionId, normalized, now);
  }

  async function syncAll(
    connectionId: string,
    client: TagPlusClient,
    now = new Date(),
  ): Promise<FinancialReferenceSyncResult> {
    const [budgetPlans, bankAccounts, paymentMethods, departments] =
      await Promise.all([
        syncBudgetPlans(connectionId, client, now),
        syncBankAccounts(connectionId, client, now),
        syncPaymentMethods(connectionId, client, now),
        syncDepartments(connectionId, client, now),
      ]);

    return {
      budgetPlans,
      bankAccounts,
      paymentMethods,
      departments,
    };
  }

  return {
    syncAll,
    syncBudgetPlans,
    syncBankAccounts,
    syncPaymentMethods,
    syncDepartments,
  };
}
