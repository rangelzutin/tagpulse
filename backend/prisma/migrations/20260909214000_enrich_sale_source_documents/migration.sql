-- AlterTable
ALTER TABLE "sale_source_documents" ADD COLUMN "net_amount" DECIMAL(12,4),
ADD COLUMN "status" TEXT,
ADD COLUMN "source_created_at" TIMESTAMP(3),
ADD COLUMN "source_confirmed_at" TIMESTAMP(3),
ADD COLUMN "source_emissao_at" TIMESTAMP(3),
ADD COLUMN "realized_date" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "sale_source_documents_connection_id_realized_date_idx" ON "sale_source_documents"("connection_id", "realized_date");
