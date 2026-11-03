-- CreateEnum
CREATE TYPE "SourceSystem" AS ENUM ('TAGPLUS_CURRENT', 'HUSTLER_LEGACY_DUMP', 'GLOBALLINK_LEGACY_DUMP');

-- CreateEnum
CREATE TYPE "OperationUnit" AS ENUM ('HUSTLER', 'NINECLOUDS', 'SHARED', 'UNRESOLVED');

-- CreateEnum
CREATE TYPE "SalesChannel" AS ENUM ('VAREJO', 'ATACADO');

-- CreateEnum
CREATE TYPE "HistoricalImportBatchStatus" AS ENUM ('CREATED', 'STAGED', 'RECONCILED', 'ACTIVATED', 'FAILED', 'ROLLED_BACK');

-- AlterTable
ALTER TABLE "financial_records" ADD COLUMN     "import_batch_id" UUID,
ADD COLUMN     "operation_unit" "OperationUnit",
ADD COLUMN     "source_system" "SourceSystem" NOT NULL DEFAULT 'TAGPLUS_CURRENT';

-- AlterTable
ALTER TABLE "sale_source_documents" ADD COLUMN     "import_batch_id" UUID,
ADD COLUMN     "operation_unit" "OperationUnit",
ADD COLUMN     "source_system" "SourceSystem" NOT NULL DEFAULT 'TAGPLUS_CURRENT';

-- AlterTable
ALTER TABLE "sales" ADD COLUMN     "import_batch_id" UUID,
ADD COLUMN     "operation_unit" "OperationUnit",
ADD COLUMN     "sales_channel" "SalesChannel",
ADD COLUMN     "source_system" "SourceSystem" NOT NULL DEFAULT 'TAGPLUS_CURRENT';

-- CreateTable
CREATE TABLE "historical_import_batches" (
    "id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "source_system" "SourceSystem" NOT NULL,
    "filename" TEXT NOT NULL,
    "checksum_sha256" TEXT NOT NULL,
    "status" "HistoricalImportBatchStatus" NOT NULL DEFAULT 'CREATED',
    "records_imported" INTEGER NOT NULL DEFAULT 0,
    "records_rejected" INTEGER NOT NULL DEFAULT 0,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "activated_at" TIMESTAMP(3),

    CONSTRAINT "historical_import_batches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "historical_source_identities" (
    "id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "import_batch_id" UUID,
    "source_system" "SourceSystem" NOT NULL,
    "source_entity" TEXT NOT NULL,
    "source_primary_key" TEXT NOT NULL,
    "canonical_entity_type" TEXT NOT NULL,
    "canonical_entity_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "historical_source_identities_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "historical_import_batches_company_id_source_system_status_idx" ON "historical_import_batches"("company_id", "source_system", "status");

-- CreateIndex
CREATE INDEX "historical_source_identities_canonical_entity_type_canonica_idx" ON "historical_source_identities"("canonical_entity_type", "canonical_entity_id");

-- CreateIndex
CREATE INDEX "historical_source_identities_import_batch_id_idx" ON "historical_source_identities"("import_batch_id");

-- CreateIndex
CREATE UNIQUE INDEX "historical_source_identities_company_id_source_system_sourc_key" ON "historical_source_identities"("company_id", "source_system", "source_entity", "source_primary_key");

-- CreateIndex
CREATE INDEX "financial_records_source_system_operation_unit_idx" ON "financial_records"("source_system", "operation_unit");

-- CreateIndex
CREATE INDEX "financial_records_import_batch_id_idx" ON "financial_records"("import_batch_id");

-- CreateIndex
CREATE INDEX "sale_source_documents_source_system_operation_unit_idx" ON "sale_source_documents"("source_system", "operation_unit");

-- CreateIndex
CREATE INDEX "sale_source_documents_import_batch_id_idx" ON "sale_source_documents"("import_batch_id");

-- CreateIndex
CREATE INDEX "sales_source_system_operation_unit_idx" ON "sales"("source_system", "operation_unit");

-- CreateIndex
CREATE INDEX "sales_import_batch_id_idx" ON "sales"("import_batch_id");

-- AddForeignKey
ALTER TABLE "sales" ADD CONSTRAINT "sales_import_batch_id_fkey" FOREIGN KEY ("import_batch_id") REFERENCES "historical_import_batches"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sale_source_documents" ADD CONSTRAINT "sale_source_documents_import_batch_id_fkey" FOREIGN KEY ("import_batch_id") REFERENCES "historical_import_batches"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "financial_records" ADD CONSTRAINT "financial_records_import_batch_id_fkey" FOREIGN KEY ("import_batch_id") REFERENCES "historical_import_batches"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "historical_import_batches" ADD CONSTRAINT "historical_import_batches_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "historical_source_identities" ADD CONSTRAINT "historical_source_identities_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "historical_source_identities" ADD CONSTRAINT "historical_source_identities_import_batch_id_fkey" FOREIGN KEY ("import_batch_id") REFERENCES "historical_import_batches"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- RenameIndex
ALTER INDEX "sale_source_document_items_sale_source_document_id_source_item_" RENAME TO "sale_source_document_items_sale_source_document_id_source_i_key";
