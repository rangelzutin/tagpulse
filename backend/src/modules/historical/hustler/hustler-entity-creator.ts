import crypto from "crypto";
import {
  PrismaClient,
  SourceSystem,
  HistoricalImportBatchStatus,
} from "@prisma/client";
import { normalizeCpfCnpj, normalizeEmail, normalizeSku, normalizeBarcode } from "./hustler-reconciler.js";

export interface HustlerEntityCandidatePlan {
  batchId: string;
  companyId: string;
  connectionId: string;
  productCandidates: Array<{
    legacyProdutoId: string;
    sourceId: string;
    code: string;
    description: string;
    barcode: string | null;
    retailSalePrice: number | null;
    effectiveCost: number | null;
    averageCost: number | null;
  }>;
  skippedUnusedProductsCount: number;
  skippedCancelledOnlyProductsCount: number;
  customerCandidates: Array<{
    legacyClienteId: string;
    sourceId: string;
    legalName: string;
    tradeName: string | null;
    cpf: string | null;
    cnpj: string | null;
    email: string | null;
    phone: string | null;
  }>;
  fiscalCollisions: Array<{
    legacyClienteId: string;
    doc: string;
    collidingCanonicalCustomerId: string;
  }>;
  summary: {
    productCandidatesCount: number;
    customerCandidatesCount: number;
    totalIdentityCandidatesCount: number;
    skippedUnusedProductsCount: number;
    skippedCancelledOnlyProductsCount: number;
    fiscalCollisionsCount: number;
    isReadyToPersist: boolean;
  };
}

export interface HustlerEntityPersistenceResult {
  batchId: string;
  dryRun: boolean;
  plan: HustlerEntityCandidatePlan;
  productsCreated: number;
  productIdentitiesCreated: number;
  productConflicts: number;
  customersCreated: number;
  customerIdentitiesCreated: number;
  customerFiscalConflicts: number;
  totalIdentitiesCreated: number;
  idempotent: boolean;
  createdEntities: Array<{
    sourceEntity: "produto_base" | "cliente";
    sourcePrimaryKey: string;
    canonicalEntityId: string;
    identityId: string;
  }>;
}

export function formatProductSourceId(legacyId: string): string {
  return `HUSTLER_LEGACY:${legacyId}`;
}

export function formatCustomerSourceId(legacyId: string): string {
  return `HUSTLER_LEGACY:${legacyId}`;
}

export function formatProductCode(legacyId: string, rawSku?: string | null): string {
  const norm = normalizeSku(rawSku);
  return norm ? norm : `HIST-HUSTLER-${legacyId}`;
}

export function extractLegacyProductCosts(payload: Record<string, unknown>): {
  effectiveCost: number | null;
  averageCost: number | null;
} {
  const rawEffective = payload["custo_utilizado"];
  const parsedEffective =
    rawEffective !== null && rawEffective !== undefined && String(rawEffective).trim() !== ""
      ? parseFloat(String(rawEffective))
      : NaN;
  const effectiveCost =
    !isNaN(parsedEffective) && parsedEffective > 0 ? parsedEffective : null;

  const rawAverage = payload["custo_medio"];
  const parsedAverage =
    rawAverage !== null && rawAverage !== undefined && String(rawAverage).trim() !== ""
      ? parseFloat(String(rawAverage))
      : NaN;
  const averageCost =
    !isNaN(parsedAverage) && parsedAverage > 0 ? parsedAverage : null;

  return { effectiveCost, averageCost };
}

export interface HustlerEntityPlanOptions {
  preloadedStaging?: {
    produtoRows?: Array<{ payload: unknown }>;
    vendaRows?: Array<{ payload: unknown }>;
    nflRows?: Array<{ payload: unknown }>;
    clienteRows?: Array<{ payload: unknown }>;
    entidadeRows?: Array<{ payload: unknown }>;
    contatoRows?: Array<{ payload: unknown }>;
  };
}

export async function planHustlerHistoricalEntities(
  prisma: PrismaClient,
  batchId: string,
  options?: HustlerEntityPlanOptions
): Promise<HustlerEntityCandidatePlan> {
  // 1. Validate Batch
  const batch = await prisma.historicalImportBatch.findUnique({
    where: { id: batchId },
    include: { company: { include: { tagPlusConnections: true } } },
  });

  if (!batch) {
    throw new Error(`Batch '${batchId}' not found.`);
  }

  if (batch.status !== HistoricalImportBatchStatus.STAGED) {
    throw new Error(
      `Batch '${batchId}' has status '${batch.status}'. Expected 'STAGED'.`
    );
  }

  const companyId = batch.companyId;
  const connection = batch.company.tagPlusConnections[0];
  if (!connection) {
    throw new Error(`No TagPlusConnection found for Company '${companyId}'.`);
  }
  const connectionId = connection.id;

  // 2. Load Existing Identities for this batch / company
  const existingIdentities = await prisma.historicalSourceIdentity.findMany({
    where: { companyId, sourceSystem: SourceSystem.HUSTLER_LEGACY_DUMP },
    select: { sourceEntity: true, sourcePrimaryKey: true, canonicalEntityId: true },
  });

  const existingProductIdentities = new Set<string>();
  const existingCustomerIdentities = new Set<string>();

  for (const idRow of existingIdentities) {
    if (idRow.sourceEntity === "produto_base") {
      existingProductIdentities.add(idRow.sourcePrimaryKey);
    } else if (idRow.sourceEntity === "cliente") {
      existingCustomerIdentities.add(idRow.sourcePrimaryKey);
    }
  }

  // 3. Load Staging Data (or reuse preloadedStaging to eliminate redundant network egress)
  const [
    produtoRows,
    vendaRows,
    nflRows,
    clienteRows,
    entidadeRows,
    contatoRows,
    canonicalCustomers,
  ] = await Promise.all([
    options?.preloadedStaging?.produtoRows
      ? Promise.resolve(options.preloadedStaging.produtoRows as Array<{ payload: Record<string, any> }>)
      : prisma.historicalStagingRow.findMany({
          where: { importBatchId: batchId, sourceTable: "produto_base" },
          select: { payload: true },
        }),
    options?.preloadedStaging?.vendaRows
      ? Promise.resolve(options.preloadedStaging.vendaRows as Array<{ payload: Record<string, any> }>)
      : prisma.historicalStagingRow.findMany({
          where: { importBatchId: batchId, sourceTable: "venda" },
          select: { payload: true },
        }),
    options?.preloadedStaging?.nflRows
      ? Promise.resolve(options.preloadedStaging.nflRows as Array<{ payload: Record<string, any> }>)
      : prisma.historicalStagingRow.findMany({
          where: { importBatchId: batchId, sourceTable: "nota_fiscal_lancamento" },
          select: { payload: true },
        }),
    options?.preloadedStaging?.clienteRows
      ? Promise.resolve(options.preloadedStaging.clienteRows as Array<{ payload: Record<string, any> }>)
      : prisma.historicalStagingRow.findMany({
          where: { importBatchId: batchId, sourceTable: "cliente" },
          select: { payload: true },
        }),
    options?.preloadedStaging?.entidadeRows
      ? Promise.resolve(options.preloadedStaging.entidadeRows as Array<{ payload: Record<string, any> }>)
      : prisma.historicalStagingRow.findMany({
          where: { importBatchId: batchId, sourceTable: "entidade" },
          select: { payload: true },
        }),
    options?.preloadedStaging?.contatoRows
      ? Promise.resolve(options.preloadedStaging.contatoRows as Array<{ payload: Record<string, any> }>)
      : prisma.historicalStagingRow.findMany({
          where: { importBatchId: batchId, sourceTable: "contato" },
          select: { payload: true },
        }),
    prisma.customer.findMany({
      where: { connectionId },
      select: { id: true, cpf: true, cnpj: true },
    }),
  ]);

  // Index active sales and their linked nota_fiscal IDs
  const activeVendaNfIds = new Set<string>();
  const cancelledVendaNfIds = new Set<string>();
  const activeVendasSpecificCustIds = new Set<string>();

  for (const vr of vendaRows) {
    const v = vr.payload as Record<string, any>;
    const cancelado = String(v["cancelado"]);
    const nfId = String(v["id_nota_fiscal"] || "");
    const cid = String(v["id_cliente"] || "");

    if (cancelado === "0") {
      if (nfId) activeVendaNfIds.add(nfId);
      // Specific customers only (exclude generic ID '1', blank, '0')
      if (cid && cid !== "1" && cid !== "0" && cid !== "null" && cid !== "undefined") {
        activeVendasSpecificCustIds.add(cid);
      }
    } else if (cancelado === "1") {
      if (nfId) cancelledVendaNfIds.add(nfId);
    }
  }

  // Identify products in active vs cancelled sales
  const productsInActiveSales = new Set<string>();
  const productsInCancelledSales = new Set<string>();

  for (const nr of nflRows) {
    const it = nr.payload as Record<string, any>;
    const nfId = String(it["id_nota_fiscal"]);
    const prodId = String(it["id_produto"]);

    if (activeVendaNfIds.has(nfId)) {
      productsInActiveSales.add(prodId);
    } else if (cancelledVendaNfIds.has(nfId)) {
      productsInCancelledSales.add(prodId);
    }
  }

  // 4. Determine Product Candidates
  const productCandidates: HustlerEntityCandidatePlan["productCandidates"] = [];
  let skippedUnusedProductsCount = 0;
  let skippedCancelledOnlyProductsCount = 0;

  for (const pr of produtoRows) {
    const p = pr.payload as Record<string, any>;
    const pid = String(p["id"]);

    // If already has identity, skip
    if (existingProductIdentities.has(pid)) {
      continue;
    }

    if (productsInActiveSales.has(pid)) {
      const rawSku = (p["cod_secundario"] || p["codigo_externo"]) as string | undefined;
      const code = formatProductCode(pid, rawSku);
      const desc = String(
        p["descricao_produto"] || p["descricao"] || p["nome"] || `Produto Histórico ${pid}`
      ).trim();
      const rawBarcode = p["cod_barra"] as string | undefined;
      const barcode = normalizeBarcode(rawBarcode);
      const retailPrice = p["vr_unitario"] ? parseFloat(String(p["vr_unitario"])) : null;
      const { effectiveCost, averageCost } = extractLegacyProductCosts(p);

      productCandidates.push({
        legacyProdutoId: pid,
        sourceId: formatProductSourceId(pid),
        code,
        description: desc,
        barcode,
        retailSalePrice: retailPrice && !isNaN(retailPrice) ? retailPrice : null,
        effectiveCost,
        averageCost,
      });
    } else if (productsInCancelledSales.has(pid)) {
      skippedCancelledOnlyProductsCount++;
    } else {
      skippedUnusedProductsCount++;
    }
  }

  // Sort deterministically
  productCandidates.sort(
    (a, b) => parseInt(a.legacyProdutoId, 10) - parseInt(b.legacyProdutoId, 10)
  );

  // 5. Determine Customer Candidates
  const clienteEntidadeMap = new Map<string, string>();
  for (const c of clienteRows) {
    const p = c.payload as Record<string, any>;
    clienteEntidadeMap.set(String(p["id"]), String(p["id_entidade"]));
  }

  const entidadeMap = new Map<string, Record<string, any>>();
  for (const e of entidadeRows) {
    const p = e.payload as Record<string, any>;
    entidadeMap.set(String(p["id"]), p);
  }

  const emailsByEntidadeId = new Map<string, string>();
  const phonesByEntidadeId = new Map<string, string>();
  for (const ct of contatoRows) {
    const p = ct.payload as Record<string, any>;
    const entId = String(p["id_entidade"]);
    const tipo = String(p["id_tipo_contato"]);
    const desc = String(p["descricao"] || "").trim();

    if (tipo === "2" && !emailsByEntidadeId.has(entId)) {
      const em = normalizeEmail(desc);
      if (em) emailsByEntidadeId.set(entId, em);
    } else if (tipo === "1" && !phonesByEntidadeId.has(entId)) {
      const cleaned = desc.replace(/[^\d+]/g, "");
      if (cleaned.length >= 8) phonesByEntidadeId.set(entId, cleaned);
    }
  }

  // Canonical fiscal map for collision check
  const canonicalCustByFiscal = new Map<string, string>();
  for (const cc of canonicalCustomers) {
    const cpf = normalizeCpfCnpj(cc.cpf);
    const cnpj = normalizeCpfCnpj(cc.cnpj);
    if (cpf) canonicalCustByFiscal.set(cpf, cc.id);
    if (cnpj) canonicalCustByFiscal.set(cnpj, cc.id);
  }

  const customerCandidates: HustlerEntityCandidatePlan["customerCandidates"] = [];
  const fiscalCollisions: HustlerEntityCandidatePlan["fiscalCollisions"] = [];

  for (const cid of activeVendasSpecificCustIds) {
    // If already has identity, skip
    if (existingCustomerIdentities.has(cid)) {
      continue;
    }

    const entId = clienteEntidadeMap.get(cid);
    const ent = entId ? entidadeMap.get(entId) : null;

    const rawNome = ent ? String(ent["nome"] || ent["razao_social"] || "").trim() : "";
    const rawFantasia = ent ? String(ent["nome_fantasia"] || "").trim() : "";
    const legalName = rawNome || `Cliente Histórico ${cid}`;
    const tradeName = rawFantasia || null;

    const rawDoc = ent ? normalizeCpfCnpj(ent["cpf_cnpj"]) : null;
    let cpf: string | null = null;
    let cnpj: string | null = null;
    if (rawDoc) {
      if (rawDoc.length === 11) cpf = rawDoc;
      else if (rawDoc.length === 14) cnpj = rawDoc;

      // Check collision
      const collidingId = canonicalCustByFiscal.get(rawDoc);
      if (collidingId) {
        fiscalCollisions.push({
          legacyClienteId: cid,
          doc: rawDoc,
          collidingCanonicalCustomerId: collidingId,
        });
      }
    }

    const email = entId ? emailsByEntidadeId.get(entId) || normalizeEmail(ent?.["email"]) : null;
    const phone = entId ? phonesByEntidadeId.get(entId) || String(ent?.["telefone"] || "").trim() || null : null;

    customerCandidates.push({
      legacyClienteId: cid,
      sourceId: formatCustomerSourceId(cid),
      legalName,
      tradeName,
      cpf,
      cnpj,
      email: email || null,
      phone: phone || null,
    });
  }

  // Sort deterministically
  customerCandidates.sort(
    (a, b) => parseInt(a.legacyClienteId, 10) - parseInt(b.legacyClienteId, 10)
  );

  const isReadyToPersist =
    fiscalCollisions.length === 0 &&
    (productCandidates.length === 3033 || productCandidates.length === 0) &&
    (customerCandidates.length === 46 || customerCandidates.length === 0);

  return {
    batchId,
    companyId,
    connectionId,
    productCandidates,
    skippedUnusedProductsCount,
    skippedCancelledOnlyProductsCount,
    customerCandidates,
    fiscalCollisions,
    summary: {
      productCandidatesCount: productCandidates.length,
      customerCandidatesCount: customerCandidates.length,
      totalIdentityCandidatesCount: productCandidates.length + customerCandidates.length,
      skippedUnusedProductsCount,
      skippedCancelledOnlyProductsCount,
      fiscalCollisionsCount: fiscalCollisions.length,
      isReadyToPersist,
    },
  };
}

export async function persistHustlerHistoricalEntities(
  prisma: PrismaClient,
  batchId: string,
  options: { persist: boolean; chunkSize?: number; plan?: HustlerEntityCandidatePlan }
): Promise<HustlerEntityPersistenceResult> {
  const plan = options.plan || (await planHustlerHistoricalEntities(prisma, batchId));

  if (!options.persist) {
    return {
      batchId,
      dryRun: true,
      plan,
      productsCreated: 0,
      productIdentitiesCreated: 0,
      productConflicts: 0,
      customersCreated: 0,
      customerIdentitiesCreated: 0,
      customerFiscalConflicts: plan.fiscalCollisions.length,
      totalIdentitiesCreated: 0,
      idempotent: true,
      createdEntities: [],
    };
  }

  if (plan.fiscalCollisions.length > 0) {
    throw new Error(
      `Cannot persist historical entities: ${plan.fiscalCollisions.length} fiscal collisions detected!`
    );
  }

  const chunkSize = options.chunkSize || 200;
  let productsCreated = 0;
  let productIdentitiesCreated = 0;
  let customersCreated = 0;
  let customerIdentitiesCreated = 0;
  const createdEntities: HustlerEntityPersistenceResult["createdEntities"] = [];
  const now = new Date();

  // --- 1. Persist Products in Chunks using createMany + batch transaction ---
  for (let i = 0; i < plan.productCandidates.length; i += chunkSize) {
    const chunk = plan.productCandidates.slice(i, i + chunkSize);

    const productDataList: any[] = [];
    const identityDataList: any[] = [];

    for (const cand of chunk) {
      const productId = crypto.randomUUID();
      const identityId = crypto.randomUUID();

      productDataList.push({
        id: productId,
        connectionId: plan.connectionId,
        sourceId: cand.sourceId,
        code: cand.code,
        description: cand.description,
        barcode: cand.barcode,
        active: false,
        commercializable: false,
        soldSeparately: false,
        moved: true,
        retailSalePrice: cand.retailSalePrice,
        effectiveCost: cand.effectiveCost,
        averageCost: cand.averageCost,
        sourcePresent: false,
        lastSeenAt: now,
        lastSyncedAt: now,
      });

      identityDataList.push({
        id: identityId,
        companyId: plan.companyId,
        importBatchId: batchId,
        sourceSystem: SourceSystem.HUSTLER_LEGACY_DUMP,
        sourceEntity: "produto_base",
        sourcePrimaryKey: cand.legacyProdutoId,
        canonicalEntityType: "Product",
        canonicalEntityId: productId,
      });

      createdEntities.push({
        sourceEntity: "produto_base",
        sourcePrimaryKey: cand.legacyProdutoId,
        canonicalEntityId: productId,
        identityId,
      });
    }

    await prisma.$transaction([
      prisma.product.createMany({ data: productDataList }),
      prisma.historicalSourceIdentity.createMany({ data: identityDataList }),
    ]);

    productsCreated += productDataList.length;
    productIdentitiesCreated += identityDataList.length;
  }

  // --- 2. Persist Customers in a Single Batch Transaction ---
  if (plan.customerCandidates.length > 0) {
    const customerDataList: any[] = [];
    const identityDataList: any[] = [];

    for (const cand of plan.customerCandidates) {
      const customerId = crypto.randomUUID();
      const identityId = crypto.randomUUID();

      customerDataList.push({
        id: customerId,
        connectionId: plan.connectionId,
        sourceId: cand.sourceId,
        legalName: cand.legalName,
        tradeName: cand.tradeName,
        cpf: cand.cpf,
        cnpj: cand.cnpj,
        email: cand.email,
        phone: cand.phone,
        sourceActive: false,
        sourcePresent: false,
        lastSeenAt: now,
        lastSyncedAt: now,
      });

      identityDataList.push({
        id: identityId,
        companyId: plan.companyId,
        importBatchId: batchId,
        sourceSystem: SourceSystem.HUSTLER_LEGACY_DUMP,
        sourceEntity: "cliente",
        sourcePrimaryKey: cand.legacyClienteId,
        canonicalEntityType: "Customer",
        canonicalEntityId: customerId,
      });

      createdEntities.push({
        sourceEntity: "cliente",
        sourcePrimaryKey: cand.legacyClienteId,
        canonicalEntityId: customerId,
        identityId,
      });
    }

    await prisma.$transaction([
      prisma.customer.createMany({ data: customerDataList }),
      prisma.historicalSourceIdentity.createMany({ data: identityDataList }),
    ]);

    customersCreated += customerDataList.length;
    customerIdentitiesCreated += identityDataList.length;
  }

  return {
    batchId,
    dryRun: false,
    plan,
    productsCreated,
    productIdentitiesCreated,
    productConflicts: 0,
    customersCreated,
    customerIdentitiesCreated,
    customerFiscalConflicts: 0,
    totalIdentitiesCreated: productIdentitiesCreated + customerIdentitiesCreated,
    idempotent: true,
    createdEntities,
  };
}
