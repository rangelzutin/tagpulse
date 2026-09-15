import { PrismaClient } from "@prisma/client";
import { createBiRepository } from "../modules/bi/bi-repository.js";
import { createBiService } from "../modules/bi/bi-service.js";

async function runAudit() {
  const prisma = new PrismaClient();
  const repo = createBiRepository(prisma);
  const service = createBiService(repo);

  try {
    console.log("==================================================");
    console.log("   AUDITORIA MANUAL DA BASE REAL: ESTOQUE & GIRO  ");
    console.log("==================================================");

    // Medição de tempo real Cold vs Warm
    const t0 = performance.now();
    const resCold = await service.getInventoryOverview(90);
    const dCold = performance.now() - t0;

    const t1 = performance.now();
    const res30 = await service.getInventoryOverview(30);
    const d30 = performance.now() - t1;

    const t2 = performance.now();
    const res90 = await service.getInventoryOverview(90);
    const d90 = performance.now() - t2;

    const t3 = performance.now();
    const res180 = await service.getInventoryOverview(180);
    const d180 = performance.now() - t3;

    if (!res90.success) {
      console.error("Erro na consulta de 90 dias:", res90.error);
      return;
    }

    console.log(`\n--- TEMPOS DE EXECUÇÃO ---`);
    console.log(`Cold (90d inicial): ${dCold.toFixed(0)} ms`);
    console.log(`Warm (30d):         ${d30.toFixed(0)} ms`);
    console.log(`Warm (90d):         ${d90.toFixed(0)} ms`);
    console.log(`Warm (180d):        ${d180.toFixed(0)} ms`);

    const data = res90.data;
    const s = data.summary;

    console.log(`\n--- SNAPSHOT ATUAL (asOfDate: ${data.asOfDate}) ---`);
    console.log(`Total de produtos:           ${s.totalProducts}`);
    console.log(`Produtos ativos:             ${s.activeProducts}`);
    console.log(`Estoque > 0:                 ${s.productsWithPositiveStock}`);
    console.log(`Estoque = 0:                 ${s.productsWithZeroStock}`);
    console.log(`Estoque < 0:                 ${s.productsWithNegativeStock}`);
    console.log(`Capital a Custo:             R$ ${s.inventoryCostValue.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`);
    console.log(`Valor de Tabela:             R$ ${s.inventoryListValue.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`);

    console.log(`\n--- OPERACIONAL JANELA 90 DIAS ---`);
    console.log(`Produtos com saída física:   ${s.productsSoldInWindow}`);
    console.log(`Demanda sem estoque (total): ${s.demandWithoutStockCount}`);
    console.log(`Demanda sem estoque (ativos):${s.activeDemandWithoutStockCount}`);
    console.log(`Estoque > 0 com vendas:      ${s.productsWithStockAndSales}`);
    console.log(`Estoque > 0 sem vendas:      ${s.productsWithStockNoSales}`);
    console.log(`Capital com vendas:          R$ ${s.capitalWithSales.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`);
    console.log(`Capital sem vendas:          R$ ${s.capitalWithoutSales.toLocaleString("pt-BR", { minimumFractionDigits: 2 })} (${s.capitalWithoutSalesShare.toFixed(2)}%)`);
    console.log(`Inativos com estoque:        ${s.inactiveProductsWithStock} (R$ ${s.inactiveStockCostValue.toLocaleString("pt-BR", { minimumFractionDigits: 2 })})`);

    const c = data.coverageDistribution;
    console.log(`\n--- DISTRIBUIÇÃO DE COBERTURA (ESTOQUE > 0 COM VENDAS) ---`);
    console.log(`< 15 dias:     ${c.lt15}`);
    console.log(`15 a 30 dias:  ${c.from15to30}`);
    console.log(`30 a 45 dias:  ${c.from30to45}`);
    console.log(`45 a 90 dias:  ${c.from45to90}`);
    console.log(`> 90 dias:     ${c.gt90}`);
    console.log(`Total Cobertura Calculada: ${c.totalWithStockAndSales} (soma exata das faixas)`);
    console.log(`Sem saída na janela:       ${c.noSalesInWindow}`);

    console.log(`\n--- TOP 5 DEMANDA SEM ESTOQUE ---`);
    data.products
      .filter((p) => p.operationalFlags.includes("DEMAND_WITHOUT_STOCK"))
      .sort((a, b) => b.quantityInWindow - a.quantityInWindow)
      .slice(0, 5)
      .forEach((p, idx) => {
        console.log(`${idx + 1}. [${p.code}] ${p.description} | Estoque: ${p.currentStock} | Qtd 90d: ${p.quantityInWindow} | Última Saída: ${p.lastPhysicalSaleDate}`);
      });

    console.log(`\n--- TOP 5 MENOR COBERTURA ESTIMADA ---`);
    data.products
      .filter((p) => p.estimatedDaysOfStock !== null && p.estimatedDaysOfStock > 0)
      .sort((a, b) => (a.estimatedDaysOfStock ?? 9999) - (b.estimatedDaysOfStock ?? 9999))
      .slice(0, 5)
      .forEach((p, idx) => {
        console.log(`${idx + 1}. [${p.code}] ${p.description} | Estoque: ${p.currentStock} | Qtd 90d: ${p.quantityInWindow} | Cobertura: ${p.estimatedDaysOfStock?.toFixed(1)} dias`);
      });

    console.log(`\nAuditoria concluída com sucesso.`);
  } finally {
    await prisma.$disconnect();
  }
}

runAudit();
