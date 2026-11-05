-- CreateTable
CREATE TABLE "historical_staging_rows" (
    "id" UUID NOT NULL,
    "import_batch_id" UUID NOT NULL,
    "source_system" "SourceSystem" NOT NULL,
    "source_table" TEXT NOT NULL,
    "source_primary_key" TEXT NOT NULL,
    "row_index" INTEGER NOT NULL,
    "payload" JSONB NOT NULL,
    "payload_hash" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "historical_staging_rows_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "historical_staging_rows_import_batch_id_source_table_idx" ON "historical_staging_rows"("import_batch_id", "source_table");

-- CreateIndex
CREATE UNIQUE INDEX "historical_staging_rows_import_batch_id_source_table_source_key" ON "historical_staging_rows"("import_batch_id", "source_table", "source_primary_key");

-- AddForeignKey
ALTER TABLE "historical_staging_rows" ADD CONSTRAINT "historical_staging_rows_import_batch_id_fkey" FOREIGN KEY ("import_batch_id") REFERENCES "historical_import_batches"("id") ON DELETE CASCADE ON UPDATE CASCADE;
