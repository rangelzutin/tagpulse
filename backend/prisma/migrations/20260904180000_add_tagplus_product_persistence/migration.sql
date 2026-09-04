-- CreateEnum
CREATE TYPE "ProductSyncRunStatus" AS ENUM ('RUNNING', 'COMPLETED', 'FAILED');

-- CreateTable
CREATE TABLE "product_sync_runs" (
    "id" UUID NOT NULL,
    "connection_id" UUID NOT NULL,
    "status" "ProductSyncRunStatus" NOT NULL DEFAULT 'RUNNING',
    "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMP(3),
    "pages_fetched" INTEGER NOT NULL DEFAULT 0,
    "records_fetched" INTEGER NOT NULL DEFAULT 0,
    "records_inserted" INTEGER NOT NULL DEFAULT 0,
    "records_updated" INTEGER NOT NULL DEFAULT 0,
    "records_unchanged" INTEGER NOT NULL DEFAULT 0,
    "records_no_longer_observed" INTEGER NOT NULL DEFAULT 0,
    "last_completed_page" INTEGER NOT NULL DEFAULT 0,
    "terminal_empty_page" INTEGER,
    "error_category" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "product_sync_runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "products" (
    "id" UUID NOT NULL,
    "connection_id" UUID NOT NULL,
    "source_id" TEXT NOT NULL,
    "code" TEXT,
    "external_code" TEXT,
    "barcode" TEXT,
    "taxable_barcode" TEXT,
    "grade_code" TEXT,
    "description" TEXT,
    "short_description" TEXT,
    "active" BOOLEAN,
    "moved" BOOLEAN,
    "commercializable" BOOLEAN,
    "sold_separately" BOOLEAN,
    "type" TEXT,
    "purpose" TEXT,
    "brand" TEXT,
    "parent_source_id" TEXT,
    "category_source_id" TEXT,
    "category_description" TEXT,
    "department_source_id" TEXT,
    "department_description" TEXT,
    "retail_sale_price" DECIMAL(12,4),
    "offer_price" DECIMAL(12,4),
    "effective_cost" DECIMAL(12,4),
    "average_cost" DECIMAL(12,4),
    "other_expenses_cost" DECIMAL(12,4),
    "stock_quantity" DECIMAL(12,4),
    "stock_min_quantity" DECIMAL(12,4),
    "stock_max_quantity" DECIMAL(12,4),
    "output_unit_source_id" TEXT,
    "output_unit_abbreviation" TEXT,
    "output_unit_description" TEXT,
    "output_unit_fractioned" BOOLEAN,
    "source_created_at" TIMESTAMP(3),
    "source_updated_at" TIMESTAMP(3),
    "source_present" BOOLEAN NOT NULL,
    "last_seen_at" TIMESTAMP(3) NOT NULL,
    "last_synced_at" TIMESTAMP(3) NOT NULL,
    "last_seen_sync_run_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "products_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "product_sync_runs_connection_id_idx" ON "product_sync_runs"("connection_id");

-- CreateIndex
CREATE INDEX "products_connection_id_code_idx" ON "products"("connection_id", "code");

-- CreateIndex
CREATE INDEX "products_connection_id_barcode_idx" ON "products"("connection_id", "barcode");

-- CreateIndex
CREATE INDEX "products_connection_id_parent_source_id_idx" ON "products"("connection_id", "parent_source_id");

-- CreateIndex
CREATE INDEX "products_connection_id_source_present_idx" ON "products"("connection_id", "source_present");

-- CreateIndex
CREATE UNIQUE INDEX "products_connection_id_source_id_key" ON "products"("connection_id", "source_id");

-- AddForeignKey
ALTER TABLE "product_sync_runs" ADD CONSTRAINT "product_sync_runs_connection_id_fkey" FOREIGN KEY ("connection_id") REFERENCES "tagplus_connections"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "products" ADD CONSTRAINT "products_connection_id_fkey" FOREIGN KEY ("connection_id") REFERENCES "tagplus_connections"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "products" ADD CONSTRAINT "products_last_seen_sync_run_id_fkey" FOREIGN KEY ("last_seen_sync_run_id") REFERENCES "product_sync_runs"("id") ON DELETE SET NULL ON UPDATE CASCADE;
