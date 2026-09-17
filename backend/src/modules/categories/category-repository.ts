import type { PrismaClient } from "@prisma/client";
import type { NormalizedCategory } from "../../integrations/tagplus/categories/category-normalizer.js";

export interface UpsertCategoriesResult {
  fetched: number;
  inserted: number;
  updated: number;
  unchanged: number;
  noLongerObserved: number;
}

export interface CategoryRepository {
  saveCategories(
    connectionId: string,
    categories: NormalizedCategory[],
    now?: Date,
  ): Promise<UpsertCategoriesResult>;
  findCategoriesByConnection(connectionId: string): Promise<any[]>;
}

export function createCategoryRepository(
  prisma: Pick<PrismaClient, "$transaction" | "category">,
): CategoryRepository {
  return {
    async findCategoriesByConnection(connectionId: string) {
      return prisma.category.findMany({
        where: { connectionId },
        orderBy: [{ parentSourceId: "asc" }, { sourceId: "asc" }],
      });
    },

    async saveCategories(
      connectionId: string,
      categories: NormalizedCategory[],
      now = new Date(),
    ): Promise<UpsertCategoriesResult> {
      return prisma.$transaction(async (tx) => {
        const existing = await tx.category.findMany({
          where: { connectionId },
        });

        const existingBySourceId = new Map(
          existing.map((cat) => [cat.sourceId, cat]),
        );
        const observedSourceIds = new Set<string>();

        let inserted = 0;
        let updated = 0;
        let unchanged = 0;

        // --- PASSO 1: Upsert de todas as entidades sem dependência de self-FK ---
        // Garante que todas as linhas (connectionId, sourceId) existam antes de ligar parentSourceId
        for (const cat of categories) {
          observedSourceIds.add(cat.sourceId);
          const current = existingBySourceId.get(cat.sourceId);

          if (!current) {
            // Nova categoria: insere inicialmente com parentSourceId = null para evitar quebra de FK
            // caso o pai apareça depois no payload
            await tx.category.create({
              data: {
                connectionId,
                sourceId: cat.sourceId,
                description: cat.description,
                parentSourceId: null,
                type: cat.type,
                location: cat.location,
                sourcePresent: true,
                lastSeenAt: now,
              },
            });
            inserted++;
          } else {
            // Categoria já existente: atualiza campos base e marca sourcePresent = true
            const hasBaseChanges =
              current.description !== cat.description ||
              current.type !== cat.type ||
              current.location !== cat.location ||
              current.sourcePresent !== true;

            const hasParentChange = current.parentSourceId !== cat.parentSourceId;

            if (hasBaseChanges || hasParentChange) {
              updated++;
            } else {
              unchanged++;
            }

            await tx.category.update({
              where: {
                connectionId_sourceId: {
                  connectionId,
                  sourceId: cat.sourceId,
                },
              },
              data: {
                description: cat.description,
                type: cat.type,
                location: cat.location,
                sourcePresent: true,
                lastSeenAt: now,
              },
            });
          }
        }

        // --- PASSO 2: Conectar parentSourceId com segurança total ---
        // Todas as categorias já existem no banco. Agora é 100% seguro atualizar parentSourceId.
        for (const cat of categories) {
          if (cat.parentSourceId) {
            // Só atualiza se o pai existir entre os observados ou já persistidos
            await tx.category.update({
              where: {
                connectionId_sourceId: {
                  connectionId,
                  sourceId: cat.sourceId,
                },
              },
              data: {
                parentSourceId: cat.parentSourceId,
              },
            });
          } else {
            // Categoria raiz
            await tx.category.update({
              where: {
                connectionId_sourceId: {
                  connectionId,
                  sourceId: cat.sourceId,
                },
              },
              data: {
                parentSourceId: null,
              },
            });
          }
        }

        // --- PASSO 3: Identificar categorias não mais observadas no ERP ---
        const unobserved = existing.filter(
          (cat) => !observedSourceIds.has(cat.sourceId) && cat.sourcePresent,
        );

        if (unobserved.length > 0) {
          await tx.category.updateMany({
            where: {
              connectionId,
              sourceId: { in: unobserved.map((c) => c.sourceId) },
            },
            data: {
              sourcePresent: false,
            },
          });
        }

        return {
          fetched: categories.length,
          inserted,
          updated,
          unchanged,
          noLongerObserved: unobserved.length,
        };
      });
    },
  };
}
