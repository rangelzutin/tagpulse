import { prisma } from "../src/database/prisma.js";

async function seed(): Promise<void> {
  await prisma.company.upsert({
    where: { slug: "nineclouds" },
    update: { name: "Nineclouds" },
    create: { name: "Nineclouds", slug: "nineclouds" },
  });
}

seed()
  .catch((error: unknown) => {
    console.error("Database seed failed", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
