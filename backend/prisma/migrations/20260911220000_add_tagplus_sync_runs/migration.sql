-- CreateEnum
CREATE TYPE "TagPlusSyncStatus" AS ENUM ('RUNNING', 'COMPLETED', 'FAILED');

-- CreateEnum
CREATE TYPE "TagPlusSyncStage" AS ENUM ('CUSTOMERS', 'PRODUCTS', 'SALES', 'COMPLETED', 'FAILED');

-- CreateTable
CREATE TABLE "tagplus_sync_runs" (
    "id" UUID NOT NULL,
    "connection_id" UUID NOT NULL,
    "status" "TagPlusSyncStatus" NOT NULL DEFAULT 'RUNNING',
    "current_stage" "TagPlusSyncStage" NOT NULL DEFAULT 'CUSTOMERS',
    "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMP(3),
    "error_stage" "TagPlusSyncStage",
    "error_message" TEXT,
    "error_category" TEXT,
    "summary" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tagplus_sync_runs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "tagplus_sync_runs_connection_id_status_idx" ON "tagplus_sync_runs"("connection_id", "status");

-- AddForeignKey
ALTER TABLE "tagplus_sync_runs" ADD CONSTRAINT "tagplus_sync_runs_connection_id_fkey" FOREIGN KEY ("connection_id") REFERENCES "tagplus_connections"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
