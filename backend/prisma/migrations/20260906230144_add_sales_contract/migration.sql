-- CreateEnum
CREATE TYPE "SaleAnchorType" AS ENUM ('PEDIDO', 'VENDA_SIMPLES', 'NFE');

-- CreateTable
CREATE TABLE "sales" (
    "id" UUID NOT NULL,
    "connection_id" UUID NOT NULL,
    "anchor_type" "SaleAnchorType" NOT NULL,
    "anchor_source_id" TEXT NOT NULL,
    "net_amount" DECIMAL(12,4) NOT NULL,
    "customer_id" UUID,
    "source_created_at" TIMESTAMP(3),
    "source_confirmed_at" TIMESTAMP(3),
    "source_emissao_at" TIMESTAMP(3),
    "commercial_date" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sales_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sale_items" (
    "id" UUID NOT NULL,
    "sale_id" UUID NOT NULL,
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

    CONSTRAINT "sale_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sale_source_documents" (
    "id" UUID NOT NULL,
    "sale_id" UUID NOT NULL,
    "connection_id" UUID NOT NULL,
    "doc_type" "SaleAnchorType" NOT NULL,
    "source_id" TEXT NOT NULL,
    "source_present" BOOLEAN NOT NULL,
    "last_seen_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sale_source_documents_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "sales_connection_id_anchor_type_idx" ON "sales"("connection_id", "anchor_type");

-- CreateIndex
CREATE UNIQUE INDEX "sales_connection_id_anchor_type_anchor_source_id_key" ON "sales"("connection_id", "anchor_type", "anchor_source_id");

-- CreateIndex
CREATE UNIQUE INDEX "sale_items_sale_id_source_item_id_key" ON "sale_items"("sale_id", "source_item_id");

-- CreateIndex
CREATE INDEX "sale_source_documents_sale_id_idx" ON "sale_source_documents"("sale_id");

-- CreateIndex
CREATE UNIQUE INDEX "sale_source_documents_connection_id_doc_type_source_id_key" ON "sale_source_documents"("connection_id", "doc_type", "source_id");

-- AddForeignKey
ALTER TABLE "sales" ADD CONSTRAINT "sales_connection_id_fkey" FOREIGN KEY ("connection_id") REFERENCES "tagplus_connections"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales" ADD CONSTRAINT "sales_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sale_items" ADD CONSTRAINT "sale_items_sale_id_fkey" FOREIGN KEY ("sale_id") REFERENCES "sales"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sale_items" ADD CONSTRAINT "sale_items_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sale_source_documents" ADD CONSTRAINT "sale_source_documents_sale_id_fkey" FOREIGN KEY ("sale_id") REFERENCES "sales"("id") ON DELETE CASCADE ON UPDATE CASCADE;
