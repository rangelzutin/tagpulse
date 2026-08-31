-- Child identity includes the deterministic array position so repeated
-- TagPlus source identifiers remain distinct without synthetic identifiers.
DROP INDEX "customer_contacts_customer_id_source_id_key";
CREATE UNIQUE INDEX "customer_contacts_customer_id_source_id_position_key"
ON "customer_contacts"("customer_id", "source_id", "position");

DROP INDEX "customer_addresses_customer_id_source_id_key";
CREATE UNIQUE INDEX "customer_addresses_customer_id_source_id_position_key"
ON "customer_addresses"("customer_id", "source_id", "position");
