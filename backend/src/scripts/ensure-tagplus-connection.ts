import "dotenv/config";
import { PrismaClient } from "@prisma/client";

export const TARGET_COMPANY_ID = "193670c9-a4a9-455a-99d8-87bf94fb79f9";
export const CONNECTION_NAME = "TagPlus Principal";

export async function ensureTagPlusConnection(
  prisma: PrismaClient,
  companyId = TARGET_COMPANY_ID,
) {
  const company = await prisma.company.findUnique({
    where: { id: companyId },
    select: { id: true },
  });
  if (!company) throw new Error("TAGPLUS_CONNECTION_COMPANY_NOT_FOUND");
  return prisma.tagPlusConnection.upsert({
    where: { companyId_name: { companyId: company.id, name: CONNECTION_NAME } },
    create: {
      companyId: company.id,
      name: CONNECTION_NAME,
      status: "ACTIVE",
      apiVersion: "2.0",
    },
    update: {},
    select: { id: true, companyId: true, status: true, apiVersion: true },
  });
}

async function main(): Promise<void> {
  const prisma = new PrismaClient();
  try {
    const connection = await ensureTagPlusConnection(prisma);
    process.stdout.write(`${JSON.stringify(connection)}\n`);
  } finally {
    await prisma.$disconnect();
  }
}

if (process.argv[1]?.endsWith("ensure-tagplus-connection.ts")) {
  void main().catch(() => {
    process.stderr.write("TAGPLUS_CONNECTION_BOOTSTRAP_FAILED\n");
    process.exitCode = 1;
  });
}
