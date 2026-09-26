import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { loadEnv } from "../config/env.js";
import { createTagPlusClient } from "../integrations/tagplus/tagplus-client.js";
import { createTagPlusOAuthTokenStore } from "../integrations/tagplus/oauth-token-store.js";
import { ensureTagPlusConnection } from "./ensure-tagplus-connection.js";
import { createFinancialReferenceRepository } from "../modules/financial/financial-reference-repository.js";
import { createFinancialReferenceSyncService } from "../modules/financial/financial-reference-sync.js";

async function main() {
  const env = loadEnv();
  const prisma = new PrismaClient();

  try {
    const connection = await ensureTagPlusConnection(prisma);
    console.log(`Connection resolved: ${connection.name} (id: ${connection.id})`);

    const tokenStore = createTagPlusOAuthTokenStore();
    const tokens = tokenStore.get();
    const token = tokens?.accessToken || env.TAGPLUS_ACCESS_TOKEN;

    if (!token) {
      throw new Error("No TagPlus OAuth access token available");
    }

    const client = createTagPlusClient({
      baseUrl: env.TAGPLUS_BASE_URL,
      apiVersion: connection.apiVersion,
      accessToken: token,
    });

    const repository = createFinancialReferenceRepository(prisma);
    const syncService = createFinancialReferenceSyncService(repository);

    console.log("\nStarting Financial Reference Data Sync...");
    const result = await syncService.syncAll(connection.id, client);

    console.log("\n=== SYNC REALIZADO COM SUCESSO ===");
    console.log("FinancialBudgetPlan:", JSON.stringify(result.budgetPlans, null, 2));
    console.log("BankAccount:", JSON.stringify(result.bankAccounts, null, 2));
    console.log("PaymentMethod:", JSON.stringify(result.paymentMethods, null, 2));
    console.log("Department:", JSON.stringify(result.departments, null, 2));

    // Verify actual DB counts
    const dbBudgetPlans = await prisma.financialBudgetPlan.count({ where: { connectionId: connection.id } });
    const dbBankAccounts = await prisma.bankAccount.count({ where: { connectionId: connection.id } });
    const dbPaymentMethods = await prisma.paymentMethod.count({ where: { connectionId: connection.id } });
    const dbDepartments = await prisma.department.count({ where: { connectionId: connection.id } });

    console.log("\n=== CONTAGENS RECONCILIADAS NO POSTGRES ===");
    console.log(`FinancialBudgetPlan: ${dbBudgetPlans}`);
    console.log(`BankAccount: ${dbBankAccounts}`);
    console.log(`PaymentMethod: ${dbPaymentMethods}`);
    console.log(`Department: ${dbDepartments}`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error("\n❌ ERRO NA SINCRONIZAÇÃO:", err?.message || err);
  process.exitCode = 1;
});
