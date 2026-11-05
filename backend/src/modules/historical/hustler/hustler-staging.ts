import crypto from "crypto";
import path from "path";
import {
  Prisma,
  PrismaClient,
  SourceSystem,
  HistoricalImportBatchStatus,
} from "@prisma/client";
import {
  HUSTLER_SUPPORTED_TABLES,
  HustlerSupportedTable,
} from "./hustler-schema.js";
import {
  calculateDumpFileMetadata,
  parseHustlerDump,
} from "./hustler-parser.js";

export const EXPECTED_HUSTLER_CHECKSUM =
  "54aa336bf5c7656131f2a4c473241ce6acd9453d1ecdf875fbc85837b592f5eb";

export const EXPECTED_HUSTLER_TABLE_COUNTS: Record<
  HustlerSupportedTable,
  number
> = {
  venda: 6329,
  nota_fiscal: 10014,
  nota_fiscal_lancamento: 18542,
  nfe: 2078,
  pagamento: 9853,
  financeiro_lancamento: 11152,
  produto_base: 5556,
  cliente: 1326,
  entidade: 1424,
  contato: 768,
  endereco: 785,
  endereco_entidade: 1354,
};

export const TOTAL_EXPECTED_HUSTLER_ROWS = 69181;

/**
 * Extracts the primary key from a legacy table row.
 * For all 12 supported Hustler tables, 'id' is the primary key.
 */
export function getLegacyPrimaryKey(
  table: string,
  row: Record<string, unknown>,
): string {
  const val = row["id"];
  if (val === undefined || val === null || String(val).trim() === "") {
    throw new Error(
      `Legacy primary key 'id' missing, null, or empty for table '${table}'`,
    );
  }
  return String(val);
}

/**
 * Serializes an object with canonical (sorted) key order so that
 * JSON representations are strictly deterministic regardless of insertion order.
 */
export function canonicalizeJson(obj: Record<string, unknown>): string {
  const sortedKeys = Object.keys(obj).sort();
  const sortedObj: Record<string, unknown> = {};
  for (const k of sortedKeys) {
    sortedObj[k] = obj[k] === undefined ? null : obj[k];
  }
  return JSON.stringify(sortedObj);
}

/**
 * Calculates a deterministic SHA-256 hash for a given legacy row.
 */
export function calculateRowHash(
  sourceTable: string,
  sourcePrimaryKey: string,
  payload: Record<string, unknown>,
): string {
  const canonicalPayload = canonicalizeJson(payload);
  const content = `${sourceTable}:${sourcePrimaryKey}:${canonicalPayload}`;
  return crypto.createHash("sha256").update(content, "utf8").digest("hex");
}

export interface HustlerStagingOptions {
  prisma: PrismaClient;
  dumpFilePath: string;
  chunkSize?: number;
  onProgress?: (insertedSoFar: number, totalExpected: number) => void;
}

export interface HustlerStagingResult {
  batchId: string;
  companyId: string;
  companyName: string;
  sourceSystem: SourceSystem;
  filename: string;
  checksumSha256: string;
  status: HistoricalImportBatchStatus;
  isIdempotentReuse: boolean;
  totalRowsInserted: number;
  rowsByTable: Record<string, number>;
  totalStagedRows: number;
  stagingDurationMs: number;
  duplicateLegacyPksCount: number;
  duplicateRowHashesCount: number;
}

export async function stageHustlerDump(
  options: HustlerStagingOptions,
): Promise<HustlerStagingResult> {
  const { prisma, dumpFilePath, chunkSize = 1000, onProgress } = options;
  const startTime = Date.now();

  // 1. Verify Dump File Checksum
  const metadata = await calculateDumpFileMetadata(dumpFilePath);
  if (metadata.sha256.toLowerCase() !== EXPECTED_HUSTLER_CHECKSUM.toLowerCase()) {
    throw new Error(
      `Dump checksum mismatch! Expected '${EXPECTED_HUSTLER_CHECKSUM}', got '${metadata.sha256}'. Aborting staging.`,
    );
  }

  // 2. Resolve Active Company
  const company = await prisma.company.findFirst({
    orderBy: { createdAt: "asc" },
  });
  if (!company) {
    throw new Error("No active Company found in database. Cannot stage import.");
  }

  // 3. Check for Existing Batch
  let batch = await prisma.historicalImportBatch.findFirst({
    where: {
      companyId: company.id,
      sourceSystem: SourceSystem.HUSTLER_LEGACY_DUMP,
      checksumSha256: metadata.sha256,
    },
  });

  // 4. Idempotency Check
  if (batch && batch.status === HistoricalImportBatchStatus.STAGED) {
    const existingStagingCount = await prisma.historicalStagingRow.count({
      where: { importBatchId: batch.id },
    });

    if (existingStagingCount === TOTAL_EXPECTED_HUSTLER_ROWS) {
      // Fetch table counts for report
      const tableCounts = await prisma.historicalStagingRow.groupBy({
        by: ["sourceTable"],
        where: { importBatchId: batch.id },
        _count: { id: true },
      });

      const rowsByTable: Record<string, number> = {};
      for (const tc of tableCounts) {
        rowsByTable[tc.sourceTable] = tc._count.id;
      }

      return {
        batchId: batch.id,
        companyId: company.id,
        companyName: company.name,
        sourceSystem: batch.sourceSystem,
        filename: batch.filename,
        checksumSha256: batch.checksumSha256,
        status: batch.status,
        isIdempotentReuse: true,
        totalRowsInserted: 0,
        rowsByTable,
        totalStagedRows: existingStagingCount,
        stagingDurationMs: Date.now() - startTime,
        duplicateLegacyPksCount: 0,
        duplicateRowHashesCount: 0,
      };
    }
  }

  // If batch exists in CREATED or FAILED status, clean up any previous partial staging rows
  if (batch) {
    await prisma.historicalStagingRow.deleteMany({
      where: { importBatchId: batch.id },
    });
    batch = await prisma.historicalImportBatch.update({
      where: { id: batch.id },
      data: {
        status: HistoricalImportBatchStatus.CREATED,
        recordsImported: 0,
        recordsRejected: 0,
        metadata: Prisma.JsonNull,
      },
    });
  } else {
    // Create new batch
    batch = await prisma.historicalImportBatch.create({
      data: {
        companyId: company.id,
        sourceSystem: SourceSystem.HUSTLER_LEGACY_DUMP,
        filename: path.basename(dumpFilePath),
        checksumSha256: metadata.sha256,
        status: HistoricalImportBatchStatus.CREATED,
        recordsImported: 0,
        recordsRejected: 0,
      },
    });
  }

  const batchId = batch.id;
  const seenPksByTable = new Map<string, Set<string>>();
  for (const t of HUSTLER_SUPPORTED_TABLES) {
    seenPksByTable.set(t, new Set<string>());
  }
  const seenHashes = new Set<string>();

  let duplicatePksCount = 0;
  let duplicateHashesCount = 0;
  let globalRowIndex = 0;
  let totalInserted = 0;

  type StagingInsertItem = {
    id: string;
    importBatchId: string;
    sourceSystem: SourceSystem;
    sourceTable: string;
    sourcePrimaryKey: string;
    rowIndex: number;
    payload: any;
    payloadHash: string;
  };

  let buffer: StagingInsertItem[] = [];

  const flushBuffer = async () => {
    if (buffer.length === 0) return;
    await prisma.historicalStagingRow.createMany({
      data: buffer,
    });
    totalInserted += buffer.length;
    if (onProgress) {
      onProgress(totalInserted, TOTAL_EXPECTED_HUSTLER_ROWS);
    }
    buffer = [];
  };

  try {
    const parseResult = await parseHustlerDump(dumpFilePath, {
      onStatement: async (table, columns, rows) => {
        const tablePks = seenPksByTable.get(table)!;

        for (const rowVals of rows) {
          const rowObj: Record<string, unknown> = {};
          for (let colIdx = 0; colIdx < columns.length; colIdx++) {
            const colName = columns[colIdx]!;
            rowObj[colName] = rowVals[colIdx] ?? null;
          }

          const pk = getLegacyPrimaryKey(table, rowObj);
          if (tablePks.has(pk)) {
            duplicatePksCount++;
            throw new Error(
              `Duplicate legacy primary key '${pk}' detected in table '${table}'!`,
            );
          }
          tablePks.add(pk);

          const hash = calculateRowHash(table, pk, rowObj);
          if (seenHashes.has(hash)) {
            duplicateHashesCount++;
          }
          seenHashes.add(hash);

          buffer.push({
            id: crypto.randomUUID(),
            importBatchId: batchId,
            sourceSystem: SourceSystem.HUSTLER_LEGACY_DUMP,
            sourceTable: table,
            sourcePrimaryKey: pk,
            rowIndex: globalRowIndex++,
            payload: rowObj,
            payloadHash: hash,
          });

          if (buffer.length >= chunkSize) {
            await flushBuffer();
          }
        }
      },
    });

    // Flush any remaining buffer items
    await flushBuffer();

    // 5. Validate Exact Counts Per Table
    const rowsByTable: Record<string, number> = {};
    for (const t of HUSTLER_SUPPORTED_TABLES) {
      const actualCount = seenPksByTable.get(t)?.size || 0;
      const expectedCount = EXPECTED_HUSTLER_TABLE_COUNTS[t];
      rowsByTable[t] = actualCount;

      if (actualCount !== expectedCount) {
        throw new Error(
          `Row count mismatch for table '${t}': expected ${expectedCount}, got ${actualCount}!`,
        );
      }
    }

    if (totalInserted !== TOTAL_EXPECTED_HUSTLER_ROWS) {
      throw new Error(
        `Total staged row count mismatch: expected ${TOTAL_EXPECTED_HUSTLER_ROWS}, got ${totalInserted}!`,
      );
    }

    const duration = Date.now() - startTime;

    // 6. Transition Batch to STAGED
    const updatedBatch = await prisma.historicalImportBatch.update({
      where: { id: batchId },
      data: {
        status: HistoricalImportBatchStatus.STAGED,
        recordsImported: totalInserted,
        recordsRejected: 0,
        metadata: {
          parserVersion: "1.0.0",
          tablesFound: parseResult.summary.tablesFoundCount,
          supportedTables: parseResult.summary.supportedTables.length,
          rowsByTable,
          totalRowsSupported: totalInserted,
          totalIgnoredRows: parseResult.summary.totalIgnoredRows,
          parseErrors: parseResult.summary.parseErrorsCount,
          stagingDurationMs: duration,
        },
      },
    });

    return {
      batchId: updatedBatch.id,
      companyId: company.id,
      companyName: company.name,
      sourceSystem: updatedBatch.sourceSystem,
      filename: updatedBatch.filename,
      checksumSha256: updatedBatch.checksumSha256,
      status: updatedBatch.status,
      isIdempotentReuse: false,
      totalRowsInserted: totalInserted,
      rowsByTable,
      totalStagedRows: totalInserted,
      stagingDurationMs: duration,
      duplicateLegacyPksCount: duplicatePksCount,
      duplicateRowHashesCount: duplicateHashesCount,
    };
  } catch (err: any) {
    // Transition to FAILED on any staging error
    await prisma.historicalImportBatch.update({
      where: { id: batchId },
      data: {
        status: HistoricalImportBatchStatus.FAILED,
        metadata: {
          error: err.message,
          stack: err.stack,
          failedAt: new Date().toISOString(),
          totalInsertedBeforeFailure: totalInserted,
        },
      },
    });
    throw err;
  }
}
