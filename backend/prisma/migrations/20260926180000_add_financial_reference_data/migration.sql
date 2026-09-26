-- CreateTable
CREATE TABLE "financial_budget_plans" (
    "id" UUID NOT NULL,
    "connection_id" UUID NOT NULL,
    "source_id" TEXT NOT NULL,
    "parent_source_id" TEXT,
    "type" TEXT,
    "description" TEXT NOT NULL,
    "position" TEXT,
    "is_protected" BOOLEAN NOT NULL DEFAULT false,
    "source_dre_classification" JSONB,
    "source_present" BOOLEAN NOT NULL DEFAULT true,
    "no_longer_observed_at" TIMESTAMP(3),
    "last_seen_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "financial_budget_plans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bank_accounts" (
    "id" UUID NOT NULL,
    "connection_id" UUID NOT NULL,
    "source_id" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "raw_details" JSONB,
    "source_present" BOOLEAN NOT NULL DEFAULT true,
    "no_longer_observed_at" TIMESTAMP(3),
    "last_seen_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "bank_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payment_methods" (
    "id" UUID NOT NULL,
    "connection_id" UUID NOT NULL,
    "source_id" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "source_active" BOOLEAN NOT NULL DEFAULT true,
    "source_present" BOOLEAN NOT NULL DEFAULT true,
    "no_longer_observed_at" TIMESTAMP(3),
    "last_seen_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payment_methods_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "departments" (
    "id" UUID NOT NULL,
    "connection_id" UUID NOT NULL,
    "source_id" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "source_present" BOOLEAN NOT NULL DEFAULT true,
    "no_longer_observed_at" TIMESTAMP(3),
    "last_seen_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "departments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "financial_budget_plans_connection_id_parent_source_id_idx" ON "financial_budget_plans"("connection_id", "parent_source_id");

-- CreateIndex
CREATE UNIQUE INDEX "financial_budget_plans_connection_id_source_id_key" ON "financial_budget_plans"("connection_id", "source_id");

-- CreateIndex
CREATE UNIQUE INDEX "bank_accounts_connection_id_source_id_key" ON "bank_accounts"("connection_id", "source_id");

-- CreateIndex
CREATE UNIQUE INDEX "payment_methods_connection_id_source_id_key" ON "payment_methods"("connection_id", "source_id");

-- CreateIndex
CREATE UNIQUE INDEX "departments_connection_id_source_id_key" ON "departments"("connection_id", "source_id");

-- AddForeignKey
ALTER TABLE "financial_budget_plans" ADD CONSTRAINT "financial_budget_plans_connection_id_fkey" FOREIGN KEY ("connection_id") REFERENCES "tagplus_connections"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "financial_budget_plans" ADD CONSTRAINT "financial_budget_plans_connection_id_parent_source_id_fkey" FOREIGN KEY ("connection_id", "parent_source_id") REFERENCES "financial_budget_plans"("connection_id", "source_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bank_accounts" ADD CONSTRAINT "bank_accounts_connection_id_fkey" FOREIGN KEY ("connection_id") REFERENCES "tagplus_connections"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_methods" ADD CONSTRAINT "payment_methods_connection_id_fkey" FOREIGN KEY ("connection_id") REFERENCES "tagplus_connections"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "departments" ADD CONSTRAINT "departments_connection_id_fkey" FOREIGN KEY ("connection_id") REFERENCES "tagplus_connections"("id") ON DELETE CASCADE ON UPDATE CASCADE;
