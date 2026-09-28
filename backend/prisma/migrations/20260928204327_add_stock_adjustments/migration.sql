-- CreateEnum
CREATE TYPE "StockAdjustmentSyncItemStatus" AS ENUM ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED', 'NOT_FOUND');

-- CreateTable
CREATE TABLE "stock_adjustment_sync_items" (
    "id" UUID NOT NULL,
    "connection_id" UUID NOT NULL,
    "source_id" TEXT NOT NULL,
    "status" "StockAdjustmentSyncItemStatus" NOT NULL DEFAULT 'PENDING',
    "attempt_count" INTEGER NOT NULL DEFAULT 0,
    "last_error" TEXT,
    "last_http_status" INTEGER,
    "last_attempt_at" TIMESTAMP(3),
    "completed_at" TIMESTAMP(3),
    "catalog_seen_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "stock_adjustment_sync_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stock_adjustments" (
    "id" UUID NOT NULL,
    "connection_id" UUID NOT NULL,
    "source_id" TEXT NOT NULL,
    "number" TEXT,
    "external_code" TEXT,
    "type" TEXT NOT NULL,
    "status" TEXT,
    "entity_source_id" TEXT,
    "entity_name" TEXT,
    "entity_cpf" TEXT,
    "entity_cnpj" TEXT,
    "source_created_at" TIMESTAMP(3) NOT NULL,
    "source_updated_at" TIMESTAMP(3),
    "confirmation_date" TIMESTAMP(3),
    "notes" TEXT,
    "employee_source_id" TEXT,
    "employee_name" TEXT,
    "freight_amount" DECIMAL(12,4) NOT NULL DEFAULT 0,
    "other_amount" DECIMAL(12,4) NOT NULL DEFAULT 0,
    "total_amount" DECIMAL(12,4) NOT NULL DEFAULT 0,
    "has_invoice" BOOLEAN NOT NULL DEFAULT false,
    "source_payload" JSONB,
    "source_present" BOOLEAN NOT NULL DEFAULT true,
    "no_longer_observed_at" TIMESTAMP(3),
    "last_seen_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "stock_adjustments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stock_adjustment_items" (
    "id" UUID NOT NULL,
    "stock_adjustment_id" UUID NOT NULL,
    "source_item_id" TEXT NOT NULL,
    "item_number" INTEGER NOT NULL,
    "product_source_id" TEXT,
    "product_code" TEXT,
    "product_description" TEXT,
    "quantity" DECIMAL(12,4) NOT NULL,
    "output_unit" TEXT,
    "unit_amount" DECIMAL(12,4) NOT NULL,
    "surcharge_amount" DECIMAL(12,4) NOT NULL DEFAULT 0,
    "discount_amount" DECIMAL(12,4) NOT NULL DEFAULT 0,
    "subtotal_amount" DECIMAL(12,4) NOT NULL,
    "cfop" TEXT,
    "details" TEXT,
    "unit_type" TEXT,
    "remaining_unit" TEXT,
    "category_source_id" TEXT,
    "category_description" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "stock_adjustment_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stock_adjustment_financial_links" (
    "id" UUID NOT NULL,
    "stock_adjustment_id" UUID NOT NULL,
    "financial_record_id" UUID,
    "financial_record_source_id" TEXT NOT NULL,
    "invoice_number" TEXT,
    "installment_number" INTEGER,
    "first_seen_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_seen_at" TIMESTAMP(3) NOT NULL,
    "source_present" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "stock_adjustment_financial_links_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "stock_adjustment_sync_items_connection_id_status_idx" ON "stock_adjustment_sync_items"("connection_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "stock_adjustment_sync_items_connection_id_source_id_key" ON "stock_adjustment_sync_items"("connection_id", "source_id");

-- CreateIndex
CREATE INDEX "stock_adjustments_connection_id_type_idx" ON "stock_adjustments"("connection_id", "type");

-- CreateIndex
CREATE INDEX "stock_adjustments_connection_id_number_idx" ON "stock_adjustments"("connection_id", "number");

-- CreateIndex
CREATE INDEX "stock_adjustments_connection_id_confirmation_date_idx" ON "stock_adjustments"("connection_id", "confirmation_date");

-- CreateIndex
CREATE INDEX "stock_adjustments_connection_id_entity_source_id_idx" ON "stock_adjustments"("connection_id", "entity_source_id");

-- CreateIndex
CREATE INDEX "stock_adjustments_connection_id_source_present_idx" ON "stock_adjustments"("connection_id", "source_present");

-- CreateIndex
CREATE UNIQUE INDEX "stock_adjustments_connection_id_source_id_key" ON "stock_adjustments"("connection_id", "source_id");

-- CreateIndex
CREATE INDEX "stock_adjustment_items_stock_adjustment_id_idx" ON "stock_adjustment_items"("stock_adjustment_id");

-- CreateIndex
CREATE INDEX "stock_adjustment_items_product_source_id_idx" ON "stock_adjustment_items"("product_source_id");

-- CreateIndex
CREATE UNIQUE INDEX "stock_adjustment_items_stock_adjustment_id_source_item_id_key" ON "stock_adjustment_items"("stock_adjustment_id", "source_item_id");

-- CreateIndex
CREATE INDEX "stock_adjustment_financial_links_stock_adjustment_id_idx" ON "stock_adjustment_financial_links"("stock_adjustment_id");

-- CreateIndex
CREATE INDEX "stock_adjustment_financial_links_financial_record_source_id_idx" ON "stock_adjustment_financial_links"("financial_record_source_id");

-- CreateIndex
CREATE INDEX "stock_adjustment_financial_links_financial_record_id_idx" ON "stock_adjustment_financial_links"("financial_record_id");

-- CreateIndex
CREATE UNIQUE INDEX "stock_adjustment_financial_links_stock_adjustment_id_financ_key" ON "stock_adjustment_financial_links"("stock_adjustment_id", "financial_record_source_id");

-- AddForeignKey
ALTER TABLE "stock_adjustment_sync_items" ADD CONSTRAINT "stock_adjustment_sync_items_connection_id_fkey" FOREIGN KEY ("connection_id") REFERENCES "tagplus_connections"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_adjustments" ADD CONSTRAINT "stock_adjustments_connection_id_fkey" FOREIGN KEY ("connection_id") REFERENCES "tagplus_connections"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_adjustment_items" ADD CONSTRAINT "stock_adjustment_items_stock_adjustment_id_fkey" FOREIGN KEY ("stock_adjustment_id") REFERENCES "stock_adjustments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_adjustment_financial_links" ADD CONSTRAINT "stock_adjustment_financial_links_stock_adjustment_id_fkey" FOREIGN KEY ("stock_adjustment_id") REFERENCES "stock_adjustments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_adjustment_financial_links" ADD CONSTRAINT "stock_adjustment_financial_links_financial_record_id_fkey" FOREIGN KEY ("financial_record_id") REFERENCES "financial_records"("id") ON DELETE SET NULL ON UPDATE CASCADE;
