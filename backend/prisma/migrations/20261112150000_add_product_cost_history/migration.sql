-- CreateEnum
CREATE TYPE "ProductCostSource" AS ENUM ('PURCHASE', 'STOCK_ADJUSTMENT', 'ERP_SNAPSHOT', 'MANUAL', 'CURRENT_COST_PROXY');

-- CreateTable
CREATE TABLE "product_cost_history" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "product_id" UUID,
    "source_product_id" TEXT NOT NULL,
    "unit_cost" DECIMAL(12,4) NOT NULL,
    "cost_source" "ProductCostSource" NOT NULL DEFAULT 'MANUAL',
    "valid_from" TIMESTAMP(3) NOT NULL,
    "valid_to" TIMESTAMP(3),
    "source_document_id" UUID,
    "note" TEXT,
    "created_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "product_cost_history_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "product_cost_history_product_id_idx" ON "product_cost_history"("product_id");
CREATE INDEX "product_cost_history_source_product_id_idx" ON "product_cost_history"("source_product_id");
CREATE INDEX "product_cost_history_valid_from_idx" ON "product_cost_history"("valid_from");

-- AddForeignKey
ALTER TABLE "product_cost_history" ADD CONSTRAINT "product_cost_history_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Security Hardening (RLS + Revoke public grants)
ALTER TABLE "product_cost_history" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE "product_cost_history" FROM anon, authenticated;
