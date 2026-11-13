import { describe, expect, it } from "vitest";
import { classifyFinancialRecordForDre } from "../src/modules/financial/financial-dre-classifier.js";

describe("Financial DRE Classifier", () => {
  it("classifies Plano 19 as INVENTORY_PURCHASE and non-deductible in DRE", () => {
    const res = classifyFinancialRecordForDre({
      id: "rec-1",
      sourceId: "101",
      budgetPlanSourceId: "19",
      description: "Compra Fornecedor X",
      dueDate: new Date("2026-03-15T00:00:00Z"),
      originalAmount: 5000,
      totalAmount: 5000,
    });

    expect(res.category).toBe("INVENTORY_PURCHASE");
    expect(res.isDeductibleInDre).toBe(false);
    expect(res.baseAmount).toBe(5000);
  });

  it("classifies Plano 1 payment fees by discountAmount and dueDate competence", () => {
    const res = classifyFinancialRecordForDre({
      id: "rec-2",
      sourceId: "102",
      budgetPlanSourceId: "1",
      description: "Recebível Cartão",
      dueDate: new Date("2026-01-15T00:00:00Z"),
      confirmationDate: new Date("2026-02-10T00:00:00Z"),
      sourceCompetenceDate: new Date("2025-12-28T00:00:00Z"),
      originalAmount: 100,
      discountAmount: 3.5,
      linkedSaleRealizedDate: new Date("2025-12-28T00:00:00Z"),
    });

    expect(res.category).toBe("VARIABLE_PAYMENT_FEE");
    expect(res.isDeductibleInDre).toBe(true);
    expect(res.baseAmount).toBe(3.5);
    expect(res.referenceMonth).toBe("2026-01");
    expect(res.competenceDate).toEqual(new Date("2026-01-15T00:00:00Z"));
  });

  it("classifies Plano 27 DAS as VARIABLE_TAX_ON_REVENUE with previous month competence from dueDate", () => {
    const res = classifyFinancialRecordForDre({
      id: "rec-3",
      sourceId: "10540",
      budgetPlanSourceId: "27",
      description: "Simples Nacional",
      dueDate: new Date("2026-02-20T00:00:00Z"),
      originalAmount: 2257.69,
      totalAmount: 2257.69,
    });

    expect(res.category).toBe("VARIABLE_TAX_ON_REVENUE");
    expect(res.isDeductibleInDre).toBe(true);
    expect(res.baseAmount).toBe(2257.69);
    expect(res.referenceMonth).toBe("2026-01");
  });

  it("classifies Plano 27 GPS as OPERATING_PERSONNEL with previous month competence from dueDate", () => {
    const res = classifyFinancialRecordForDre({
      id: "rec-4",
      sourceId: "10541",
      budgetPlanSourceId: "27",
      description: "GPS",
      dueDate: new Date("2026-02-20T00:00:00Z"),
      originalAmount: 534.93,
      totalAmount: 534.93,
    });

    expect(res.category).toBe("OPERATING_PERSONNEL");
    expect(res.isDeductibleInDre).toBe(true);
    expect(res.baseAmount).toBe(534.93);
    expect(res.referenceMonth).toBe("2026-01");
  });

  it("classifies Plano 27 ICMS base as VARIABLE_TAX_ON_REVENUE and penalty as FINANCIAL_EXPENSE both in dueDate month", () => {
    const res = classifyFinancialRecordForDre({
      id: "rec-5",
      sourceId: "10906",
      budgetPlanSourceId: "27",
      description: "ICMS",
      dueDate: new Date("2026-05-29T00:00:00Z"),
      confirmationDate: new Date("2026-06-10T00:00:00Z"),
      sourceCompetenceDate: new Date("2026-07-01T00:00:00Z"),
      originalAmount: 861.42,
      totalAmount: 878.64,
    });

    expect(res.category).toBe("VARIABLE_TAX_ON_REVENUE");
    expect(res.isDeductibleInDre).toBe(true);
    expect(res.baseAmount).toBe(861.42);
    expect(res.referenceMonth).toBe("2026-05");
    expect(res.financialAdjustment).toBeDefined();
    expect(res.financialAdjustment?.type).toBe("FINANCIAL_EXPENSE");
    expect(res.financialAdjustment?.amount).toBe(17.22);
    expect(res.financialAdjustment?.date).toEqual(new Date("2026-05-29T00:00:00Z"));
  });

  it("classifies Plano 8 freight prefixes as VARIABLE_FREIGHT_LOGISTICS", () => {
    const res = classifyFinancialRecordForDre({
      id: "rec-6",
      sourceId: "106",
      budgetPlanSourceId: "8",
      description: "RTE Rodonaves CTE 12345",
      dueDate: new Date("2026-04-10T00:00:00Z"),
      originalAmount: 450,
      totalAmount: 450,
    });

    expect(res.category).toBe("VARIABLE_FREIGHT_LOGISTICS");
    expect(res.isDeductibleInDre).toBe(true);
    expect(res.baseAmount).toBe(450);
  });

  it("classifies Plano 8 Bradesco as FINANCIAL_EXPENSE", () => {
    const res = classifyFinancialRecordForDre({
      id: "rec-7",
      sourceId: "107",
      budgetPlanSourceId: "8",
      description: "Tarifa Bancária Bradesco",
      dueDate: new Date("2026-04-10T00:00:00Z"),
      originalAmount: 75.5,
      totalAmount: 75.5,
    });

    expect(res.category).toBe("FINANCIAL_EXPENSE");
    expect(res.isDeductibleInDre).toBe(true);
    expect(res.baseAmount).toBe(75.5);
  });

  it("classifies Plano 8 categories: Occupancy, Utilities, Software, Accounting", () => {
    const aluguel = classifyFinancialRecordForDre({
      id: "rec-8",
      sourceId: "108",
      budgetPlanSourceId: "8",
      description: "Aluguel Galpão",
      dueDate: new Date("2026-04-10T00:00:00Z"),
      originalAmount: 1200,
    });
    expect(aluguel.category).toBe("OPERATING_OCCUPANCY");

    const elektro = classifyFinancialRecordForDre({
      id: "rec-9",
      sourceId: "109",
      budgetPlanSourceId: "8",
      description: "Elektro Eletricidade",
      dueDate: new Date("2026-04-10T00:00:00Z"),
      originalAmount: 250,
    });
    expect(elektro.category).toBe("OPERATING_UTILITIES");

    const tagplus = classifyFinancialRecordForDre({
      id: "rec-10",
      sourceId: "110",
      budgetPlanSourceId: "8",
      description: "Mensalidade TagPlus",
      dueDate: new Date("2026-04-10T00:00:00Z"),
      originalAmount: 318,
    });
    expect(tagplus.category).toBe("OPERATING_SOFTWARE");

    const ortiz = classifyFinancialRecordForDre({
      id: "rec-11",
      sourceId: "111",
      budgetPlanSourceId: "8",
      description: "Escritório Ortiz Contabilidade",
      dueDate: new Date("2026-04-10T00:00:00Z"),
      originalAmount: 786,
    });
    expect(ortiz.category).toBe("OPERATING_ACCOUNTING");
  });

  it("classifies Plano 8 insurance (11003) as administrative with financial income discount", () => {
    const seguro = classifyFinancialRecordForDre({
      id: "rec-12",
      sourceId: "11003",
      budgetPlanSourceId: "8",
      description: "Seguro Empresarial",
      dueDate: new Date("2026-06-15T00:00:00Z"),
      originalAmount: 99.9,
      discountAmount: 4.5,
      totalAmount: 95.4,
    });
    expect(seguro.category).toBe("OPERATING_ADMINISTRATIVE");
    expect(seguro.baseAmount).toBe(99.9);
    expect(seguro.financialAdjustment?.type).toBe("FINANCIAL_INCOME");
    expect(seguro.financialAdjustment?.amount).toBe(4.5);
  });

  it("classifies Plano 39 as OPERATING_PARTNER_COMPENSATION", () => {
    const res = classifyFinancialRecordForDre({
      id: "rec-13",
      sourceId: "113",
      budgetPlanSourceId: "39",
      description: "Retirada Pró-labore",
      dueDate: new Date("2026-05-05T00:00:00Z"),
      originalAmount: 6600,
    });
    expect(res.category).toBe("OPERATING_PARTNER_COMPENSATION");
    expect(res.isDeductibleInDre).toBe(true);
  });

  it("classifies Plano 23 and 33 as OPERATING_MARKETING and Plano 32 as OPERATING_ATHLETES", () => {
    const p23 = classifyFinancialRecordForDre({
      id: "rec-14",
      sourceId: "114",
      budgetPlanSourceId: "23",
      description: "Google Ads",
      dueDate: new Date("2026-05-10T00:00:00Z"),
      originalAmount: 2000,
    });
    expect(p23.category).toBe("OPERATING_MARKETING");

    const p32 = classifyFinancialRecordForDre({
      id: "rec-15",
      sourceId: "115",
      budgetPlanSourceId: "32",
      description: "Gian - Campeonato olds gold",
      dueDate: new Date("2026-05-10T00:00:00Z"),
      originalAmount: 350,
    });
    expect(p32.category).toBe("OPERATING_ATHLETES");

    const p33 = classifyFinancialRecordForDre({
      id: "rec-15b",
      sourceId: "115b",
      budgetPlanSourceId: "33",
      description: "Collab",
      dueDate: new Date("2026-05-10T00:00:00Z"),
      originalAmount: 500,
    });
    expect(p33.category).toBe("OPERATING_MARKETING");
  });

  it("classifies Plano 2 Café as OPERATING_ADMINISTRATIVE", () => {
    const cafe = classifyFinancialRecordForDre({
      id: "rec-16",
      sourceId: "10599",
      budgetPlanSourceId: "2",
      description: "Café para escritório",
      dueDate: new Date("2026-03-01T00:00:00Z"),
      originalAmount: 65,
    });
    expect(cafe.category).toBe("OPERATING_ADMINISTRATIVE");
    expect(cafe.isDeductibleInDre).toBe(true);
  });

  it("classifies Plano 2 interest received as FINANCIAL_INCOME", () => {
    const juros = classifyFinancialRecordForDre({
      id: "rec-17",
      sourceId: "11362",
      budgetPlanSourceId: "2",
      description: "Juros recebidos de cliente",
      dueDate: new Date("2026-09-01T00:00:00Z"),
      originalAmount: 21.67,
    });
    expect(juros.category).toBe("FINANCIAL_INCOME");
    expect(juros.isDeductibleInDre).toBe(true);
  });

  it("does not classify unknown plans as other silently and marks them UNCLASSIFIED_REVIEW_REQUIRED", () => {
    const unknown = classifyFinancialRecordForDre({
      id: "rec-18",
      sourceId: "999",
      budgetPlanSourceId: "999",
      description: "Despesa Misteriosa",
      dueDate: new Date("2026-04-01T00:00:00Z"),
      originalAmount: 500,
    });
    expect(unknown.category).toBe("UNCLASSIFIED_REVIEW_REQUIRED");
    expect(unknown.isDeductibleInDre).toBe(false);
    expect(unknown.requiresReview).toBe(true);
  });

  describe("Official Managerial Mapping Rules (Section 20)", () => {
    it("maps Aluguel Tiradentes (Plano 40 and Plano 8) -> Aluguel e Espaço Físico (OPERATING_OCCUPANCY)", () => {
      const p40 = classifyFinancialRecordForDre({
        id: "m-1",
        sourceId: "HUSTLER_LEGACY:2227",
        budgetPlanSourceId: "40",
        budgetPlanName: "Aluguel / Reforma",
        description: "Aluguel - Tiradentes",
        dueDate: new Date("2026-03-10T00:00:00Z"),
        originalAmount: 2189.02,
      });
      expect(p40.category).toBe("OPERATING_OCCUPANCY");
      expect(p40.isDeductibleInDre).toBe(true);
      expect(p40.budgetPlanSourceId).toBe("40");
      expect(p40.originalDescription).toBe("Aluguel - Tiradentes");
    });

    it("maps GPS -> Encargos sobre Pró-labore / Pessoal (OPERATING_PERSONNEL)", () => {
      const gps = classifyFinancialRecordForDre({
        id: "m-2",
        sourceId: "10541",
        budgetPlanSourceId: "27",
        description: "GPS",
        dueDate: new Date("2026-03-20T00:00:00Z"),
        originalAmount: 534.93,
      });
      expect(gps.category).toBe("OPERATING_PERSONNEL");
      expect(gps.isDeductibleInDre).toBe(true);
    });

    it("maps NeoLink -> Serviços Operacionais (OPERATING_UTILITIES)", () => {
      const neolinkP2 = classifyFinancialRecordForDre({
        id: "m-3a",
        sourceId: "HUSTLER_LEGACY:2301",
        budgetPlanSourceId: "2",
        description: "NeoLink",
        dueDate: new Date("2026-04-10T00:00:00Z"),
        originalAmount: 64.9,
      });
      expect(neolinkP2.category).toBe("OPERATING_UTILITIES");
      expect(neolinkP2.isDeductibleInDre).toBe(true);

      const neolinkP8 = classifyFinancialRecordForDre({
        id: "m-3b",
        sourceId: "10610",
        budgetPlanSourceId: "8",
        description: "Neo Link",
        dueDate: new Date("2026-04-10T00:00:00Z"),
        originalAmount: 97.0,
      });
      expect(neolinkP8.category).toBe("OPERATING_UTILITIES");
      expect(neolinkP8.isDeductibleInDre).toBe(true);
    });

    it("maps Luminoso Hustler -> Infraestrutura / Manutenção (OPERATING_INFRASTRUCTURE)", () => {
      const luminoso = classifyFinancialRecordForDre({
        id: "m-4",
        sourceId: "HUSTLER_LEGACY:2302",
        budgetPlanSourceId: "2",
        description: "Luminoso Hustler",
        dueDate: new Date("2026-02-15T00:00:00Z"),
        originalAmount: 600,
      });
      expect(luminoso.category).toBe("OPERATING_INFRASTRUCTURE");
      expect(luminoso.isDeductibleInDre).toBe(true);
    });

    it("maps Tag Plus Hustler -> Software e Assinaturas (OPERATING_SOFTWARE)", () => {
      const tagplus = classifyFinancialRecordForDre({
        id: "m-5",
        sourceId: "HUSTLER_LEGACY:2303",
        budgetPlanSourceId: "2",
        description: "Tag Plus Hustler",
        dueDate: new Date("2026-02-15T00:00:00Z"),
        originalAmount: 139,
      });
      expect(tagplus.category).toBe("OPERATING_SOFTWARE");
      expect(tagplus.isDeductibleInDre).toBe(true);
    });

    it("maps Sacolas -> Embalagens / Expedição (VARIABLE_PACKAGING)", () => {
      const sacolas = classifyFinancialRecordForDre({
        id: "m-6",
        sourceId: "HUSTLER_LEGACY:2304",
        budgetPlanSourceId: "2",
        description: "Sacolas",
        dueDate: new Date("2026-02-15T00:00:00Z"),
        originalAmount: 469,
      });
      expect(sacolas.category).toBe("VARIABLE_PACKAGING");
      expect(sacolas.isDeductibleInDre).toBe(true);
    });

    it("maps Sangria/Suprimento -> fora do DRE (TRANSFER)", () => {
      const sangria = classifyFinancialRecordForDre({
        id: "m-7",
        sourceId: "HUSTLER_LEGACY:2305",
        budgetPlanSourceId: "2",
        description: "Sangria / Suprimento de Caixa",
        dueDate: new Date("2026-02-15T00:00:00Z"),
        originalAmount: 325,
      });
      expect(sangria.category).toBe("TRANSFER");
      expect(sangria.isDeductibleInDre).toBe(false);
    });

    it("maps Representantes (Plano 34) -> Comissões (VARIABLE_SALES_COMMISSION)", () => {
      const rep = classifyFinancialRecordForDre({
        id: "m-8",
        sourceId: "3401",
        budgetPlanSourceId: "34",
        description: "Comissão Representantes",
        dueDate: new Date("2026-03-10T00:00:00Z"),
        originalAmount: 850,
      });
      expect(rep.category).toBe("VARIABLE_SALES_COMMISSION");
      expect(rep.isDeductibleInDre).toBe(true);
    });

    it("maps Atleta (Plano 32) -> Atletas / Patrocínios (OPERATING_ATHLETES)", () => {
      const atleta = classifyFinancialRecordForDre({
        id: "m-9",
        sourceId: "3201",
        budgetPlanSourceId: "32",
        description: "Atleta Patrocinado",
        dueDate: new Date("2026-03-10T00:00:00Z"),
        originalAmount: 350,
      });
      expect(atleta.category).toBe("OPERATING_ATHLETES");
      expect(atleta.isDeductibleInDre).toBe(true);
    });

    it("maps Collab (Plano 33) -> Marketing e Publicidade (OPERATING_MARKETING)", () => {
      const collab = classifyFinancialRecordForDre({
        id: "m-10",
        sourceId: "3301",
        budgetPlanSourceId: "33",
        description: "Collab",
        dueDate: new Date("2026-03-10T00:00:00Z"),
        originalAmount: 1200,
      });
      expect(collab.category).toBe("OPERATING_MARKETING");
      expect(collab.isDeductibleInDre).toBe(true);
    });

    it("maps Protestado / Perdidos (Planos 38 e 41) -> Perdas / Inadimplência (OPERATING_LOSSES)", () => {
      const protestado = classifyFinancialRecordForDre({
        id: "m-11a",
        sourceId: "3801",
        budgetPlanSourceId: "38",
        description: "Título Protestado",
        dueDate: new Date("2026-03-10T00:00:00Z"),
        originalAmount: 400,
      });
      expect(protestado.category).toBe("OPERATING_LOSSES");
      expect(protestado.isDeductibleInDre).toBe(true);

      const perdidos = classifyFinancialRecordForDre({
        id: "m-11b",
        sourceId: "4101",
        budgetPlanSourceId: "41",
        description: "Créditos Perdidos",
        dueDate: new Date("2026-03-10T00:00:00Z"),
        originalAmount: 250,
      });
      expect(perdidos.category).toBe("OPERATING_LOSSES");
      expect(perdidos.isDeductibleInDre).toBe(true);
    });
  });

  describe("Strict dueDate Precedence Contract for All Expense Categories", () => {
    const dueDateAug = new Date("2026-08-15T00:00:00Z");
    const confirmationSep = new Date("2026-09-10T00:00:00Z");
    const sourceCompetenceOct = new Date("2026-10-05T00:00:00Z");
    const linkedSaleJul = new Date("2026-07-20T00:00:00Z");

    it("enforces referenceMonth = 2026-08 (dueDate) when confirmationDate is Sep, sourceCompetenceDate is Oct, and linkedSaleRealizedDate is Jul", () => {
      const cases = [
        // Taxa de pagamento (Plano 1)
        classifyFinancialRecordForDre({
          id: "c-pay",
          sourceId: "2001",
          budgetPlanSourceId: "1",
          description: "Recebível Cartão Parcelado",
          dueDate: dueDateAug,
          confirmationDate: confirmationSep,
          sourceCompetenceDate: sourceCompetenceOct,
          linkedSaleRealizedDate: linkedSaleJul,
          originalAmount: 500,
          discountAmount: 25,
        }),
        // Frete (Plano 21)
        classifyFinancialRecordForDre({
          id: "c-fr-21",
          sourceId: "2002",
          budgetPlanSourceId: "21",
          description: "Frete Transportadora",
          dueDate: dueDateAug,
          confirmationDate: confirmationSep,
          sourceCompetenceDate: sourceCompetenceOct,
          originalAmount: 180,
        }),
        // Frete (Plano 8 prefixo)
        classifyFinancialRecordForDre({
          id: "c-fr-8",
          sourceId: "2003",
          budgetPlanSourceId: "8",
          description: "Melhor Envio Etiquetas",
          dueDate: dueDateAug,
          confirmationDate: confirmationSep,
          sourceCompetenceDate: sourceCompetenceOct,
          originalAmount: 120,
        }),
        // Despesa financeira (Plano 8 tarifa bancária)
        classifyFinancialRecordForDre({
          id: "c-fin-exp",
          sourceId: "2004",
          budgetPlanSourceId: "8",
          description: "Conta Corrente Bradesco",
          dueDate: dueDateAug,
          confirmationDate: confirmationSep,
          sourceCompetenceDate: sourceCompetenceOct,
          originalAmount: 183.6,
        }),
        // Despesas operacionais (Ocupação, Utilidades, Software, Contabilidade, Administrativo, Marketing, Infraestrutura, Outras)
        classifyFinancialRecordForDre({
          id: "c-occ",
          sourceId: "2005",
          budgetPlanSourceId: "8",
          description: "Aluguel Mensal",
          dueDate: dueDateAug,
          confirmationDate: confirmationSep,
          sourceCompetenceDate: sourceCompetenceOct,
          originalAmount: 1571.85,
        }),
        classifyFinancialRecordForDre({
          id: "c-util",
          sourceId: "2006",
          budgetPlanSourceId: "8",
          description: "Elektro Energia",
          dueDate: dueDateAug,
          confirmationDate: confirmationSep,
          sourceCompetenceDate: sourceCompetenceOct,
          originalAmount: 240,
        }),
        classifyFinancialRecordForDre({
          id: "c-soft",
          sourceId: "2007",
          budgetPlanSourceId: "8",
          description: "TagPlus ERP",
          dueDate: dueDateAug,
          confirmationDate: confirmationSep,
          sourceCompetenceDate: sourceCompetenceOct,
          originalAmount: 159,
        }),
        classifyFinancialRecordForDre({
          id: "c-acc",
          sourceId: "2008",
          budgetPlanSourceId: "8",
          description: "Contabilidade Ortiz",
          dueDate: dueDateAug,
          confirmationDate: confirmationSep,
          sourceCompetenceDate: sourceCompetenceOct,
          originalAmount: 770.3,
        }),
        classifyFinancialRecordForDre({
          id: "c-adm",
          sourceId: "2009",
          budgetPlanSourceId: "8",
          description: "Material de Escritório",
          dueDate: dueDateAug,
          confirmationDate: confirmationSep,
          sourceCompetenceDate: sourceCompetenceOct,
          originalAmount: 95,
        }),
        classifyFinancialRecordForDre({
          id: "c-mkt",
          sourceId: "2010",
          budgetPlanSourceId: "32",
          description: "Campanha Patrocínio",
          dueDate: dueDateAug,
          confirmationDate: confirmationSep,
          sourceCompetenceDate: sourceCompetenceOct,
          originalAmount: 350,
        }),
        classifyFinancialRecordForDre({
          id: "c-inf",
          sourceId: "2011",
          budgetPlanSourceId: "40",
          description: "Manutenção Predial",
          dueDate: dueDateAug,
          confirmationDate: confirmationSep,
          sourceCompetenceDate: sourceCompetenceOct,
          originalAmount: 129.5,
        }),
        classifyFinancialRecordForDre({
          id: "c-op-other",
          sourceId: "11447",
          budgetPlanSourceId: "2",
          description: "Café e insumos",
          dueDate: dueDateAug,
          confirmationDate: confirmationSep,
          sourceCompetenceDate: sourceCompetenceOct,
          originalAmount: 65,
        }),
        // Pró-labore (Plano 39)
        classifyFinancialRecordForDre({
          id: "c-pro-labore",
          sourceId: "2012",
          budgetPlanSourceId: "39",
          description: "Retirada Sócio",
          dueDate: dueDateAug,
          confirmationDate: confirmationSep,
          sourceCompetenceDate: sourceCompetenceOct,
          originalAmount: 2000,
        }),
      ];

      for (const classified of cases) {
        expect(classified.isDeductibleInDre).toBe(true);
        expect(classified.referenceMonth).toBe("2026-08");
        expect(classified.competenceDate).toEqual(dueDateAug);
      }
    });
  });
});
