-- AlterEnum
ALTER TYPE "TagPlusSyncStage" ADD VALUE 'CATEGORIES';

-- CreateTable
CREATE TABLE "categories" (
    "id" UUID NOT NULL,
    "connection_id" UUID NOT NULL,
    "source_id" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "parent_source_id" TEXT,
    "type" TEXT,
    "location" TEXT,
    "source_present" BOOLEAN NOT NULL DEFAULT true,
    "last_seen_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "categories_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "categories_connection_id_parent_source_id_idx" ON "categories"("connection_id", "parent_source_id");

-- CreateIndex
CREATE UNIQUE INDEX "categories_connection_id_source_id_key" ON "categories"("connection_id", "source_id");

-- AddForeignKey
ALTER TABLE "categories" ADD CONSTRAINT "categories_connection_id_fkey" FOREIGN KEY ("connection_id") REFERENCES "tagplus_connections"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "categories" ADD CONSTRAINT "categories_connection_id_parent_source_id_fkey" FOREIGN KEY ("connection_id", "parent_source_id") REFERENCES "categories"("connection_id", "source_id") ON DELETE RESTRICT ON UPDATE CASCADE;
