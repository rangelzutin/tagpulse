-- CreateEnum
CREATE TYPE "TagPlusSyncMode" AS ENUM ('FULL', 'INCREMENTAL');

-- AlterTable: add mode as nullable and WITHOUT default
ALTER TABLE "tagplus_sync_runs" ADD COLUMN "mode" "TagPlusSyncMode";

-- Backfill existing historical rows to FULL (all prior runs were full scans)
UPDATE "tagplus_sync_runs" SET "mode" = 'FULL' WHERE "mode" IS NULL;

-- AlterTable: enforce NOT NULL only after backfill
ALTER TABLE "tagplus_sync_runs" ALTER COLUMN "mode" SET NOT NULL;

-- AlterTable: set DEFAULT INCREMENTAL for future runs
ALTER TABLE "tagplus_sync_runs" ALTER COLUMN "mode" SET DEFAULT 'INCREMENTAL';

-- AlterTable: add window_since and window_until nullable
ALTER TABLE "tagplus_sync_runs" ADD COLUMN "window_since" TIMESTAMP(3);
ALTER TABLE "tagplus_sync_runs" ADD COLUMN "window_until" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "tagplus_sync_runs_connection_id_mode_status_idx" ON "tagplus_sync_runs"("connection_id", "mode", "status");
