import fs from "fs";
import path from "path";
import dotenv from "dotenv";
import { PrismaClient, OperationUnit } from "@prisma/client";
import { createBiRepository } from "../modules/bi/bi-repository.js";
import { createPrismaFinancialDreRepository } from "../modules/financial/financial-dre-repository.js";
import { createFinancialDreService } from "../modules/financial/financial-dre-service.js";
import { assertSafeDatabaseUrl } from "../modules/historical/hustler/hustler-financial-planner.js";

const envDevPath = path.resolve(process.cwd(), "backend/.env.development");
const fallbackEnvDevPath = path.resolve(process.cwd(), ".env.development");
const targetEnvPath = fs.existsSync(envDevPath) ? envDevPath : fallbackEnvDevPath;
if (fs.existsSync(targetEnvPath)) {
  dotenv.config({ path: targetEnvPath, override: true });
}

const dbUrl = process.env.DATABASE_URL || "";
const directUrl = process.env.DIRECT_URL || "";
assertSafeDatabaseUrl(dbUrl, directUrl);

const prisma = new PrismaClient();

async function run() {
  try {
    const biRepo = createBiRepository(prisma);
    const dreRepo = createPrismaFinancialDreRepository(prisma, biRepo);
    const dreService = createFinancialDreService(dreRepo);

    const period = { from: "2026-01-01", to: "2026-10-31" };

    console.log("==================================================");
    console.log("VALIDATION OF THE THREE DRE VIEWS POST-BACKFILL");
    console.log("==================================================");

    // A. Consolidado
    const resAll = await dreService.getDreSummary(period);
    // B. Nineclouds
    const resNc = await dreService.getDreSummary({ ...period, operationUnit: OperationUnit.NINECLOUDS });
    // C. Hustler
    const resHustler = await dreService.getDreSummary({ ...period, operationUnit: OperationUnit.HUSTLER });

    const tableData = [
      {
        visão: "A. CONSOLIDADO",
        receita: resAll.data?.totals.realizedRevenue,
        cmv: resAll.data?.totals.estimatedCOGS,
        lucroBruto: resAll.data?.totals.estimatedGrossProfit,
        despesasVariaveis: resAll.data?.totals.variableExpenses.total,
        margemContribuicao: resAll.data?.totals.contributionMargin,
        despesasOperacionais: resAll.data?.totals.operatingExpenses.total,
        resultadoOperacional: resAll.data?.totals.partialManagerialResultOnCoveredRevenue,
        coberturaCusto: resAll.data?.totals.costCoveragePercent,
        breakEvenStatus: resAll.data?.totals.breakEven?.status,
      },
      {
        visão: "B. NINECLOUDS",
        receita: resNc.data?.totals.realizedRevenue,
        cmv: resNc.data?.totals.estimatedCOGS,
        lucroBruto: resNc.data?.totals.estimatedGrossProfit,
        despesasVariaveis: resNc.data?.totals.variableExpenses.total,
        margemContribuicao: resNc.data?.totals.contributionMargin,
        despesasOperacionais: resNc.data?.totals.operatingExpenses.total,
        resultadoOperacional: resNc.data?.totals.partialManagerialResultOnCoveredRevenue,
        coberturaCusto: resNc.data?.totals.costCoveragePercent,
        breakEvenStatus: resNc.data?.totals.breakEven?.status,
      },
      {
        visão: "C. HUSTLER",
        receita: resHustler.data?.totals.realizedRevenue,
        cmv: resHustler.data?.totals.estimatedCOGS,
        lucroBruto: resHustler.data?.totals.estimatedGrossProfit,
        despesasVariaveis: resHustler.data?.totals.variableExpenses.total,
        margemContribuicao: resHustler.data?.totals.contributionMargin,
        despesasOperacionais: resHustler.data?.totals.operatingExpenses.total,
        resultadoOperacional: resHustler.data?.totals.partialManagerialResultOnCoveredRevenue,
        coberturaCusto: resHustler.data?.totals.costCoveragePercent,
        breakEvenStatus: resHustler.data?.totals.breakEven?.status,
      },
    ];

    console.table(tableData);

    // Sum check: Nineclouds + Hustler == Consolidado?
    const sumRev = (resNc.data?.totals.realizedRevenue || 0) + (resHustler.data?.totals.realizedRevenue || 0);
    const sumCogs = (resNc.data?.totals.estimatedCOGS || 0) + (resHustler.data?.totals.estimatedCOGS || 0);
    const sumOpex = (resNc.data?.totals.operatingExpenses.total || 0) + (resHustler.data?.totals.operatingExpenses.total || 0);

    console.log("\n--- RECONCILIATION INTEGRITY CHECK ---");
    console.log(`Nineclouds (R$ ${resNc.data?.totals.realizedRevenue}) + Hustler (R$ ${resHustler.data?.totals.realizedRevenue}) = R$ ${sumRev.toFixed(2)}`);
    console.log(`Consolidado Realized Revenue: R$ ${resAll.data?.totals.realizedRevenue}`);
    console.log(`Revenue Match: ${Math.abs(sumRev - (resAll.data?.totals.realizedRevenue || 0)) < 0.01 ? "EXACT MATCH (YES)" : "MISMATCH (NO)"}`);

    console.log(`Nineclouds COGS (R$ ${resNc.data?.totals.estimatedCOGS}) + Hustler COGS (R$ ${resHustler.data?.totals.estimatedCOGS}) = R$ ${sumCogs.toFixed(2)}`);
    console.log(`Consolidado COGS: R$ ${resAll.data?.totals.estimatedCOGS}`);
    console.log(`COGS Match: ${Math.abs(sumCogs - (resAll.data?.totals.estimatedCOGS || 0)) < 0.01 ? "EXACT MATCH (YES)" : "MISMATCH (NO)"}`);

    console.log(`Nineclouds Opex (R$ ${resNc.data?.totals.operatingExpenses.total}) + Hustler Opex (R$ ${resHustler.data?.totals.operatingExpenses.total}) = R$ ${sumOpex.toFixed(2)}`);
    console.log(`Consolidado Opex: R$ ${resAll.data?.totals.operatingExpenses.total}`);
    console.log(`Opex Match: ${Math.abs(sumOpex - (resAll.data?.totals.operatingExpenses.total || 0)) < 0.01 ? "EXACT MATCH (YES)" : "MISMATCH (NO)"}`);

    // Check BI Sales Overview as well
    console.log("\n--- BI SALES OVERVIEW POST-BACKFILL ---");
    const biSalesAll = await biRepo.findRealizedSales(new Date("2026-01-01T00:00:00.000Z"), new Date("2026-11-01T00:00:00.000Z"), {});
    const biSalesNc = await biRepo.findRealizedSales(new Date("2026-01-01T00:00:00.000Z"), new Date("2026-11-01T00:00:00.000Z"), { operationUnit: OperationUnit.NINECLOUDS });
    const biSalesHustler = await biRepo.findRealizedSales(new Date("2026-01-01T00:00:00.000Z"), new Date("2026-11-01T00:00:00.000Z"), { operationUnit: OperationUnit.HUSTLER });

    const biRevAll = biSalesAll.reduce((s, r) => s + Number(r.netAmount), 0);
    const biRevNc = biSalesNc.reduce((s, r) => s + Number(r.netAmount), 0);
    const biRevHustler = biSalesHustler.reduce((s, r) => s + Number(r.netAmount), 0);

    console.log(`BI Consolidado: ${biSalesAll.length} vendas, R$ ${biRevAll.toFixed(2)}`);
    console.log(`BI Nineclouds:  ${biSalesNc.length} vendas, R$ ${biRevNc.toFixed(2)}`);
    console.log(`BI Hustler:     ${biSalesHustler.length} vendas, R$ ${biRevHustler.toFixed(2)}`);
    console.log(`BI Nineclouds + Hustler = ${biSalesNc.length + biSalesHustler.length} vendas, R$ ${(biRevNc + biRevHustler).toFixed(2)}`);

  } finally {
    await prisma.$disconnect();
  }
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
