-- CreateTable
CREATE TABLE "sale_source_document_items" (
    "id" UUID NOT NULL,
    "sale_source_document_id" UUID NOT NULL,
    "source_item_id" TEXT NOT NULL,
    "line_number" INTEGER,
    "product_id" UUID,
    "source_product_id" TEXT NOT NULL,
    "quantity" DECIMAL(12,4) NOT NULL,
    "unit_price" DECIMAL(12,4) NOT NULL,
    "discount_amount" DECIMAL(12,4),
    "subtotal" DECIMAL(12,4) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sale_source_document_items_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "sale_source_document_items_sale_source_document_id_source_item_id_key" ON "sale_source_document_items"("sale_source_document_id", "source_item_id");

-- CreateIndex
CREATE INDEX "sale_source_document_items_sale_source_document_id_idx" ON "sale_source_document_items"("sale_source_document_id");

-- CreateIndex
CREATE INDEX "sale_source_document_items_product_id_idx" ON "sale_source_document_items"("product_id");

-- CreateIndex
CREATE INDEX "sale_source_document_items_source_product_id_idx" ON "sale_source_document_items"("source_product_id");

-- AddForeignKey
ALTER TABLE "sale_source_document_items" ADD CONSTRAINT "sale_source_document_items_sale_source_document_id_fkey" FOREIGN KEY ("sale_source_document_id") REFERENCES "sale_source_documents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sale_source_document_items" ADD CONSTRAINT "sale_source_document_items_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE SET NULL ON UPDATE CASCADE;
