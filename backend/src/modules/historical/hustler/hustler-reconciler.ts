import crypto from "crypto";
import {
  PrismaClient,
  SourceSystem,
  HistoricalImportBatchStatus,
} from "@prisma/client";

export enum CustomerMatchClassification {
  MATCH_EXACT_FISCAL = "MATCH_EXACT_FISCAL",
  MATCH_EXACT_EMAIL = "MATCH_EXACT_EMAIL",
  AMBIGUOUS_FISCAL = "AMBIGUOUS_FISCAL",
  AMBIGUOUS_EMAIL = "AMBIGUOUS_EMAIL",
  CONFLICTING_EVIDENCE = "CONFLICTING_EVIDENCE",
  NAME_EVIDENCE_ONLY = "NAME_EVIDENCE_ONLY",
  GENERIC_CUSTOMER = "GENERIC_CUSTOMER",
  UNMATCHED = "UNMATCHED",
}

export enum ProductMatchClassification {
  MATCH_EXACT_SKU = "MATCH_EXACT_SKU",
  MATCH_EXACT_BARCODE = "MATCH_EXACT_BARCODE",
  AMBIGUOUS_SKU = "AMBIGUOUS_SKU",
  AMBIGUOUS_BARCODE = "AMBIGUOUS_BARCODE",
  CONFLICTING_EVIDENCE = "CONFLICTING_EVIDENCE",
  DESCRIPTION_EVIDENCE_ONLY = "DESCRIPTION_EVIDENCE_ONLY",
  UNMATCHED = "UNMATCHED",
}

export function normalizeCpfCnpj(doc: unknown): string | null {
  if (!doc) return null;
  const digits = String(doc).replace(/\D/g, "");
  if (digits.length === 11 || digits.length === 14) {
    if (/^(\d)\1+$/.test(digits)) return null;
    return digits;
  }
  return null;
}

export function normalizeEmail(email: unknown): string | null {
  if (!email) return null;
  const cleaned = String(email).trim().toLowerCase();
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleaned)) {
    return cleaned;
  }
  return null;
}

export function normalizeSku(sku: unknown): string | null {
  if (!sku) return null;
  const cleaned = String(sku).trim();
  return cleaned.length > 0 ? cleaned : null;
}

export function normalizeBarcode(barcode: unknown): string | null {
  if (!barcode) return null;
  const cleaned = String(barcode).trim();
  return cleaned.length > 0 ? cleaned : null;
}

export function isGenericCustomerName(
  tradeName?: string | null,
  legalName?: string | null,
): boolean {
  const combined = `${tradeName || ""} ${legalName || ""}`.toUpperCase();
  return (
    combined.includes("CONSUMIDOR") ||
    combined.includes("CLIENTE BALCAO") ||
    combined.includes("CLIENTE BALCÃO") ||
    combined.includes("BALCAO") ||
    combined.includes("BALCÃO")
  );
}

export function maskFiscalDoc(doc: string | null): string {
  if (!doc) return "N/A";
  const clean = doc.replace(/\D/g, "");
  if (clean.length === 11) {
    return `***.***.***-${clean.slice(-2)}`;
  }
  if (clean.length === 14) {
    return `**.***.***/****-${clean.slice(-2)}`;
  }
  return "***";
}

export function maskEmail(email: string | null): string {
  if (!email) return "N/A";
  const parts = email.split("@");
  if (parts.length !== 2) return "***@***";
  const [user, domain] = parts;
  const maskedUser =
    user!.length > 2
      ? `${user![0]}***${user!.slice(-1)}`
      : `${user![0]}***`;
  return `${maskedUser}@${domain}`;
}

export interface CustomerMatchResult {
  legacyClienteId: string;
  legacyEntidadeId: string;
  legalName: string | null;
  tradeName: string | null;
  fiscalDoc: string | null;
  email: string | null;
  classification: CustomerMatchClassification;
  matchedCustomerId: string | null;
  matchedCustomerName: string | null;
  reason: string;
}

export interface ProductMatchResult {
  legacyProdutoBaseId: string;
  legacySku: string | null;
  legacyBarcode: string | null;
  description: string | null;
  classification: ProductMatchClassification;
  matchedProductId: string | null;
  matchedProductCode: string | null;
  reason: string;
}

export interface ReconcileOptions {
  prisma: PrismaClient;
  batchId: string;
  dryRun?: boolean;
}

export interface ReconciliationResult {
  batchId: string;
  companyId: string;
  companyName: string;
  dryRun: boolean;

  customers: {
    total: number;
    validFiscalDocs: number;
    invalidFiscalDocs: number;
    exactFiscalMatches: number;
    exactEmailMatches: number;
    ambiguousFiscal: number;
    ambiguousEmail: number;
    conflictingEvidence: number;
    generic: number;
    nameEvidenceOnly: number;
    unmatched: number;
    safeMatchesCount: number;
    sampleReview: Record<string, CustomerMatchResult[]>;
  };

  products: {
    total: number;
    uniqueSkus: number;
    duplicateSkus: number;
    exactSkuMatches: number;
    exactBarcodeMatches: number;
    ambiguousSku: number;
    ambiguousBarcode: number;
    conflictingEvidence: number;
    descriptionEvidenceOnly: number;
    unmatched: number;
    safeMatchesCount: number;
    sampleReview: Record<string, ProductMatchResult[]>;
  };

  identities: {
    customerCreated: number;
    productCreated: number;
    totalCreated: number;
    existingIdentical: number;
    conflicted: number;
  };
}

export async function reconcileHustlerEntities(
  options: ReconcileOptions,
): Promise<ReconciliationResult> {
  const { prisma, batchId, dryRun = false } = options;

  // 1. Validate Batch
  const batch = await prisma.historicalImportBatch.findUnique({
    where: { id: batchId },
    include: { company: true },
  });

  if (!batch) {
    throw new Error(`HistoricalImportBatch '${batchId}' not found.`);
  }

  if (batch.status !== HistoricalImportBatchStatus.STAGED) {
    throw new Error(
      `HistoricalImportBatch '${batchId}' has status '${batch.status}'. Expected 'STAGED'.`,
    );
  }

  const companyId = batch.companyId;
  const companyName = batch.company.name;

  // 2. Load Canonical Data for the Company
  const [canonicalCustomers, canonicalProducts] = await Promise.all([
    prisma.customer.findMany({
      where: {
        connection: { companyId },
      },
      select: {
        id: true,
        cpf: true,
        cnpj: true,
        email: true,
        legalName: true,
        tradeName: true,
      },
    }),
    prisma.product.findMany({
      where: {
        connection: { companyId },
      },
      select: {
        id: true,
        code: true,
        externalCode: true,
        barcode: true,
        taxableBarcode: true,
        description: true,
      },
    }),
  ]);

  // Index Canonical Customers
  const canonicalCustByFiscal = new Map<string, typeof canonicalCustomers>();
  const canonicalCustByEmail = new Map<string, typeof canonicalCustomers>();

  for (const c of canonicalCustomers) {
    const cpf = normalizeCpfCnpj(c.cpf);
    const cnpj = normalizeCpfCnpj(c.cnpj);
    const fiscal = cpf || cnpj;
    if (fiscal) {
      if (!canonicalCustByFiscal.has(fiscal)) {
        canonicalCustByFiscal.set(fiscal, []);
      }
      canonicalCustByFiscal.get(fiscal)!.push(c);
    }

    const email = normalizeEmail(c.email);
    if (email) {
      if (!canonicalCustByEmail.has(email)) {
        canonicalCustByEmail.set(email, []);
      }
      canonicalCustByEmail.get(email)!.push(c);
    }
  }

  // Index Canonical Products
  const canonicalProdBySku = new Map<string, typeof canonicalProducts>();
  const canonicalProdByBarcode = new Map<string, typeof canonicalProducts>();

  for (const p of canonicalProducts) {
    const sku = normalizeSku(p.code) || normalizeSku(p.externalCode);
    if (sku) {
      if (!canonicalProdBySku.has(sku)) {
        canonicalProdBySku.set(sku, []);
      }
      canonicalProdBySku.get(sku)!.push(p);
    }

    const bc = normalizeBarcode(p.barcode) || normalizeBarcode(p.taxableBarcode);
    if (bc) {
      if (!canonicalProdByBarcode.has(bc)) {
        canonicalProdByBarcode.set(bc, []);
      }
      canonicalProdByBarcode.get(bc)!.push(p);
    }
  }

  // 3. Load Staging Rows
  const [clienteRows, entidadeRows, contatoRows, produtoRows] =
    await Promise.all([
      prisma.historicalStagingRow.findMany({
        where: { importBatchId: batchId, sourceTable: "cliente" },
        select: { payload: true },
      }),
      prisma.historicalStagingRow.findMany({
        where: { importBatchId: batchId, sourceTable: "entidade" },
        select: { payload: true },
      }),
      prisma.historicalStagingRow.findMany({
        where: { importBatchId: batchId, sourceTable: "contato" },
        select: { payload: true },
      }),
      prisma.historicalStagingRow.findMany({
        where: { importBatchId: batchId, sourceTable: "produto_base" },
        select: { payload: true },
      }),
    ]);

  const entidadeById = new Map<string, Record<string, unknown>>();
  for (const r of entidadeRows) {
    const p = r.payload as Record<string, unknown>;
    entidadeById.set(String(p["id"]), p);
  }

  const emailsByEntidadeId = new Map<string, string[]>();
  for (const r of contatoRows) {
    const p = r.payload as Record<string, unknown>;
    if (String(p["id_tipo_contato"]) === "2") {
      const email = normalizeEmail(p["descricao"]);
      if (email) {
        const entId = String(p["id_entidade"]);
        if (!emailsByEntidadeId.has(entId)) {
          emailsByEntidadeId.set(entId, []);
        }
        emailsByEntidadeId.get(entId)!.push(email);
      }
    }
  }

  // 4. Reconcile Customers
  const customerResults: CustomerMatchResult[] = [];
  const safeCustomerMatches: { legacyId: string; canonicalId: string }[] = [];

  let custValidFiscalDocs = 0;
  let custInvalidFiscalDocs = 0;

  for (const cr of clienteRows) {
    const cliente = cr.payload as Record<string, unknown>;
    const legacyClienteId = String(cliente["id"]);
    const legacyEntidadeId = String(cliente["id_entidade"]);
    const entidade = entidadeById.get(legacyEntidadeId) || {};

    const legalName = (entidade["razao_social"] as string) || null;
    const tradeName = (cliente["nome_fantasia"] as string) || null;

    const cpf = normalizeCpfCnpj(entidade["cpf"]);
    const cnpj = normalizeCpfCnpj(entidade["cnpj"]);
    const fiscalDoc = cpf || cnpj;

    if (fiscalDoc) {
      custValidFiscalDocs++;
    } else {
      custInvalidFiscalDocs++;
    }

    const isGeneric = isGenericCustomerName(tradeName, legalName);
    const emails = emailsByEntidadeId.get(legacyEntidadeId) || [];
    const primaryEmail = emails[0] || null;

    // Rule A: Generic Customer Detection
    if (isGeneric) {
      const candidates = fiscalDoc ? (canonicalCustByFiscal.get(fiscalDoc) || []) : [];
      if (candidates.length === 0) {
        customerResults.push({
          legacyClienteId,
          legacyEntidadeId,
          legalName,
          tradeName,
          fiscalDoc,
          email: primaryEmail,
          classification: CustomerMatchClassification.GENERIC_CUSTOMER,
          matchedCustomerId: null,
          matchedCustomerName: null,
          reason: "Customer has generic balcão/consumidor descriptor without exact canonical match.",
        });
        continue;
      }
    }

    // Rule B: Primary Fiscal Match (CPF/CNPJ)
    if (fiscalDoc) {
      const candidates = canonicalCustByFiscal.get(fiscalDoc) || [];
      if (candidates.length === 1) {
        const matched = candidates[0]!;
        customerResults.push({
          legacyClienteId,
          legacyEntidadeId,
          legalName,
          tradeName,
          fiscalDoc,
          email: primaryEmail,
          classification: CustomerMatchClassification.MATCH_EXACT_FISCAL,
          matchedCustomerId: matched.id,
          matchedCustomerName: matched.legalName || matched.tradeName || null,
          reason: `Exact fiscal document match on '${fiscalDoc.length === 11 ? "CPF" : "CNPJ"}'.`,
        });
        safeCustomerMatches.push({
          legacyId: legacyClienteId,
          canonicalId: matched.id,
        });
        continue;
      } else if (candidates.length > 1) {
        customerResults.push({
          legacyClienteId,
          legacyEntidadeId,
          legalName,
          tradeName,
          fiscalDoc,
          email: primaryEmail,
          classification: CustomerMatchClassification.AMBIGUOUS_FISCAL,
          matchedCustomerId: null,
          matchedCustomerName: null,
          reason: `Fiscal document '${fiscalDoc}' matches ${candidates.length} canonical customers.`,
        });
        continue;
      }
    }

    // Rule C: Secondary Email Match Fallback
    let emailHandled = false;
    for (const em of emails) {
      const candidates = canonicalCustByEmail.get(em) || [];
      if (candidates.length === 1) {
        const candidate = candidates[0]!;
        const canFiscal =
          normalizeCpfCnpj(candidate.cpf) || normalizeCpfCnpj(candidate.cnpj);
        if (fiscalDoc && canFiscal && fiscalDoc !== canFiscal) {
          customerResults.push({
            legacyClienteId,
            legacyEntidadeId,
            legalName,
            tradeName,
            fiscalDoc,
            email: em,
            classification: CustomerMatchClassification.CONFLICTING_EVIDENCE,
            matchedCustomerId: null,
            matchedCustomerName: null,
            reason: `Email '${em}' matches Customer '${candidate.id}' but fiscal docs conflict ('${fiscalDoc}' vs '${canFiscal}').`,
          });
          emailHandled = true;
          break;
        } else {
          customerResults.push({
            legacyClienteId,
            legacyEntidadeId,
            legalName,
            tradeName,
            fiscalDoc,
            email: em,
            classification: CustomerMatchClassification.MATCH_EXACT_EMAIL,
            matchedCustomerId: candidate.id,
            matchedCustomerName: candidate.legalName || candidate.tradeName || null,
            reason: `Exact email match on '${em}'.`,
          });
          safeCustomerMatches.push({
            legacyId: legacyClienteId,
            canonicalId: candidate.id,
          });
          emailHandled = true;
          break;
        }
      } else if (candidates.length > 1) {
        customerResults.push({
          legacyClienteId,
          legacyEntidadeId,
          legalName,
          tradeName,
          fiscalDoc,
          email: em,
          classification: CustomerMatchClassification.AMBIGUOUS_EMAIL,
          matchedCustomerId: null,
          matchedCustomerName: null,
          reason: `Email '${em}' matches ${candidates.length} canonical customers.`,
        });
        emailHandled = true;
        break;
      }
    }
    if (emailHandled) continue;

    if (isGeneric) {
      customerResults.push({
        legacyClienteId,
        legacyEntidadeId,
        legalName,
        tradeName,
        fiscalDoc,
        email: primaryEmail,
        classification: CustomerMatchClassification.GENERIC_CUSTOMER,
        matchedCustomerId: null,
        matchedCustomerName: null,
        reason: "Generic customer identifier with unmatched fiscal doc.",
      });
      continue;
    }

    // Unmatched
    customerResults.push({
      legacyClienteId,
      legacyEntidadeId,
      legalName,
      tradeName,
      fiscalDoc,
      email: primaryEmail,
      classification: CustomerMatchClassification.UNMATCHED,
      matchedCustomerId: null,
      matchedCustomerName: null,
      reason: fiscalDoc
        ? "No canonical customer with matching fiscal document."
        : "No fiscal document or matching email found.",
    });
  }

  // 5. Reconcile Products
  const productResults: ProductMatchResult[] = [];
  const safeProductMatches: { legacyId: string; canonicalId: string }[] = [];

  const legacySkuCounts = new Map<string, number>();
  for (const pr of produtoRows) {
    const p = pr.payload as Record<string, unknown>;
    const sku =
      normalizeSku(p["cod_secundario"]) || normalizeSku(p["codigo_externo"]);
    if (sku) {
      legacySkuCounts.set(sku, (legacySkuCounts.get(sku) || 0) + 1);
    }
  }

  let uniqueSkusCount = 0;
  let dupSkusCount = 0;
  for (const count of legacySkuCounts.values()) {
    if (count === 1) uniqueSkusCount++;
    else dupSkusCount++;
  }

  for (const pr of produtoRows) {
    const p = pr.payload as Record<string, unknown>;
    const legacyProdutoBaseId = String(p["id"]);
    const sku =
      normalizeSku(p["cod_secundario"]) || normalizeSku(p["codigo_externo"]);
    const barcode = normalizeBarcode(p["cod_barra"]);
    const description = (p["descricao_produto"] as string) || null;

    // Rule A: Primary SKU Match
    if (sku) {
      const candidates = canonicalProdBySku.get(sku) || [];
      if (candidates.length === 1) {
        const matched = candidates[0]!;
        productResults.push({
          legacyProdutoBaseId,
          legacySku: sku,
          legacyBarcode: barcode,
          description,
          classification: ProductMatchClassification.MATCH_EXACT_SKU,
          matchedProductId: matched.id,
          matchedProductCode: matched.code || matched.externalCode || null,
          reason: `Exact SKU/Code match on '${sku}'.`,
        });
        safeProductMatches.push({
          legacyId: legacyProdutoBaseId,
          canonicalId: matched.id,
        });
        continue;
      } else if (candidates.length > 1) {
        productResults.push({
          legacyProdutoBaseId,
          legacySku: sku,
          legacyBarcode: barcode,
          description,
          classification: ProductMatchClassification.AMBIGUOUS_SKU,
          matchedProductId: null,
          matchedProductCode: null,
          reason: `SKU '${sku}' matches ${candidates.length} canonical products.`,
        });
        continue;
      }
    }

    // Rule B: Secondary Barcode Match
    if (barcode) {
      const candidates = canonicalProdByBarcode.get(barcode) || [];
      if (candidates.length === 1) {
        const matched = candidates[0]!;
        productResults.push({
          legacyProdutoBaseId,
          legacySku: sku,
          legacyBarcode: barcode,
          description,
          classification: ProductMatchClassification.MATCH_EXACT_BARCODE,
          matchedProductId: matched.id,
          matchedProductCode: matched.code || matched.externalCode || null,
          reason: `Exact Barcode match on '${barcode}'.`,
        });
        safeProductMatches.push({
          legacyId: legacyProdutoBaseId,
          canonicalId: matched.id,
        });
        continue;
      } else if (candidates.length > 1) {
        productResults.push({
          legacyProdutoBaseId,
          legacySku: sku,
          legacyBarcode: barcode,
          description,
          classification: ProductMatchClassification.AMBIGUOUS_BARCODE,
          matchedProductId: null,
          matchedProductCode: null,
          reason: `Barcode '${barcode}' matches ${candidates.length} canonical products.`,
        });
        continue;
      }
    }

    // Unmatched
    productResults.push({
      legacyProdutoBaseId,
      legacySku: sku,
      legacyBarcode: barcode,
      description,
      classification: ProductMatchClassification.UNMATCHED,
      matchedProductId: null,
      matchedProductCode: null,
      reason: sku
        ? "No canonical product with matching SKU."
        : "No SKU or matching barcode found.",
    });
  }

  // 6. Identity Creation & Conflict Checking
  let customerCreated = 0;
  let productCreated = 0;
  let existingIdentical = 0;
  let conflicted = 0;

  if (!dryRun) {
    // Load existing identities for this company and sourceSystem
    const existingIdentities = await prisma.historicalSourceIdentity.findMany({
      where: {
        companyId,
        sourceSystem: SourceSystem.HUSTLER_LEGACY_DUMP,
      },
    });

    const identityMap = new Map<string, string>(); // `${sourceEntity}:${sourcePrimaryKey}` -> canonicalEntityId
    for (const idRow of existingIdentities) {
      identityMap.set(
        `${idRow.sourceEntity}:${idRow.sourcePrimaryKey}`,
        idRow.canonicalEntityId,
      );
    }

    const identitiesToInsert: {
      id: string;
      companyId: string;
      importBatchId: string;
      sourceSystem: SourceSystem;
      sourceEntity: string;
      sourcePrimaryKey: string;
      canonicalEntityType: string;
      canonicalEntityId: string;
    }[] = [];

    // Process Customer Identities
    for (const match of safeCustomerMatches) {
      const key = `cliente:${match.legacyId}`;
      const existing = identityMap.get(key);
      if (existing) {
        if (existing === match.canonicalId) {
          existingIdentical++;
        } else {
          conflicted++;
          throw new Error(
            `FATAL CONFLICT: Identity '${key}' already mapped to '${existing}' but reconciler resolved '${match.canonicalId}'!`,
          );
        }
      } else {
        identitiesToInsert.push({
          id: crypto.randomUUID(),
          companyId,
          importBatchId: batchId,
          sourceSystem: SourceSystem.HUSTLER_LEGACY_DUMP,
          sourceEntity: "cliente",
          sourcePrimaryKey: match.legacyId,
          canonicalEntityType: "Customer",
          canonicalEntityId: match.canonicalId,
        });
        customerCreated++;
      }
    }

    // Process Product Identities
    for (const match of safeProductMatches) {
      const key = `produto_base:${match.legacyId}`;
      const existing = identityMap.get(key);
      if (existing) {
        if (existing === match.canonicalId) {
          existingIdentical++;
        } else {
          conflicted++;
          throw new Error(
            `FATAL CONFLICT: Identity '${key}' already mapped to '${existing}' but reconciler resolved '${match.canonicalId}'!`,
          );
        }
      } else {
        identitiesToInsert.push({
          id: crypto.randomUUID(),
          companyId,
          importBatchId: batchId,
          sourceSystem: SourceSystem.HUSTLER_LEGACY_DUMP,
          sourceEntity: "produto_base",
          sourcePrimaryKey: match.legacyId,
          canonicalEntityType: "Product",
          canonicalEntityId: match.canonicalId,
        });
        productCreated++;
      }
    }

    // Batch insert new identities in chunks of 1000
    const chunkSize = 1000;
    for (let i = 0; i < identitiesToInsert.length; i += chunkSize) {
      const chunk = identitiesToInsert.slice(i, i + chunkSize);
      await prisma.historicalSourceIdentity.createMany({
        data: chunk,
      });
    }
  }

  // 7. Group Sample Review
  const custSampleReview: Record<string, CustomerMatchResult[]> = {};
  for (const r of customerResults) {
    if (!custSampleReview[r.classification]) {
      custSampleReview[r.classification] = [];
    }
    if (custSampleReview[r.classification]!.length < 5) {
      custSampleReview[r.classification]!.push(r);
    }
  }

  const prodSampleReview: Record<string, ProductMatchResult[]> = {};
  for (const r of productResults) {
    if (!prodSampleReview[r.classification]) {
      prodSampleReview[r.classification] = [];
    }
    if (prodSampleReview[r.classification]!.length < 5) {
      prodSampleReview[r.classification]!.push(r);
    }
  }

  // Count aggregates
  const custClassCounts = (cls: CustomerMatchClassification) =>
    customerResults.filter((r) => r.classification === cls).length;

  const prodClassCounts = (cls: ProductMatchClassification) =>
    productResults.filter((r) => r.classification === cls).length;

  return {
    batchId,
    companyId,
    companyName,
    dryRun,

    customers: {
      total: customerResults.length,
      validFiscalDocs: custValidFiscalDocs,
      invalidFiscalDocs: custInvalidFiscalDocs,
      exactFiscalMatches: custClassCounts(
        CustomerMatchClassification.MATCH_EXACT_FISCAL,
      ),
      exactEmailMatches: custClassCounts(
        CustomerMatchClassification.MATCH_EXACT_EMAIL,
      ),
      ambiguousFiscal: custClassCounts(
        CustomerMatchClassification.AMBIGUOUS_FISCAL,
      ),
      ambiguousEmail: custClassCounts(
        CustomerMatchClassification.AMBIGUOUS_EMAIL,
      ),
      conflictingEvidence: custClassCounts(
        CustomerMatchClassification.CONFLICTING_EVIDENCE,
      ),
      generic: custClassCounts(CustomerMatchClassification.GENERIC_CUSTOMER),
      nameEvidenceOnly: custClassCounts(
        CustomerMatchClassification.NAME_EVIDENCE_ONLY,
      ),
      unmatched: custClassCounts(CustomerMatchClassification.UNMATCHED),
      safeMatchesCount: safeCustomerMatches.length,
      sampleReview: custSampleReview,
    },

    products: {
      total: productResults.length,
      uniqueSkus: uniqueSkusCount,
      duplicateSkus: dupSkusCount,
      exactSkuMatches: prodClassCounts(
        ProductMatchClassification.MATCH_EXACT_SKU,
      ),
      exactBarcodeMatches: prodClassCounts(
        ProductMatchClassification.MATCH_EXACT_BARCODE,
      ),
      ambiguousSku: prodClassCounts(ProductMatchClassification.AMBIGUOUS_SKU),
      ambiguousBarcode: prodClassCounts(
        ProductMatchClassification.AMBIGUOUS_BARCODE,
      ),
      conflictingEvidence: prodClassCounts(
        ProductMatchClassification.CONFLICTING_EVIDENCE,
      ),
      descriptionEvidenceOnly: prodClassCounts(
        ProductMatchClassification.DESCRIPTION_EVIDENCE_ONLY,
      ),
      unmatched: prodClassCounts(ProductMatchClassification.UNMATCHED),
      safeMatchesCount: safeProductMatches.length,
      sampleReview: prodSampleReview,
    },

    identities: {
      customerCreated,
      productCreated,
      totalCreated: customerCreated + productCreated,
      existingIdentical,
      conflicted,
    },
  };
}
