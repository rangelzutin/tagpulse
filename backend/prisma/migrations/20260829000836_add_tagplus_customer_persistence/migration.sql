-- CreateEnum
CREATE TYPE "TagPlusConnectionStatus" AS ENUM ('ACTIVE', 'DISABLED');

-- CreateEnum
CREATE TYPE "CustomerSyncRunStatus" AS ENUM ('RUNNING', 'COMPLETED', 'FAILED');

-- CreateTable
CREATE TABLE "tagplus_connections" (
    "id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "status" "TagPlusConnectionStatus" NOT NULL,
    "api_version" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tagplus_connections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "customer_sync_runs" (
    "id" UUID NOT NULL,
    "connection_id" UUID NOT NULL,
    "status" "CustomerSyncRunStatus" NOT NULL DEFAULT 'RUNNING',
    "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMP(3),
    "pages_fetched" INTEGER NOT NULL DEFAULT 0,
    "records_fetched" INTEGER NOT NULL DEFAULT 0,
    "records_inserted" INTEGER NOT NULL DEFAULT 0,
    "records_updated" INTEGER NOT NULL DEFAULT 0,
    "records_unchanged" INTEGER NOT NULL DEFAULT 0,
    "records_no_longer_observed" INTEGER NOT NULL DEFAULT 0,
    "last_completed_page" INTEGER NOT NULL DEFAULT 0,
    "terminal_empty_page" INTEGER,
    "error_category" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "customer_sync_runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "customers" (
    "id" UUID NOT NULL,
    "connection_id" UUID NOT NULL,
    "source_id" TEXT NOT NULL,
    "source_entity_id" TEXT,
    "code" TEXT,
    "external_code" TEXT,
    "type" TEXT,
    "legal_name" TEXT,
    "trade_name" TEXT,
    "source_active" BOOLEAN,
    "cpf" TEXT,
    "cnpj" TEXT,
    "email" TEXT,
    "phone" TEXT,
    "accepts_email" BOOLEAN,
    "source_created_at" TIMESTAMP(3),
    "source_updated_at" TIMESTAMP(3),
    "birth_date" DATE,
    "state_registration" TEXT,
    "municipal_registration" TEXT,
    "cnae" TEXT,
    "suframa" TEXT,
    "ie_indicator" TEXT,
    "foreign_customer" BOOLEAN,
    "source_present" BOOLEAN NOT NULL,
    "last_seen_at" TIMESTAMP(3) NOT NULL,
    "last_synced_at" TIMESTAMP(3) NOT NULL,
    "last_seen_sync_run_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "customers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "customer_contacts" (
    "id" UUID NOT NULL,
    "customer_id" UUID NOT NULL,
    "source_id" TEXT NOT NULL,
    "description" TEXT,
    "details" TEXT,
    "primary" BOOLEAN,
    "foreign_contact" BOOLEAN,
    "registration_type_id" TEXT,
    "registration_type_description" TEXT,
    "contact_type_id" TEXT,
    "contact_type_description" TEXT,
    "position" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "customer_contacts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "customer_addresses" (
    "id" UUID NOT NULL,
    "customer_id" UUID NOT NULL,
    "source_id" TEXT NOT NULL,
    "source_entity_address_id" TEXT,
    "street" TEXT,
    "number" TEXT,
    "complement" TEXT,
    "district" TEXT,
    "postal_code" TEXT,
    "primary" BOOLEAN,
    "foreign_address" BOOLEAN,
    "additional_information" TEXT,
    "city_id" TEXT,
    "city_code" TEXT,
    "city_name" TEXT,
    "state_id" TEXT,
    "state_code" TEXT,
    "state_name" TEXT,
    "state_abbreviation" TEXT,
    "country_id" TEXT,
    "country_code" TEXT,
    "country_name" TEXT,
    "registration_type_id" TEXT,
    "registration_type_description" TEXT,
    "position" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "customer_addresses_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "tagplus_connections_company_id_idx" ON "tagplus_connections"("company_id");

-- CreateIndex
CREATE UNIQUE INDEX "tagplus_connections_company_id_name_key" ON "tagplus_connections"("company_id", "name");

-- CreateIndex
CREATE INDEX "customer_sync_runs_connection_id_idx" ON "customer_sync_runs"("connection_id");

-- CreateIndex
CREATE INDEX "customers_connection_id_source_entity_id_idx" ON "customers"("connection_id", "source_entity_id");

-- CreateIndex
CREATE INDEX "customers_connection_id_code_idx" ON "customers"("connection_id", "code");

-- CreateIndex
CREATE INDEX "customers_connection_id_source_present_idx" ON "customers"("connection_id", "source_present");

-- CreateIndex
CREATE UNIQUE INDEX "customers_connection_id_source_id_key" ON "customers"("connection_id", "source_id");

-- CreateIndex
CREATE INDEX "customer_contacts_customer_id_idx" ON "customer_contacts"("customer_id");

-- CreateIndex
CREATE UNIQUE INDEX "customer_contacts_customer_id_source_id_key" ON "customer_contacts"("customer_id", "source_id");

-- CreateIndex
CREATE INDEX "customer_addresses_customer_id_idx" ON "customer_addresses"("customer_id");

-- CreateIndex
CREATE UNIQUE INDEX "customer_addresses_customer_id_source_id_key" ON "customer_addresses"("customer_id", "source_id");

-- AddForeignKey
ALTER TABLE "tagplus_connections" ADD CONSTRAINT "tagplus_connections_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_sync_runs" ADD CONSTRAINT "customer_sync_runs_connection_id_fkey" FOREIGN KEY ("connection_id") REFERENCES "tagplus_connections"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customers" ADD CONSTRAINT "customers_connection_id_fkey" FOREIGN KEY ("connection_id") REFERENCES "tagplus_connections"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customers" ADD CONSTRAINT "customers_last_seen_sync_run_id_fkey" FOREIGN KEY ("last_seen_sync_run_id") REFERENCES "customer_sync_runs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_contacts" ADD CONSTRAINT "customer_contacts_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_addresses" ADD CONSTRAINT "customer_addresses_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE CASCADE;
