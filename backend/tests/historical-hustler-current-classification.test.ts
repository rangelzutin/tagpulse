import { describe, expect, it } from "vitest";
import { OperationUnit, SaleAnchorType } from "@prisma/client";
import {
  classifyProductOwnership,
  classifyCurrentSale,
  type ClassificationProductInput,
  type ClassificationSaleInput,
  type ProductCatalogClassification,
} from "../src/modules/historical/hustler/hustler-current-classifier.js";

describe("Historical Hustler Current Classification (Phase 4K)", () => {
  const mockProducts: ClassificationProductInput[] = [
    {
      id: "prod-hustler-1",
      sourceId: "HUSTLER_LEGACY:101",
      description: "Tenis Legacy Hustler",
      categoryDescription: null,
      brand: null,
    },
    {
      id: "prod-hustler-2",
      sourceId: "TAGPLUS:201",
      description: "Shape Hustler Maple 8.0",
      categoryDescription: "Shapes",
      brand: null,
    },
    {
      id: "prod-nineclouds-1",
      sourceId: "TAGPLUS:301",
      description: "Shape Nineclouds Abstract 8.0",
      categoryDescription: "Shape Nineclouds Collection",
      brand: null,
    },
    {
      id: "prod-shared-1",
      sourceId: "TAGPLUS:401",
      description: "Amortecedor Revenge",
      categoryDescription: "Hardgoods",
      brand: null,
    },
  ];

  const mockHustlerHistoricalIds = new Set<string>(["prod-hustler-1", "prod-shared-1"]);

  const catalog: ProductCatalogClassification = classifyProductOwnership(
    mockProducts,
    mockHustlerHistoricalIds,
  );

  describe("1. Product Ownership Mapping", () => {
    it("1. classifies legacy-created and explicit Hustler products as Hustler exclusive", () => {
      expect(catalog.hustlerExclusiveIds.has("prod-hustler-1")).toBe(true);
      expect(catalog.hustlerExclusiveIds.has("prod-hustler-2")).toBe(true);
      expect(catalog.hustlerExclusiveIds.size).toBe(2);
    });

    it("2. classifies pure TagPlus manufactured products as Nineclouds exclusive", () => {
      expect(catalog.ninecloudsExclusiveIds.has("prod-nineclouds-1")).toBe(true);
      expect(catalog.ninecloudsExclusiveIds.size).toBe(1);
    });

    it("3. classifies products with historical identity that existed in TagPlus as Shared", () => {
      expect(catalog.sharedIds.has("prod-shared-1")).toBe(true);
      expect(catalog.sharedIds.size).toBe(1);
    });
  });

  describe("2. Current Sale Dry-Run Classification", () => {
    it("4. classifies sales to CONSUMIDOR HUSTLER as HUSTLER / EXACT", () => {
      const sale: ClassificationSaleInput = {
        id: "sale-1",
        anchorType: SaleAnchorType.VENDA_SIMPLES,
        anchorSourceId: "VS:7368",
        customerId: "cust-1",
        customerName: "CONSUMIDOR HUSTLER",
        hasCnpj: false,
        hasPedido: false,
        items: [
          { productId: "prod-nineclouds-1", description: "Camiseta Nineclouds" },
          { productId: "prod-shared-1", description: "Carteira YourFace" },
        ],
      };

      const result = classifyCurrentSale(sale, catalog);
      expect(result.candidateUnit).toBe(OperationUnit.HUSTLER);
      expect(result.confidence).toBe("EXACT");
      expect(result.reason).toContain("Consumidor Hustler");
    });

    it("5. classifies wholesale B2B sales (PEDIDO or CNPJ) as NINECLOUDS / STRONG", () => {
      const sale: ClassificationSaleInput = {
        id: "sale-2",
        anchorType: SaleAnchorType.PEDIDO,
        anchorSourceId: "PEDIDO:1001",
        customerId: "cust-cnpj",
        customerName: "SKATE SHOP BRASIL LTDA",
        hasCnpj: true,
        hasPedido: true,
        items: [
          { productId: "prod-nineclouds-1", description: "Shape Nineclouds Abstract" },
        ],
      };

      const result = classifyCurrentSale(sale, catalog);
      expect(result.candidateUnit).toBe(OperationUnit.NINECLOUDS);
      expect(result.confidence).toBe("STRONG");
      expect(result.reason).toContain("Wholesale");
    });

    it("6. classifies retail sales with third-party skate shop brands as HUSTLER / STRONG", () => {
      const sale: ClassificationSaleInput = {
        id: "sale-3",
        anchorType: SaleAnchorType.VENDA_SIMPLES,
        anchorSourceId: "VS:7400",
        customerId: null,
        customerName: null,
        hasCnpj: false,
        hasPedido: false,
        items: [
          { productId: "prod-shared-1", description: "Tenis DC - Lynx Zero" },
          { productId: "prod-shared-1", description: "Bermuda YourFace" },
        ],
      };

      const result = classifyCurrentSale(sale, catalog);
      expect(result.candidateUnit).toBe(OperationUnit.HUSTLER);
      expect(result.confidence).toBe("STRONG");
      expect(result.reason).toContain("third-party skate shop brands");
    });

    it("7. classifies retail sales of pure Nineclouds brand products as NINECLOUDS / STRONG", () => {
      const sale: ClassificationSaleInput = {
        id: "sale-4",
        anchorType: SaleAnchorType.VENDA_SIMPLES,
        anchorSourceId: "VS:7450",
        customerId: null,
        customerName: null,
        hasCnpj: false,
        hasPedido: false,
        items: [
          { productId: "prod-nineclouds-1", description: "Shape Nineclouds Abstract" },
        ],
      };

      const result = classifyCurrentSale(sale, catalog);
      expect(result.candidateUnit).toBe(OperationUnit.NINECLOUDS);
      expect(result.confidence).toBe("STRONG");
      expect(result.reason).toContain("Retail sale of pure Nineclouds");
    });

    it("8. classifies mixed retail baskets containing both Nineclouds and third-party as SHARED / STRONG", () => {
      const sale: ClassificationSaleInput = {
        id: "sale-5",
        anchorType: SaleAnchorType.VENDA_SIMPLES,
        anchorSourceId: "VS:7500",
        customerId: null,
        customerName: null,
        hasCnpj: false,
        hasPedido: false,
        items: [
          { productId: "prod-nineclouds-1", description: "Shape Nineclouds Abstract" },
          { productId: "prod-shared-1", description: "Tenis OUS Imigrante" },
        ],
      };

      const result = classifyCurrentSale(sale, catalog);
      expect(result.candidateUnit).toBe(OperationUnit.SHARED);
      expect(result.confidence).toBe("STRONG");
      expect(result.reason).toContain("Mixed retail basket");
    });

    it("9. classifies retail Venda Simples with only shared accessories as HUSTLER / WEAK", () => {
      const sale: ClassificationSaleInput = {
        id: "sale-6",
        anchorType: SaleAnchorType.VENDA_SIMPLES,
        anchorSourceId: "VS:7550",
        customerId: null,
        customerName: null,
        hasCnpj: false,
        hasPedido: false,
        items: [
          { productId: "prod-shared-1", description: "Arruelas de Skate" },
        ],
      };

      const result = classifyCurrentSale(sale, catalog);
      expect(result.candidateUnit).toBe(OperationUnit.HUSTLER);
      expect(result.confidence).toBe("WEAK");
      expect(result.reason).toContain("Retail Venda Simples of general skate hardware");
    });

    it("10. classifies empty sales without operational customer as UNRESOLVED", () => {
      const sale: ClassificationSaleInput = {
        id: "sale-7",
        anchorType: SaleAnchorType.NFE,
        anchorSourceId: "NFE:999",
        customerId: null,
        customerName: null,
        hasCnpj: false,
        hasPedido: false,
        items: [],
      };

      const result = classifyCurrentSale(sale, catalog);
      expect(result.candidateUnit).toBe(OperationUnit.UNRESOLVED);
      expect(result.confidence).toBe("UNRESOLVED");
    });
  });
});
