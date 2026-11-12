import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const isPersist = process.argv.includes("--persist");
  console.log(`=== RELINK GRADE SALE ITEMS (${isPersist ? "PERSIST MODE" : "DRY RUN MODE"}) ===`);

  // 1. Audit SaleItems
  const totalSaleItems = await prisma.saleItem.count();
  const orphanSaleItemsBefore = await prisma.saleItem.count({
    where: { productId: null },
  });

  const relinkableSaleItems = await prisma.$queryRaw<Array<{ count: bigint }>>`
    SELECT count(*)::bigint AS count
    FROM sale_items si
    JOIN products p ON si.source_product_id = p.source_id
    WHERE si.product_id IS NULL
  `;
  const relinkableSaleItemsCount = Number(relinkableSaleItems[0]?.count || 0);

  console.log("\n--- SaleItems ---");
  console.log(`Total SaleItems: ${totalSaleItems}`);
  console.log(`Itens órfãos antes: ${orphanSaleItemsBefore}`);
  console.log(`Itens relinkáveis por sourceProductId exato: ${relinkableSaleItemsCount}`);

  // 2. Audit SaleSourceDocumentItems
  const totalSsdItems = await prisma.saleSourceDocumentItem.count();
  const orphanSsdItemsBefore = await prisma.saleSourceDocumentItem.count({
    where: { productId: null },
  });

  const relinkableSsdItems = await prisma.$queryRaw<Array<{ count: bigint }>>`
    SELECT count(*)::bigint AS count
    FROM sale_source_document_items ssdi
    JOIN products p ON ssdi.source_product_id = p.source_id
    WHERE ssdi.product_id IS NULL
  `;
  const relinkableSsdItemsCount = Number(relinkableSsdItems[0]?.count || 0);

  console.log("\n--- SaleSourceDocumentItems ---");
  console.log(`Total SaleSourceDocumentItems: ${totalSsdItems}`);
  console.log(`Itens SSD órfãos antes: ${orphanSsdItemsBefore}`);
  console.log(`Itens SSD relinkáveis por sourceProductId exato: ${relinkableSsdItemsCount}`);

  if (!isPersist) {
    console.log("\n[DRY RUN] Nenhuma alteração persistida no banco de dados. Use --persist para executar.");
    return;
  }

  // 3. Execute deterministic relink in DEV
  console.log("\nExecutando relink determinístico...");

  const updateSaleItemsResult = await prisma.$executeRaw`
    UPDATE sale_items si
    SET product_id = p.id
    FROM products p
    WHERE si.product_id IS NULL
      AND si.source_product_id = p.source_id
  `;
  console.log(`SaleItems relinkados: ${updateSaleItemsResult}`);

  const updateSsdItemsResult = await prisma.$executeRaw`
    UPDATE sale_source_document_items ssdi
    SET product_id = p.id
    FROM products p
    WHERE ssdi.product_id IS NULL
      AND ssdi.source_product_id = p.source_id
  `;
  console.log(`SaleSourceDocumentItems relinkados: ${updateSsdItemsResult}`);

  // 4. Audit pós-relink
  const orphanSaleItemsAfter = await prisma.saleItem.count({
    where: { productId: null },
  });
  const orphanSsdItemsAfter = await prisma.saleSourceDocumentItem.count({
    where: { productId: null },
  });

  console.log("\n--- Status Pós-Relink ---");
  console.log(`SaleItems órfãos restantes: ${orphanSaleItemsAfter}`);
  console.log(`SaleSourceDocumentItems órfãos restantes: ${orphanSsdItemsAfter}`);

  // Specifically check product 2077 items
  const prod2077 = await prisma.product.findFirst({ where: { sourceId: "2077" } });
  if (prod2077) {
    const items2077Linked = await prisma.saleItem.count({
      where: { sourceProductId: "2077", productId: prod2077.id },
    });
    console.log(`Itens com sourceProductId=2077 vinculados a ${prod2077.id}: ${items2077Linked}`);
  }
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
