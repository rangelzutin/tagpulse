-- DropForeignKey
ALTER TABLE "sales" DROP CONSTRAINT "sales_import_batch_id_fkey";

-- DropForeignKey
ALTER TABLE "sale_source_documents" DROP CONSTRAINT "sale_source_documents_import_batch_id_fkey";

-- DropForeignKey
ALTER TABLE "financial_records" DROP CONSTRAINT "financial_records_import_batch_id_fkey";

-- DropForeignKey
ALTER TABLE "historical_source_identities" DROP CONSTRAINT "historical_source_identities_import_batch_id_fkey";

-- AddForeignKey
ALTER TABLE "sales" ADD CONSTRAINT "sales_import_batch_id_fkey" FOREIGN KEY ("import_batch_id") REFERENCES "historical_import_batches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sale_source_documents" ADD CONSTRAINT "sale_source_documents_import_batch_id_fkey" FOREIGN KEY ("import_batch_id") REFERENCES "historical_import_batches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "financial_records" ADD CONSTRAINT "financial_records_import_batch_id_fkey" FOREIGN KEY ("import_batch_id") REFERENCES "historical_import_batches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "historical_source_identities" ADD CONSTRAINT "historical_source_identities_import_batch_id_fkey" FOREIGN KEY ("import_batch_id") REFERENCES "historical_import_batches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

