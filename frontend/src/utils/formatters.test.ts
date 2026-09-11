import { describe, it, expect } from "vitest";
import {
  getLocalDateString,
  getDefaultPeriod,
  formatCurrency,
  formatNumber,
  formatMonthLabel,
  formatFullMonthName,
  formatPercent,
  formatCompactCurrency,
  parseIsoDate,
  formatDisplayDate,
  parseDisplayDate,
  maskDateInput,
  validateManualPeriodInput,
  formatCustomerName,
} from "./formatters";

describe("formatters utils", () => {
  it("parseIsoDate parses YYYY-MM-DD into a local Date without timezone offset", () => {
    const d = parseIsoDate("2026-09-08");
    expect(d.getFullYear()).toBe(2026);
    expect(d.getMonth()).toBe(8); // September is 8
    expect(d.getDate()).toBe(8);
  });

  it("formatDisplayDate formats YYYY-MM-DD into DD/MM/YYYY", () => {
    expect(formatDisplayDate("2026-01-01")).toBe("01/01/2026");
    expect(formatDisplayDate("2026-09-08")).toBe("08/09/2026");
    expect(formatDisplayDate("")).toBe("");
  });

  it("getLocalDateString formats dates using local year, month, and day without ISO slicing", () => {
    const testDate = new Date(2026, 8, 9); // September 9, 2026 local
    expect(getLocalDateString(testDate)).toBe("2026-09-09");
  });

  it("getDefaultPeriod returns from as Jan 1st of current year and to as current local date", () => {
    const period = getDefaultPeriod();
    const currentYear = new Date().getFullYear().toString();
    expect(period.from).toBe(`${currentYear}-01-01`);
    expect(period.to).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("formatCurrency formats Brazilian Real properly", () => {
    const formatted = formatCurrency(1260.5);
    // Should contain R$ and 1.260,50
    expect(formatted).toContain("R$");
    expect(formatted).toContain("1.260,50");
  });

  it("formatNumber formats Brazilian numbers with thousand separators", () => {
    expect(formatNumber(12500)).toBe("12.500");
  });

  it("formatMonthLabel formats YYYY-MM to short month/year", () => {
    expect(formatMonthLabel("2026-01")).toBe("Jan/26");
    expect(formatMonthLabel("2026-08")).toBe("Ago/26");
    expect(formatMonthLabel("invalid")).toBe("invalid");
  });

  it("formatFullMonthName formats YYYY-MM to full month name", () => {
    expect(formatFullMonthName("2026-01")).toBe("Janeiro de 2026");
    expect(formatFullMonthName("2026-09")).toBe("Setembro de 2026");
  });

  it("formatPercent formats decimal percentages in pt-BR format", () => {
    expect(formatPercent(24.52)).toBe("24,5%");
    expect(formatPercent(0)).toBe("0,0%");
    expect(formatPercent(100)).toBe("100,0%");
    expect(formatPercent(12.345, 2)).toBe("12,35%");
  });

  it("formatCompactCurrency formats large numbers compactly", () => {
    expect(formatCompactCurrency(0)).toBe("R$ 0");
    expect(formatCompactCurrency(1500)).toBe("R$ 2k");
    expect(formatCompactCurrency(250000)).toBe("R$ 250k");
    expect(formatCompactCurrency(1200000)).toBe("R$ 1,2M");
  });

  describe("parseDisplayDate & maskDateInput", () => {
    it("29/02/2024 => válido (ano bissexto)", () => {
      const res = parseDisplayDate("29/02/2024");
      expect(res.isValid).toBe(true);
      expect(res.isoDate).toBe("2024-02-29");
      expect(res.date).toBeDefined();
    });

    it("29/02/2025 => inválido (não bissexto)", () => {
      const res = parseDisplayDate("29/02/2025");
      expect(res.isValid).toBe(false);
      expect(res.error).toContain("Dia 29 não existe no mês 02/2025");
    });

    it("31/02/2026 => inválido", () => {
      const res = parseDisplayDate("31/02/2026");
      expect(res.isValid).toBe(false);
      expect(res.error).toContain("Dia 31 não existe no mês 02/2026");
    });

    it("00/01/2026 => inválido", () => {
      const res = parseDisplayDate("00/01/2026");
      expect(res.isValid).toBe(false);
      expect(res.error).toBe("Dia inválido.");
    });

    it("01/13/2026 => inválido", () => {
      const res = parseDisplayDate("01/13/2026");
      expect(res.isValid).toBe(false);
      expect(res.error).toContain("Mês inválido");
    });

    it("maskDateInput formats incremental user input", () => {
      expect(maskDateInput("2")).toBe("2");
      expect(maskDateInput("29")).toBe("29");
      expect(maskDateInput("290")).toBe("29/0");
      expect(maskDateInput("2902")).toBe("29/02");
      expect(maskDateInput("29022026")).toBe("29/02/2026");
      expect(maskDateInput("29/02/2026extra")).toBe("29/02/2026");
      expect(maskDateInput("29-02-2026")).toBe("29/02/2026");
    });
  });

  describe("validateManualPeriodInput (Enter and blur validation)", () => {
    it("entrada incompleta => não aplicar (canApply = false, sem erro prematuro)", () => {
      const incomplete1 = validateManualPeriodInput("01/01/202", "31/12/2026", "range");
      expect(incomplete1.canApply).toBe(false);
      expect(incomplete1.error).toBeNull();

      const incomplete2 = validateManualPeriodInput("01/01/2026", "31/12", "range");
      expect(incomplete2.canApply).toBe(false);
      expect(incomplete2.error).toBeNull();

      const incompleteAllUpTo = validateManualPeriodInput("", "31/12", "allUpTo", "2015-05-05");
      expect(incompleteAllUpTo.canApply).toBe(false);
      expect(incompleteAllUpTo.error).toBeNull();
    });

    it("from > to => não aplicar com erro explícito", () => {
      const res = validateManualPeriodInput("15/09/2026", "10/09/2026", "range");
      expect(res.canApply).toBe(false);
      expect(res.error).toBe("A data inicial deve ser anterior ou igual à data final.");
    });

    it("data inválida em from ou to => reporta erro correspondente", () => {
      const invalidFrom = validateManualPeriodInput("31/02/2026", "10/09/2026", "range");
      expect(invalidFrom.canApply).toBe(false);
      expect(invalidFrom.error).toContain("Data inicial: Dia 31 não existe");

      const invalidTo = validateManualPeriodInput("01/01/2026", "29/02/2025", "range");
      expect(invalidTo.canApply).toBe(false);
      expect(invalidTo.error).toContain("Data final: Dia 29 não existe");
    });

    it("Enter/blur com intervalo válido => aplica corretamente (range)", () => {
      const res = validateManualPeriodInput("01/08/2026", "31/08/2026", "range");
      expect(res.canApply).toBe(true);
      expect(res.error).toBeNull();
      expect(res.fromIso).toBe("2026-08-01");
      expect(res.toIso).toBe("2026-08-31");
    });

    it("Enter/blur com data válida no modo allUpTo => aplica com minDate e toIso", () => {
      const res = validateManualPeriodInput("", "31/08/2026", "allUpTo", "2015-05-05");
      expect(res.canApply).toBe(true);
      expect(res.error).toBeNull();
      expect(res.fromIso).toBe("2015-05-05");
      expect(res.toIso).toBe("2026-08-31");
    });

    it("allUpTo com to anterior a minDate => rejeita", () => {
      const res = validateManualPeriodInput("", "01/01/2010", "allUpTo", "2015-05-05");
      expect(res.canApply).toBe(false);
      expect(res.error).toContain("A data final deve ser posterior ou igual ao início da base.");
    });
  });

  describe("formatCustomerName", () => {
    it("converts uppercase names to Title Case as requested in user examples", () => {
      expect(formatCustomerName("SKATE CRIME")).toBe("Skate Crime");
      expect(formatCustomerName("CINI SKATE SHOP")).toBe("Cini Skate Shop");
      expect(formatCustomerName("RATINHO SKATESHOP")).toBe("Ratinho Skateshop");
      expect(formatCustomerName("Maré Skate Shop")).toBe("Maré Skate Shop");
      expect(formatCustomerName("SPIN SKATE SHOP")).toBe("Spin Skate Shop");
      expect(formatCustomerName("DGS SKATESHOP")).toBe("DGS Skateshop");
    });

    it("preserves accents and handles lowercase or uppercase accented names", () => {
      expect(formatCustomerName("MARÉ SKATE SHOP")).toBe("Maré Skate Shop");
      expect(formatCustomerName("JOÃO DA SILVA")).toBe("João da Silva");
      expect(formatCustomerName("ÂNGELO COMÉRCIO")).toBe("Ângelo Comércio");
      expect(formatCustomerName("ÓTICA DO SKATE")).toBe("Ótica do Skate");
      expect(formatCustomerName("AÇAÍ CLUB")).toBe("Açaí Club");
      expect(formatCustomerName("ícaro skateshop")).toBe("Ícaro Skateshop");
    });

    it("preserves numbers, symbols and special characters", () => {
      expect(formatCustomerName("100% SKATE")).toBe("100% Skate");
      expect(formatCustomerName("LOJA 01")).toBe("Loja 01");
      expect(formatCustomerName("LOJA Nº 5")).toBe("Loja Nº 5");
      expect(formatCustomerName("A & B SKATE")).toBe("A & B Skate");
      expect(formatCustomerName("SKATE & CIA")).toBe("Skate & CIA");
      expect(formatCustomerName("SKATE (FILIAL)")).toBe("Skate (Filial)");
      expect(formatCustomerName("(MATRIZ) SKATE")).toBe("(Matriz) Skate");
    });

    it("preserves relevant corporate suffixes, acronyms and Roman numerals", () => {
      expect(formatCustomerName("DGS")).toBe("DGS");
      expect(formatCustomerName("dgs skateshop")).toBe("DGS Skateshop");
      expect(formatCustomerName("SKATE SHOP LTDA.")).toBe("Skate Shop LTDA.");
      expect(formatCustomerName("SKATE SHOP S/A")).toBe("Skate Shop S/A");
      expect(formatCustomerName("SKATE SHOP ME")).toBe("Skate Shop ME");
      expect(formatCustomerName("SKATE SHOP EPP")).toBe("Skate Shop EPP");
      expect(formatCustomerName("SKATE SHOP MEI")).toBe("Skate Shop MEI");
      expect(formatCustomerName("SKATE SHOP EIRELI")).toBe("Skate Shop EIRELI");
      expect(formatCustomerName("KTM RACING")).toBe("KTM Racing");
      expect(formatCustomerName("XP INVEST")).toBe("XP Invest");
      expect(formatCustomerName("SKATE LOJA SP")).toBe("Skate Loja SP");
      expect(formatCustomerName("LOJA II")).toBe("Loja II");
      expect(formatCustomerName("LOJA III")).toBe("Loja III");
      expect(formatCustomerName("LOJA IV")).toBe("Loja IV");
      expect(formatCustomerName("LOJA X")).toBe("Loja X");
    });

    it("correctly handles Portuguese prepositions and conjunctions", () => {
      expect(formatCustomerName("CASA DO SKATE")).toBe("Casa do Skate");
      expect(formatCustomerName("CASA DE SKATE")).toBe("Casa de Skate");
      expect(formatCustomerName("DE LUCCA SKATE")).toBe("De Lucca Skate");
      expect(formatCustomerName("PEDRO E FILHOS")).toBe("Pedro e Filhos");
      expect(formatCustomerName("LOJA E")).toBe("Loja E");
    });

    it("handles compound words with hyphens, slashes, and apostrophes", () => {
      expect(formatCustomerName("E-COMMERCE SKATE")).toBe("E-Commerce Skate");
      expect(formatCustomerName("JEAN-LUC SKATE")).toBe("Jean-Luc Skate");
      expect(formatCustomerName("D'ÁVILA SKATE")).toBe("D'Ávila Skate");
      expect(formatCustomerName("SKATE/SURF SHOP")).toBe("Skate/Surf Shop");
    });

    it("handles edge cases: empty strings, whitespace, null/undefined", () => {
      expect(formatCustomerName("")).toBe("");
      expect(formatCustomerName("   ")).toBe("");
      expect(formatCustomerName(null)).toBe("");
      expect(formatCustomerName(undefined)).toBe("");
      expect(formatCustomerName("  SKATE   CRIME  ")).toBe("Skate Crime");
    });
  });
});
