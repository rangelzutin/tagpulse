import { PrismaClient, type Prisma } from "@prisma/client";

const prisma = new PrismaClient();

async function runAudits() {
  console.log("==================================================");
  console.log("TAGPULSE — FASE 5I AUDITORIA CANÔNICA DE AJUSTES");
  console.log("==================================================");

  const connection = await prisma.tagPlusConnection.findFirst({
    where: { status: "ACTIVE" },
  });

  if (!connection) {
    throw new Error("No active TagPlus connection found");
  }

  const connectionId = connection.id;

  // 1. CONTAGENS GERAIS
  const totalAdjustments = await prisma.stockAdjustment.count({
    where: { connectionId },
  });
  const totalItems = await prisma.stockAdjustmentItem.count({
    where: { stockAdjustment: { connectionId } },
  });
  const totalLinks = await prisma.stockAdjustmentFinancialLink.count({
    where: { stockAdjustment: { connectionId } },
  });
  const totalSyncItems = await prisma.stockAdjustmentSyncItem.count({
    where: { connectionId },
  });
  const syncStatusCounts = await prisma.stockAdjustmentSyncItem.groupBy({
    by: ["status"],
    where: { connectionId },
    _count: true,
  });

  console.log("\n--- 1. CONTAGENS TOTAIS ---");
  console.log(`StockAdjustments           : ${totalAdjustments}`);
  console.log(`StockAdjustmentItems       : ${totalItems}`);
  console.log(`StockAdjustmentFinancialLink: ${totalLinks}`);
  console.log(`StockAdjustmentSyncItems   : ${totalSyncItems}`);
  console.log("Status da fila de sync     :", syncStatusCounts);

  // 2. SEÇÃO 16: AUDITORIA POR TIPO DO AJUSTE
  console.log("\n--- 2. SEÇÃO 16: AUDITORIA POR TIPO DO AJUSTE ---");
  const adjustmentsByType = await prisma.stockAdjustment.groupBy({
    by: ["type"],
    where: { connectionId },
    _count: { id: true },
    _sum: { totalAmount: true },
  });

  console.log("Ajustes por tipo (S, C, E, D):");
  for (const row of adjustmentsByType) {
    console.log(
      `  Tipo ${row.type}: count = ${row._count.id}, valor total = R$ ${row._sum.totalAmount?.toFixed(2)}`,
    );
  }

  // Com links vs sem links por tipo
  console.log("\nAjustes com links vs sem links por tipo:");
  const types = ["S", "C", "E", "D"];
  for (const t of types) {
    const withLinks = await prisma.stockAdjustment.count({
      where: {
        connectionId,
        type: t,
        financialLinks: { some: {} },
      },
    });
    const withoutLinks = await prisma.stockAdjustment.count({
      where: {
        connectionId,
        type: t,
        financialLinks: { none: {} },
      },
    });
    console.log(
      `  Tipo ${t}: com links = ${withLinks}, sem links = ${withoutLinks} (total = ${withLinks + withoutLinks})`,
    );
  }

  // 3. SEÇÃO 17: AUDITORIA FINANCEIRO POR TIPO
  console.log("\n--- 3. SEÇÃO 17: FINANCEIRO POR TIPO DO AJUSTE ---");
  const linksByTypeRaw = await prisma.$queryRaw<
    Array<{
      type: string;
      link_count: bigint;
      distinct_fr_count: bigint;
      total_amount: Prisma.Decimal | null;
      confirmed_amount: Prisma.Decimal | null;
      unconfirmed_amount: Prisma.Decimal | null;
      confirmed_count: bigint;
      unconfirmed_count: bigint;
    }>
  >`
    SELECT
      sa.type,
      COUNT(fl.id) as link_count,
      COUNT(DISTINCT fr.id) as distinct_fr_count,
      SUM(fr.total_amount) as total_amount,
      SUM(CASE WHEN fr.is_confirmed THEN fr.total_amount ELSE 0 END) as confirmed_amount,
      SUM(CASE WHEN NOT fr.is_confirmed THEN fr.total_amount ELSE 0 END) as unconfirmed_amount,
      COUNT(CASE WHEN fr.is_confirmed THEN 1 END) as confirmed_count,
      COUNT(CASE WHEN NOT fr.is_confirmed THEN 1 END) as unconfirmed_count
    FROM stock_adjustment_financial_links fl
    JOIN stock_adjustments sa ON sa.id = fl.stock_adjustment_id
    LEFT JOIN financial_records fr ON fr.id = fl.financial_record_id
    WHERE sa.connection_id = ${connectionId}::uuid
    GROUP BY sa.type
    ORDER BY sa.type
  `;

  for (const row of linksByTypeRaw) {
    console.log(
      `  Tipo ${row.type}: links = ${row.link_count}, distinct FR = ${row.distinct_fr_count}` +
        ` | Total FR = R$ ${row.total_amount ? Number(row.total_amount).toFixed(2) : "0.00"}` +
        ` | Confirmados: ${row.confirmed_count} (R$ ${row.confirmed_amount ? Number(row.confirmed_amount).toFixed(2) : "0.00"})` +
        ` | Não Confirmados: ${row.unconfirmed_count} (R$ ${row.unconfirmed_amount ? Number(row.unconfirmed_amount).toFixed(2) : "0.00"})`,
    );
  }

  // 4. SEÇÃO 18: SAÍDAS (TIPO S) POR PLANO FINANCEIRO
  console.log("\n--- 4. SEÇÃO 18: AJUSTES 'S' POR PLANO FINANCEIRO ---");
  const sByPlanRaw = await prisma.$queryRaw<
    Array<{
      plan_source_id: string | null;
      plan_name: string | null;
      distinct_adjustments: bigint;
      financial_count: bigint;
      financial_total: Prisma.Decimal | null;
      economic_total: Prisma.Decimal | null;
    }>
  >`
    SELECT
      fr.budget_plan_source_id as plan_source_id,
      bp.description as plan_name,
      COUNT(DISTINCT sa.id) as distinct_adjustments,
      COUNT(fr.id) as financial_count,
      SUM(fr.total_amount) as financial_total,
      SUM(sa.total_amount) as economic_total
    FROM stock_adjustment_financial_links fl
    JOIN stock_adjustments sa ON sa.id = fl.stock_adjustment_id
    LEFT JOIN financial_records fr ON fr.id = fl.financial_record_id
    LEFT JOIN financial_budget_plans bp ON bp.source_id = fr.budget_plan_source_id AND bp.connection_id = sa.connection_id
    WHERE sa.connection_id = ${connectionId}::uuid AND sa.type = 'S'
    GROUP BY fr.budget_plan_source_id, bp.description
    ORDER BY financial_total DESC NULLS LAST
  `;

  for (const row of sByPlanRaw) {
    console.log(
      `  Plano [${row.plan_source_id ?? "N/A"}] ${row.plan_name ?? "(Sem Plano)"}: ` +
        `ajustes distintos = ${row.distinct_adjustments}, FRs = ${row.financial_count}, ` +
        `Total Fin = R$ ${row.financial_total ? Number(row.financial_total).toFixed(2) : "0.00"}`,
    );
  }

  // 5. SEÇÃO 19: DUPLICIDADE HISTÓRICA (COMPARAÇÃO VALOR ECONÔMICO VS SOMA FINANCEIRA)
  console.log(
    "\n--- 5. SEÇÃO 19: DUPLICIDADE HISTÓRICA (ECONÔMICO VS FINANCEIRO) ---",
  );
  const compareRaw = await prisma.$queryRaw<
    Array<{
      adjustment_id: string;
      number: number;
      type: string;
      economic_amount: Prisma.Decimal;
      financial_sum: Prisma.Decimal;
      diff: Prisma.Decimal;
    }>
  >`
    SELECT
      sa.id as adjustment_id,
      sa.number,
      sa.type,
      sa.total_amount as economic_amount,
      COALESCE(SUM(fr.total_amount), 0) as financial_sum,
      ABS(sa.total_amount - COALESCE(SUM(fr.total_amount), 0)) as diff
    FROM stock_adjustments sa
    JOIN stock_adjustment_financial_links fl ON fl.stock_adjustment_id = sa.id
    LEFT JOIN financial_records fr ON fr.id = fl.financial_record_id
    WHERE sa.connection_id = ${connectionId}::uuid AND sa.type = 'S'
    GROUP BY sa.id, sa.number, sa.type, sa.total_amount
  `;

  let exactMatches = 0;
  let diffLe001 = 0;
  let diffGt001 = 0;
  const majorDiffs: typeof compareRaw = [];

  for (const row of compareRaw) {
    const diff = Number(row.diff);
    if (diff === 0) {
      exactMatches++;
    } else if (diff <= 0.01) {
      diffLe001++;
    } else {
      diffGt001++;
      majorDiffs.push(row);
    }
  }

  console.log(
    `Total de ajustes S com financeiro analisados: ${compareRaw.length}`,
  );
  console.log(`  Match exato (diff == 0)                   : ${exactMatches}`);
  console.log(`  Diferença <= R$ 0,01                      : ${diffLe001}`);
  console.log(`  Diferença > R$ 0,01                       : ${diffGt001}`);
  if (majorDiffs.length > 0) {
    console.log(`  Exemplos de diferenças > 0,01 (top 5):`);
    for (const d of majorDiffs.slice(0, 5)) {
      console.log(
        `    AE #${d.number}: Econ = R$ ${Number(d.economic_amount).toFixed(2)}, Fin = R$ ${Number(d.financial_sum).toFixed(2)}, Diff = R$ ${Number(d.diff).toFixed(2)}`,
      );
    }
  }

  // 6. SEÇÃO 20: AJUSTES S SEM FINANCEIRO POR ANO
  console.log("\n--- 6. SEÇÃO 20: AJUSTES 'S' SEM FINANCEIRO POR ANO ---");
  const sWithoutFinByYear = await prisma.$queryRaw<
    Array<{
      year: number;
      count: bigint;
      total_economic: Prisma.Decimal | null;
    }>
  >`
    SELECT
      EXTRACT(YEAR FROM COALESCE(sa.confirmation_date, sa.source_created_at))::int as year,
      COUNT(sa.id) as count,
      SUM(sa.total_amount) as total_economic
    FROM stock_adjustments sa
    WHERE sa.connection_id = ${connectionId}::uuid
      AND sa.type = 'S'
      AND NOT EXISTS (
        SELECT 1 FROM stock_adjustment_financial_links fl
        WHERE fl.stock_adjustment_id = sa.id
      )
    GROUP BY 1
    ORDER BY 1 ASC
  `;

  for (const row of sWithoutFinByYear) {
    console.log(
      `  Ano ${row.year}: ${row.count} ajustes | Total Econômico: R$ ${row.total_economic ? Number(row.total_economic).toFixed(2) : "0.00"}`,
    );
  }

  // Amostra recente de ajustes S sem financeiro
  const recentWithoutFin = await prisma.stockAdjustment.findMany({
    where: {
      connectionId,
      type: "S",
      financialLinks: { none: {} },
    },
    orderBy: { number: "desc" },
    take: 5,
    select: {
      number: true,
      sourceId: true,
      confirmationDate: true,
      sourceCreatedAt: true,
      entityName: true,
      totalAmount: true,
      notes: true,
    },
  });
  console.log(
    "\nAmostra recente de ajustes S sem financeiro (top 5 mais recentes):",
  );
  for (const item of recentWithoutFin) {
    console.log(
      `  AE #${item.number} (ID ${item.sourceId}) | Data: ${item.confirmationDate?.toISOString().slice(0, 10) ?? item.sourceCreatedAt?.toISOString().slice(0, 10)} | Entidade: ${item.entityName ?? "N/A"} | R$ ${Number(item.totalAmount).toFixed(2)} | Obs: ${item.notes?.slice(0, 40) ?? "N/A"}`,
    );
  }

  // 7. SEÇÃO 21: AUDITORIA GIANCARLO (703, 697, 679, 656, 633)
  console.log(
    "\n--- 7. SEÇÃO 21: AUDITORIA GIANCARLO (703, 697, 679, 656, 633) ---",
  );
  const targetNumbers = [703, 697, 679, 656, 633];
  for (const num of targetNumbers) {
    const adj = await prisma.stockAdjustment.findFirst({
      where: { connectionId, number: String(num) },
      include: {
        items: true,
        financialLinks: {
          include: {
            financialRecord: true,
          },
        },
      },
    });

    if (!adj) {
      console.log(`  Ajuste #${num}: NÃO ENCONTRADO NO BANCO!`);
      continue;
    }

    const finTotal = adj.financialLinks.reduce((acc, fl) => {
      return (
        acc + (fl.financialRecord ? Number(fl.financialRecord.totalAmount) : 0)
      );
    }, 0);

    console.log(
      `  Ajuste #${adj.number} | ID: ${adj.sourceId} | Tipo: ${adj.type} | Data: ${adj.confirmationDate?.toISOString().slice(0, 10) ?? adj.sourceCreatedAt?.toISOString().slice(0, 10)} | Entidade: ${adj.entityName} | Total: R$ ${Number(adj.totalAmount).toFixed(2)} | Itens: ${adj.items.length} | Links: ${adj.financialLinks.length} | Fin Total: R$ ${finTotal.toFixed(2)}`,
    );
    if (adj.financialLinks.length > 0) {
      for (const fl of adj.financialLinks) {
        console.log(
          `    -> Link: FR ID ${fl.financialRecordId ?? "N/A"} (sourceId ${fl.financialRecordSourceId}) | FR Total: R$ ${fl.financialRecord ? Number(fl.financialRecord.totalAmount).toFixed(2) : "N/A"} | Plano: ${fl.financialRecord?.budgetPlanSourceId ?? "N/A"}`,
        );
      }
    }
  }

  // 8. SEÇÃO 14: INTEGRIDADE VALOR ECONÔMICO (ITENS + FRETE + OUTROS VS TOTAL)
  console.log(
    "\n--- 8. SEÇÃO 14: INTEGRIDADE ECONÔMICA (ITENS + FRETE + OUTROS VS TOTAL) ---",
  );
  const itemSumCheckRaw = await prisma.$queryRaw<
    Array<{
      adjustment_id: string;
      number: number;
      adjustment_total: Prisma.Decimal;
      freight_amount: Prisma.Decimal;
      other_amount: Prisma.Decimal;
      items_subtotal_sum: Prisma.Decimal;
      diff: Prisma.Decimal;
    }>
  >`
    SELECT
      sa.id as adjustment_id,
      sa.number,
      sa.total_amount as adjustment_total,
      sa.freight_amount,
      sa.other_amount,
      COALESCE(SUM(sai.subtotal_amount), 0) as items_subtotal_sum,
      ABS(sa.total_amount - (COALESCE(SUM(sai.subtotal_amount), 0) + sa.freight_amount + sa.other_amount)) as diff
    FROM stock_adjustments sa
    LEFT JOIN stock_adjustment_items sai ON sai.stock_adjustment_id = sa.id
    WHERE sa.connection_id = ${connectionId}::uuid
    GROUP BY sa.id, sa.number, sa.total_amount, sa.freight_amount, sa.other_amount
    HAVING ABS(sa.total_amount - (COALESCE(SUM(sai.subtotal_amount), 0) + sa.freight_amount + sa.other_amount)) > 0.01
  `;

  console.log(
    `Ajustes com divergência entre itens e total (> 0.01): ${itemSumCheckRaw.length}`,
  );
  if (itemSumCheckRaw.length > 0) {
    for (const row of itemSumCheckRaw.slice(0, 5)) {
      console.log(
        `  AE #${row.number}: Total = R$ ${Number(row.adjustment_total).toFixed(2)}, Itens = R$ ${Number(row.items_subtotal_sum).toFixed(2)}, Frete = R$ ${Number(row.freight_amount).toFixed(2)}, Outros = R$ ${Number(row.other_amount).toFixed(2)}, Diff = R$ ${Number(row.diff).toFixed(2)}`,
      );
    }
  }

  // 9. SEÇÃO 22: RECONCILIAÇÃO DE LINKS COM O DISCOVERY (~923)
  console.log(
    "\n--- 9. SEÇÃO 22: RECONCILIAÇÃO DE LINKS COM O DISCOVERY (~923) ---",
  );
  const frWithAeMovement = await prisma.financialRecord.count({
    where: {
      connectionId,
      linkedMovementNumber: { startsWith: "AE -" },
    },
  });
  const frWithAeAnywhere = await prisma.financialRecord.count({
    where: {
      connectionId,
      linkedMovementNumber: { contains: "AE" },
    },
  });
  console.log(
    `FinancialRecords com linkedMovementNumber = 'AE -%': ${frWithAeMovement}`,
  );
  console.log(
    `FinancialRecords com linkedMovementNumber contendo 'AE': ${frWithAeAnywhere}`,
  );
  console.log(
    `StockAdjustmentFinancialLinks no PostgreSQL         : ${totalLinks}`,
  );

  // Verificar quais FRs possuem linkedMovementNumber = 'AE -%' mas NÃO possuem StockAdjustmentFinancialLink
  const unlinkedFrsRaw = await prisma.$queryRaw<
    Array<{
      id: string;
      source_id: string;
      linked_movement_number: string;
      description: string;
      total_amount: Prisma.Decimal;
    }>
  >`
    SELECT
      fr.id,
      fr.source_id,
      fr.linked_movement_number,
      fr.description,
      fr.total_amount
    FROM financial_records fr
    WHERE fr.connection_id = ${connectionId}::uuid
      AND fr.linked_movement_number LIKE 'AE -%'
      AND NOT EXISTS (
        SELECT 1 FROM stock_adjustment_financial_links fl
        WHERE fl.financial_record_id = fr.id
      )
  `;

  console.log(
    `FinancialRecords com 'AE -%' sem vínculo via faturas: ${unlinkedFrsRaw.length}`,
  );
  for (const fr of unlinkedFrsRaw) {
    console.log(
      `  FR #${fr.source_id} | Mov: ${fr.linked_movement_number} | Desc: ${fr.description} | R$ ${Number(fr.total_amount).toFixed(2)}`,
    );
  }

  // Verificar se há links em StockAdjustmentFinancialLink cujo FR tem linkedMovementNumber diferente
  const linksWithoutAeFr = await prisma.$queryRaw<
    Array<{
      fl_id: string;
      sa_number: number;
      fr_source_id: string;
      fr_linked_mov: string | null;
    }>
  >`
    SELECT
      fl.id as fl_id,
      sa.number as sa_number,
      fl.financial_record_source_id as fr_source_id,
      fr.linked_movement_number as fr_linked_mov
    FROM stock_adjustment_financial_links fl
    JOIN stock_adjustments sa ON sa.id = fl.stock_adjustment_id
    LEFT JOIN financial_records fr ON fr.id = fl.financial_record_id
    WHERE sa.connection_id = ${connectionId}::uuid
      AND (fr.linked_movement_number IS NULL OR fr.linked_movement_number NOT LIKE 'AE -%')
  `;
  console.log(
    `StockAdjustmentFinancialLinks onde o FR não tem 'AE -%' no linkedMovement: ${linksWithoutAeFr.length}`,
  );
  for (const l of linksWithoutAeFr) {
    console.log(
      `  Link ${l.fl_id} | AE #${l.sa_number} | FR SourceId: ${l.fr_source_id} | FR linked_movement: ${l.fr_linked_mov ?? "NULL"}`,
    );
  }

  console.log("\n==================================================");
  console.log("AUDITORIA CONCLUÍDA COM SUCESSO");
  console.log("==================================================");
}

runAudits()
  .catch((err) => {
    console.error("Audit failed:", err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
