-- CreateEnum
CREATE TYPE "FinancialRecordType" AS ENUM ('ENTRADA', 'SAIDA');

-- CreateEnum
CREATE TYPE "FinancialSyncItemStatus" AS ENUM ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED', 'NOT_FOUND');

-- CreateTable
CREATE TABLE "financial_records" (
    "id" UUID NOT NULL,
    "connection_id" UUID NOT NULL,
    "source_id" TEXT NOT NULL,
    "type" "FinancialRecordType" NOT NULL,
    "is_confirmed" BOOLEAN NOT NULL,
    "is_transfer" BOOLEAN NOT NULL,
    "description" TEXT,
    "document_number" TEXT,
    "linked_movement_number" TEXT,
    "due_date" TIMESTAMP(3) NOT NULL,
    "confirmation_date" TIMESTAMP(3),
    "source_competence_date" TIMESTAMP(3),
    "posting_date" TIMESTAMP(3),
    "source_updated_at" TIMESTAMP(3),
    "original_amount" DECIMAL(12,4) NOT NULL,
    "gross_amount" DECIMAL(12,4),
    "paid_amount" DECIMAL(12,4),
    "total_amount" DECIMAL(12,4),
    "discount_amount" DECIMAL(12,4),
    "surcharge_amount" DECIMAL(12,4),
    "late_interest_amount" DECIMAL(12,4),
    "daily_interest_rate" DECIMAL(12,4),
    "installment_number" INTEGER,
    "installment_count" INTEGER,
    "budget_plan_source_id" TEXT,
    "bank_account_source_id" TEXT,
    "payment_method_source_id" TEXT,
    "department_source_id" TEXT,
    "entity_source_id" TEXT,
    "entity_type" TEXT,
    "entity_name" TEXT,
    "linked_invoice_installment_source_id" TEXT,
    "source_payload" JSONB,
    "source_present" BOOLEAN NOT NULL DEFAULT true,
    "no_longer_observed_at" TIMESTAMP(3),
    "last_seen_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "financial_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "financial_record_sync_items" (
    "id" UUID NOT NULL,
    "connection_id" UUID NOT NULL,
    "source_id" TEXT NOT NULL,
    "status" "FinancialSyncItemStatus" NOT NULL DEFAULT 'PENDING',
    "attempt_count" INTEGER NOT NULL DEFAULT 0,
    "last_error" TEXT,
    "last_http_status" INTEGER,
    "last_attempt_at" TIMESTAMP(3),
    "completed_at" TIMESTAMP(3),
    "catalog_seen_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "financial_record_sync_items_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "financial_records_connection_id_type_is_confirmed_due_date_idx" ON "financial_records"("connection_id", "type", "is_confirmed", "due_date");

-- CreateIndex
CREATE INDEX "financial_records_connection_id_is_confirmed_confirmation_d_idx" ON "financial_records"("connection_id", "is_confirmed", "confirmation_date");

-- CreateIndex
CREATE INDEX "financial_records_connection_id_budget_plan_source_id_idx" ON "financial_records"("connection_id", "budget_plan_source_id");

-- CreateIndex
CREATE INDEX "financial_records_connection_id_entity_source_id_idx" ON "financial_records"("connection_id", "entity_source_id");

-- CreateIndex
CREATE INDEX "financial_records_connection_id_source_present_idx" ON "financial_records"("connection_id", "source_present");

-- CreateIndex
CREATE UNIQUE INDEX "financial_records_connection_id_source_id_key" ON "financial_records"("connection_id", "source_id");

-- CreateIndex
CREATE INDEX "financial_record_sync_items_connection_id_status_idx" ON "financial_record_sync_items"("connection_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "financial_record_sync_items_connection_id_source_id_key" ON "financial_record_sync_items"("connection_id", "source_id");

-- AddForeignKey
ALTER TABLE "financial_records" ADD CONSTRAINT "financial_records_connection_id_fkey" FOREIGN KEY ("connection_id") REFERENCES "tagplus_connections"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "financial_record_sync_items" ADD CONSTRAINT "financial_record_sync_items_connection_id_fkey" FOREIGN KEY ("connection_id") REFERENCES "tagplus_connections"("id") ON DELETE CASCADE ON UPDATE CASCADE;
