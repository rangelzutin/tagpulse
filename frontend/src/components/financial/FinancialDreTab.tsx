import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import {
  DollarSign,
  TrendingDown,
  TrendingUp,
  Percent,
  Clock,
  CheckCircle2,
  AlertCircle,
  HelpCircle,
  RefreshCw,
  Scale,
  Calendar,
  Download,
  ChevronDown,
  FileText,
  Image as ImageIcon,
  X,
  Search,
  Plus,
  History,
  FileEdit,
  Package,
} from "lucide-react";
import {
  fetchFinancialDreSummary,
  fetchFinancialDreMonthly,
  fetchFinancialDreBreakdown,
  fetchMissingCosts,
  createProductCost,
  fetchProductCostHistory,
  type MissingCostItemDto,
  type ProductCostHistoryItem,
  type DreSummaryDto,
  type DreMonthlyItemDto,
  type DreBreakdownDto,
  DRE_DISCLAIMER,
} from "../../api/financial";
import {
  formatCurrency,
  formatPercent,
  formatDateBr,
} from "../../utils/formatters";
import { FinancialDreTable } from "./FinancialDreTable";
import { FinancialDreMonthlyChart } from "./FinancialDreMonthlyChart";
import { FinancialDreBreakdownCard } from "./FinancialDreBreakdownCard";
import { FinancialDreBreakEvenSection } from "./FinancialDreBreakEvenSection";
import { FinancialDreExportReport } from "./FinancialDreExportReport";
import {
  buildDreExportFilename,
  exportDreReportToPdf,
  exportDreReportToJpg,
  type DreExportFormat,
} from "./dreExportService";
import { getRequiredYearsForPeriod } from "./dreEvolutionHelper";

interface FinancialDreTabProps {
  currentPeriod: {
    from: string;
    to: string;
  };
  companyName?: string;
  initialSummary?: DreSummaryDto | null;
  initialMonthly?: DreMonthlyItemDto[];
  initialBreakdown?: DreBreakdownDto | null;
  isLoadingGlobal?: boolean;
  defaultExportMenuOpen?: boolean;
  initialExportingFormat?: DreExportFormat | null;
  initialExportError?: string | null;
  onExportPdf?: (element: HTMLElement, filename: string) => Promise<unknown>;
  onExportJpg?: (element: HTMLElement, filename: string) => Promise<unknown>;
}

export function formatPendingAccrualLabel(code: string): string {
  switch (code) {
    case "VARIABLE_TAX_ON_REVENUE":
      return "DAS / tributos sobre vendas";
    case "OPERATING_PERSONNEL":
      return "GPS / encargos";
    case "TAX_ICMS_UNRESOLVED":
      return "ICMS pendente de conciliação";
    default:
      return code;
  }
}

function resolveActiveCompanyName(explicitName?: string): string {
  if (explicitName && explicitName.trim()) {
    return explicitName.trim();
  }
  if (typeof document !== "undefined") {
    const brandNode = document.querySelector(".tp-brand-company");
    const domName = brandNode?.textContent?.trim();
    if (domName) {
      return domName;
    }
  }
  return "Nineclouds";
}

export function FinancialDreTab({
  currentPeriod,
  companyName,
  initialSummary,
  initialMonthly,
  initialBreakdown,
  defaultExportMenuOpen = false,
  initialExportingFormat = null,
  initialExportError = null,
  onExportPdf,
  onExportJpg,
}: FinancialDreTabProps) {
  // Data states
  const [summaryData, setSummaryData] = useState<DreSummaryDto | null>(
    initialSummary ?? null,
  );
  const [monthlyData, setMonthlyData] = useState<DreMonthlyItemDto[]>(
    initialMonthly ?? [],
  );
  const [breakdownData, setBreakdownData] = useState<DreBreakdownDto | null>(
    initialBreakdown ?? null,
  );

  // Loading and Error states
  const [isLoadingSummary, setIsLoadingSummary] = useState(!initialSummary);
  const [isLoadingMonthly, setIsLoadingMonthly] = useState(
    !initialMonthly || initialMonthly.length === 0,
  );
  const [isLoadingBreakdown, setIsLoadingBreakdown] = useState(
    !initialBreakdown,
  );

  const [summaryError, setSummaryError] = useState<string | null>(null);
  const [monthlyError, setMonthlyError] = useState<string | null>(null);
  const [breakdownError, setBreakdownError] = useState<string | null>(null);

  // Export states
  const [isExportMenuOpen, setIsExportMenuOpen] = useState(
    defaultExportMenuOpen,
  );
  const [exportingFormat, setExportingFormat] =
    useState<DreExportFormat | null>(initialExportingFormat);
  const [exportLayoutMode, setExportLayoutMode] = useState<
    "paginated" | "continuous"
  >("paginated");
  const [exportError, setExportError] = useState<string | null>(
    initialExportError,
  );

  // Missing Costs Inspector State
  const [isMissingCostsOpen, setIsMissingCostsOpen] = useState(false);
  const [missingCosts, setMissingCosts] = useState<MissingCostItemDto[]>([]);
  const [missingCostsTotal, setMissingCostsTotal] = useState(0);
  const [isLoadingMissingCosts, setIsLoadingMissingCosts] = useState(false);
  const [missingCostsError, setMissingCostsError] = useState<string | null>(null);
  const [missingSearchTerm, setMissingSearchTerm] = useState("");
  // View Mode for Missing Costs: individual sale items or grouped by product
  const [missingCostsViewMode, setMissingCostsViewMode] = useState<"items" | "products">("items");

  // Product Cost History State
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [productHistory, setProductHistory] = useState<ProductCostHistoryItem[]>([]);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [historyProductName, setHistoryProductName] = useState("");

  // Add Product Cost Modal State
  const [isAddCostOpen, setIsAddCostOpen] = useState(false);
  const [selectedProductForCost, setSelectedProductForCost] = useState<{
    productId?: string | null;
    sourceProductId: string;
    productName: string;
    productCode: string | null;
    saleDate?: string;
    currentCost?: number | null;
  } | null>(null);
  const [costFormUnitCost, setCostFormUnitCost] = useState("");
  const [costFormValidFrom, setCostFormValidFrom] = useState(currentPeriod.from);
  const [costFormValidTo, setCostFormValidTo] = useState("");
  const [costFormNote, setCostFormNote] = useState("Custo unitário cadastrado via TagPulse");
  const [isSubmittingCost, setIsSubmittingCost] = useState(false);
  const [costSubmitError, setCostSubmitError] = useState<string | null>(null);
  const [costSubmitSuccess, setCostSubmitSuccess] = useState<string | null>(null);

  const exportDropdownRef = useRef<HTMLDivElement | null>(null);
  const exportReportHostRef = useRef<HTMLDivElement | null>(null);

  const requiredYears = useMemo(
    () => getRequiredYearsForPeriod(currentPeriod),
    [currentPeriod.from, currentPeriod.to],
  );
  const requiredYearsKey = requiredYears.join(",");

  const isMountedRef = useRef(true);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  // Close export dropdown on outside click
  useEffect(() => {
    if (!isExportMenuOpen) return;
    const handleOutsideClick = (event: MouseEvent) => {
      if (
        exportDropdownRef.current &&
        !exportDropdownRef.current.contains(event.target as Node)
      ) {
        setIsExportMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handleOutsideClick);
    return () => {
      document.removeEventListener("mousedown", handleOutsideClick);
    };
  }, [isExportMenuOpen]);

  // Load Summary
  const loadSummary = useCallback(async (from: string, to: string) => {
    setIsLoadingSummary(true);
    setSummaryError(null);
    try {
      const data = await fetchFinancialDreSummary({ from, to });
      if (isMountedRef.current) {
        setSummaryData(data);
      }
    } catch (err: unknown) {
      if (isMountedRef.current) {
        const msg =
          err instanceof Error
            ? err.message
            : "Erro ao carregar resumo do DRE.";
        setSummaryError(msg);
      }
    } finally {
      if (isMountedRef.current) {
        setIsLoadingSummary(false);
      }
    }
  }, []);

  // Load Monthly (supports single or multi-year parallel fetch)
  const loadMonthly = useCallback(async (yearsCsv: string) => {
    const years = yearsCsv
      .split(",")
      .map((y) => y.trim())
      .filter(Boolean);
    setIsLoadingMonthly(true);
    setMonthlyError(null);
    try {
      const responses = await Promise.all(
        years.map((year) => fetchFinancialDreMonthly({ year })),
      );
      if (isMountedRef.current) {
        const mergedMap = new Map<string, DreMonthlyItemDto>();
        for (const list of responses) {
          for (const item of list) {
            mergedMap.set(item.month, item);
          }
        }
        const combined = Array.from(mergedMap.values()).sort((a, b) =>
          a.month.localeCompare(b.month),
        );
        setMonthlyData(combined);
      }
    } catch (err: unknown) {
      if (isMountedRef.current) {
        const msg =
          err instanceof Error
            ? err.message
            : "Erro ao carregar série mensal do DRE.";
        setMonthlyError(msg);
      }
    } finally {
      if (isMountedRef.current) {
        setIsLoadingMonthly(false);
      }
    }
  }, []);

  // Load Breakdown
  const loadBreakdown = useCallback(async (from: string, to: string) => {
    setIsLoadingBreakdown(true);
    setBreakdownError(null);
    try {
      const data = await fetchFinancialDreBreakdown({ from, to });
      if (isMountedRef.current) {
        setBreakdownData(data);
      }
    } catch (err: unknown) {
      if (isMountedRef.current) {
        const msg =
          err instanceof Error
            ? err.message
            : "Erro ao carregar composição de despesas.";
        setBreakdownError(msg);
      }
    } finally {
      if (isMountedRef.current) {
        setIsLoadingBreakdown(false);
      }
    }
  }, []);

  // Load Missing Costs
  const loadMissingCosts = useCallback(async () => {
    setIsLoadingMissingCosts(true);
    setMissingCostsError(null);
    try {
      const res = await fetchMissingCosts({
        from: currentPeriod.from,
        to: currentPeriod.to,
        page: 1,
        pageSize: 100,
      });
      if (isMountedRef.current) {
        setMissingCosts(res.items);
        setMissingCostsTotal(res.total);
      }
    } catch (err: unknown) {
      if (isMountedRef.current) {
        const msg = err instanceof Error ? err.message : "Erro ao carregar produtos sem custo.";
        setMissingCostsError(msg);
      }
    } finally {
      if (isMountedRef.current) {
        setIsLoadingMissingCosts(false);
      }
    }
  }, [currentPeriod.from, currentPeriod.to]);

  useEffect(() => {
    if (isMissingCostsOpen) {
      void loadMissingCosts();
    }
  }, [isMissingCostsOpen, loadMissingCosts]);

  const handleOpenAddCost = (item: {
    productId?: string | null;
    sourceProductId: string;
    productName?: string;
    description?: string;
    productCode?: string | null;
    code?: string | null;
    firstSaleAt?: string;
    saleDate?: string;
    currentCost?: number | null;
    currentCatalogCost?: number | null;
  }) => {
    const name = item.productName || item.description || `Produto ${item.sourceProductId}`;
    const code = item.productCode ?? item.code ?? null;
    const initialCost = item.currentCost ?? item.currentCatalogCost ?? null;
    const initialDate = item.saleDate || (item.firstSaleAt ? item.firstSaleAt.slice(0, 10) : currentPeriod.from);

    setSelectedProductForCost({
      productId: item.productId,
      sourceProductId: item.sourceProductId,
      productName: name,
      productCode: code,
      saleDate: initialDate,
      currentCost: initialCost,
    });
    setCostFormUnitCost(initialCost ? String(initialCost) : "");
    setCostFormValidFrom(initialDate);
    setCostFormValidTo("");
    setCostFormNote("Custo unitário cadastrado via TagPulse");
    setCostSubmitError(null);
    setCostSubmitSuccess(null);
    setIsAddCostOpen(true);
  };

  const handleOpenHistory = async (sourceProductId: string, productName?: string) => {
    setHistoryProductName(productName || `Produto ${sourceProductId}`);
    setIsHistoryOpen(true);
    setIsLoadingHistory(true);
    setHistoryError(null);
    try {
      const history = await fetchProductCostHistory(sourceProductId);
      setProductHistory(history);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Erro ao carregar histórico de custos.";
      setHistoryError(msg);
    } finally {
      setIsLoadingHistory(false);
    }
  };

  const handleSaveCost = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedProductForCost) return;
    const cost = parseFloat(costFormUnitCost.replace(",", "."));
    if (isNaN(cost) || cost <= 0) {
      setCostSubmitError("Informe um custo unitário válido maior que zero.");
      return;
    }
    setIsSubmittingCost(true);
    setCostSubmitError(null);
    try {
      await createProductCost({
        productId: selectedProductForCost.productId ?? undefined,
        sourceProductId: selectedProductForCost.sourceProductId,
        unitCost: cost,
        validFrom: new Date(`${costFormValidFrom}T00:00:00.000Z`).toISOString(),
        validTo: costFormValidTo ? new Date(`${costFormValidTo}T23:59:59.999Z`).toISOString() : null,
        note: costFormNote,
        costSource: "MANUAL",
      });
      setCostSubmitSuccess("CMV cadastrado com sucesso! Atualizando DRE...");
      setTimeout(() => {
        setIsAddCostOpen(false);
        setCostSubmitSuccess(null);
        void loadMissingCosts();
        void loadSummary(currentPeriod.from, currentPeriod.to);
        void loadMonthly(requiredYearsKey);
      }, 1000);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Erro ao cadastrar custo.";
      setCostSubmitError(msg);
    } finally {
      setIsSubmittingCost(false);
    }
  };

  // Effect to reload all when period changes
  useEffect(() => {
    void loadSummary(currentPeriod.from, currentPeriod.to);
    void loadBreakdown(currentPeriod.from, currentPeriod.to);
    void loadMonthly(requiredYearsKey);
  }, [
    currentPeriod.from,
    currentPeriod.to,
    requiredYearsKey,
    loadSummary,
    loadBreakdown,
    loadMonthly,
  ]);

  // Derived aggregations for missing costs modal
  const totalUncoveredRevenue = useMemo(() => {
    return missingCosts.reduce((acc, item) => acc + (item.soldValue ?? item.uncoveredRevenue ?? 0), 0);
  }, [missingCosts]);

  const groupedMissingProducts = useMemo(() => {
    const map = new Map<
      string,
      {
        sourceProductId: string;
        productId?: string | null;
        productName: string;
        productCode: string | null;
        totalQuantity: number;
        totalSoldValue: number;
        itemsCount: number;
        earliestSaleDate: string;
        latestSaleDate: string;
        currentCost: number | null;
      }
    >();

    for (const item of missingCosts) {
      const existing = map.get(item.sourceProductId);
      const soldVal = item.soldValue ?? item.uncoveredRevenue ?? 0;
      const qty = item.quantity ?? item.totalQuantity ?? 0;
      const sDate = item.saleDate || item.firstSaleAt?.slice(0, 10) || "";
      const pName = item.productName || item.description || `Produto ${item.sourceProductId}`;
      const pCode = item.productCode ?? item.code ?? null;
      const cCost = item.currentCost ?? item.currentCatalogCost ?? null;

      if (!existing) {
        map.set(item.sourceProductId, {
          sourceProductId: item.sourceProductId,
          productId: item.productId,
          productName: pName,
          productCode: pCode,
          totalQuantity: qty,
          totalSoldValue: soldVal,
          itemsCount: 1,
          earliestSaleDate: sDate,
          latestSaleDate: sDate,
          currentCost: cCost,
        });
      } else {
        existing.totalQuantity += qty;
        existing.totalSoldValue += soldVal;
        existing.itemsCount += 1;
        if (sDate && (!existing.earliestSaleDate || sDate < existing.earliestSaleDate)) {
          existing.earliestSaleDate = sDate;
        }
        if (sDate && (!existing.latestSaleDate || sDate > existing.latestSaleDate)) {
          existing.latestSaleDate = sDate;
        }
      }
    }

    return Array.from(map.values()).sort((a, b) => b.totalSoldValue - a.totalSoldValue);
  }, [missingCosts]);

  const handleExport = useCallback(
    async (format: DreExportFormat) => {
      if (!summaryData || exportingFormat !== null) return;

      const targetLayout = format === "pdf" ? "paginated" : "continuous";
      setExportLayoutMode(targetLayout);
      setExportError(null);
      setIsExportMenuOpen(false);
      setExportingFormat(format);

      try {
        // Wait for React to commit the target export layout to DOM
        await new Promise<void>((resolve) => {
          window.setTimeout(() => resolve(), 30);
        });

        const hostNode = exportReportHostRef.current;
        const reportElement =
          (hostNode?.querySelector(
            '[data-testid="dre-export-report"]',
          ) as HTMLElement | null) ?? hostNode;

        if (!reportElement) {
          throw new Error(
            "Não foi possível preparar o layout de exportação do DRE.",
          );
        }

        const activeCompany = resolveActiveCompanyName(companyName);
        const filename = buildDreExportFilename(
          activeCompany,
          currentPeriod,
          format,
        );

        if (format === "pdf") {
          if (onExportPdf) {
            await onExportPdf(reportElement, filename);
          } else {
            await exportDreReportToPdf(reportElement, filename);
          }
        } else {
          if (onExportJpg) {
            await onExportJpg(reportElement, filename);
          } else {
            await exportDreReportToJpg(reportElement, filename);
          }
        }
      } catch (err: unknown) {
        if (isMountedRef.current) {
          const message =
            err instanceof Error
              ? err.message
              : "Não foi possível concluir a exportação do relatório.";
          setExportError(message);
        }
      } finally {
        if (isMountedRef.current) {
          setExportingFormat(null);
        }
      }
    },
    [
      summaryData,
      exportingFormat,
      companyName,
      currentPeriod,
      onExportPdf,
      onExportJpg,
    ],
  );

  // Main error state if summary failed completely
  if (summaryError && !summaryData) {
    return (
      <div className="tp-state-card tp-state-error" role="alert">
        <div className="tp-state-icon">
          <AlertCircle size={22} />
        </div>
        <div className="tp-state-content">
          <h3 className="tp-state-title">Falha ao carregar DRE Gerencial</h3>
          <p className="tp-state-message">{summaryError}</p>
          <button
            type="button"
            className="tp-btn-retry"
            onClick={() => {
              void loadSummary(currentPeriod.from, currentPeriod.to);
              void loadBreakdown(currentPeriod.from, currentPeriod.to);
              void loadMonthly(requiredYearsKey);
            }}
          >
            <RefreshCw size={13} />
            <span>Tentar novamente</span>
          </button>
        </div>
      </div>
    );
  }

  // Skeleton loading state
  if (isLoadingSummary && !summaryData) {
    return (
      <div
        className="tp-section-skeleton tp-dre-skeleton"
        aria-label="Carregando DRE Gerencial"
      >
        {/* KPI Skeleton Grid */}
        <div className="tp-kpi-grid">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="tp-kpi-card tp-skeleton-card">
              <div className="tp-skeleton-line tp-skeleton-short" />
              <div className="tp-skeleton-line tp-skeleton-long" />
            </div>
          ))}
        </div>
        {/* Secondary Strip Skeleton */}
        <div className="tp-dre-secondary-strip tp-skeleton-card">
          <div className="tp-skeleton-line tp-skeleton-long" />
        </div>
        {/* Table & Chart Skeletons */}
        <div className="tp-card tp-skeleton-card tp-skeleton-table">
          <div className="tp-skeleton-line tp-skeleton-short" />
          <div className="tp-skeleton-line tp-skeleton-chart-body" />
        </div>
      </div>
    );
  }

  const totals = summaryData?.totals;
  const isProvisional = summaryData?.dataQuality.isProvisional ?? false;
  const isClosed = summaryData?.dataQuality.financiallyClosed ?? false;
  const pendingAccruals = summaryData?.dataQuality.pendingAccruals ?? [];

  // Check empty state
  const isEmpty =
    !totals ||
    (totals.realizedRevenue === 0 &&
      totals.operatingExpenses.total === 0 &&
      totals.variableExpenses.total === 0);

  if (isEmpty) {
    return (
      <div className="tp-state-card tp-state-empty">
        <div className="tp-state-content">
          <h3 className="tp-state-title">
            Nenhum movimento disponível para o período selecionado.
          </h3>
          <p className="tp-state-message">
            Tente selecionar outro intervalo de datas para visualizar o resultado econômico da operação.
          </p>
        </div>
      </div>
    );
  }

  const hasNetResult = totals.netManagerialResult !== null;
  const isPositiveNet = hasNetResult && (totals.netManagerialResult ?? 0) > 0;
  const isNegativeNet = hasNetResult && (totals.netManagerialResult ?? 0) < 0;
  const isCostQualityEstimated = totals.isEstimated || (totals.costCoveragePercent != null && totals.costCoveragePercent < 100);
  const resolvedCompanyName = resolveActiveCompanyName(companyName);
  const isExportBusy = exportingFormat !== null;

  return (
    <div className="tp-dre-module-content" aria-label="DRE Gerencial">
      {/* Context & Quality Header Banner */}
      <section
        className="tp-dre-context-banner"
        aria-label="Informações do período"
      >
        <div className="tp-dre-context-left">
          <div className="tp-dre-period-tag">
            <Calendar size={13} />
            <span>
              {formatDateBr(currentPeriod.from)} —{" "}
              {formatDateBr(currentPeriod.to)}
            </span>
          </div>

          {/* Temporal Quality Badge */}
          {isProvisional ? (
            <div
              className="tp-quality-badge is-provisional"
              title="Existem competências ainda não disponíveis no financeiro."
            >
              <Clock size={12} />
              <span>Provisório</span>
              {pendingAccruals.length > 0 && (
                <span className="tp-pending-hint">
                  — aguardando:{" "}
                  {pendingAccruals.map(formatPendingAccrualLabel).join(", ")}
                </span>
              )}
            </div>
          ) : isClosed ? (
            <div className="tp-quality-badge is-closed">
              <CheckCircle2 size={12} />
              <span>Fechado</span>
              {summaryData?.lastClosedMonth && (
                <span className="tp-closed-hint">
                  (Até {summaryData.lastClosedMonth})
                </span>
              )}
            </div>
          ) : null}

          {/* Economic Status Badge */}
          <div
            className={`tp-economic-status-badge ${totals.status === "PROFIT"
                ? "is-profit"
                : totals.status === "LOSS"
                  ? "is-loss"
                  : "is-even"
              }`}
          >
            <span className="tp-status-dot" />
            <span>
              {totals.status === "PROFIT"
                ? "Lucro"
                : totals.status === "LOSS"
                  ? "Prejuízo"
                  : "Equilíbrio"}
            </span>
          </div>
        </div>

        {/* Coverage, Disclaimer and Export Action */}
        <div className="tp-dre-context-right">
          <span
            className="tp-dre-coverage-pill"
            title="Cobertura de classificação gerencial dos lançamentos"
          >
            Cobertura: {summaryData.dataQuality.dreClassificationCoveragePercent}%
          </span>
          {summaryData.dataQuality.unknownAmount > 0 && (
            <span
              className="tp-dre-unknown-pill"
              title="Valores não classificados gerencialmente"
            >
              Não classificado:{" "}
              {formatCurrency(summaryData.dataQuality.unknownAmount)}
            </span>
          )}

          {/* Export Dropdown Control */}
          <div className="tp-dre-export-dropdown" ref={exportDropdownRef}>
            <button
              type="button"
              className="tp-dre-export-btn"
              data-testid="dre-export-button"
              disabled={isExportBusy}
              aria-haspopup="menu"
              aria-expanded={isExportMenuOpen}
              onClick={() => {
                if (!isExportBusy) {
                  setExportError(null);
                  setIsExportMenuOpen((prev) => !prev);
                }
              }}
            >
              {exportingFormat === "pdf" ? (
                <>
                  <RefreshCw size={13} className="tp-spin" />
                  <span>Gerando PDF...</span>
                </>
              ) : exportingFormat === "jpg" ? (
                <>
                  <RefreshCw size={13} className="tp-spin" />
                  <span>Gerando imagem...</span>
                </>
              ) : (
                <>
                  <Download size={13} />
                  <span>Exportar</span>
                  <ChevronDown size={12} />
                </>
              )}
            </button>

            {isExportMenuOpen && !isExportBusy && (
              <div
                className="tp-dre-export-menu"
                role="menu"
                aria-label="Opções de exportação do DRE"
                data-testid="dre-export-menu"
              >
                <button
                  type="button"
                  role="menuitem"
                  className="tp-dre-export-menu-item"
                  data-testid="dre-export-pdf-option"
                  onClick={() => void handleExport("pdf")}
                >
                  <FileText size={14} />
                  <span>Exportar PDF</span>
                </button>
                <button
                  type="button"
                  role="menuitem"
                  className="tp-dre-export-menu-item"
                  data-testid="dre-export-jpg-option"
                  onClick={() => void handleExport("jpg")}
                >
                  <ImageIcon size={14} />
                  <span>Exportar JPG</span>
                </button>
              </div>
            )}
          </div>
        </div>
      </section>

      {/* Export Error Callout */}
      {exportError && (
        <div
          className="tp-state-card tp-state-error tp-dre-export-error"
          role="alert"
          data-testid="dre-export-error"
        >
          <div className="tp-state-icon">
            <AlertCircle size={18} />
          </div>
          <div className="tp-state-content">
            <h4 className="tp-state-title">Não foi possível exportar o DRE</h4>
            <p className="tp-state-message">{exportError}</p>
          </div>
          <button
            type="button"
            className="tp-btn-retry"
            aria-label="Fechar aviso de erro"
            onClick={() => setExportError(null)}
          >
            <X size={13} />
            <span>Fechar</span>
          </button>
        </div>
      )}

      {/* Provisional notice explanation if provisional */}
      {isProvisional && (
        <div className="tp-provisional-callout" role="note">
          <div className="tp-provisional-callout-content">
            <strong>Resultado provisório:</strong> Existem competências ainda não disponíveis no
            financeiro (competências de impostos e encargos com vencimento diferido).
          </div>
        </div>
      )}

      {/* Primary KPI Grid (4 Cards) */}
      <section className="tp-kpi-section" aria-label="Indicadores Prioritários">
        <div className="tp-kpi-grid tp-dre-kpi-grid">
          {/* KPI 1 — Receita Realizada */}
          <article className="tp-kpi-card tp-profit-kpi-card tp-kpi-highlight">
            <div className="tp-profit-kpi-header">
              <span className="tp-profit-kpi-label">Receita Realizada</span>
              <span className="tp-kpi-icon-wrap tp-icon-cyan">
                <DollarSign size={16} />
              </span>
            </div>
            <div className="tp-profit-kpi-value-wrap">
              <span className="tp-kpi-value">
                {formatCurrency(totals.realizedRevenue)}
              </span>
            </div>
            <div className="tp-profit-kpi-footer">
              <span className="tp-profit-kpi-subtext">
                Faturamento líquido faturado no período
              </span>
            </div>
          </article>

          {/* KPI 2 — Margem de Contribuição */}
          <article className="tp-kpi-card tp-profit-kpi-card">
            <div className="tp-profit-kpi-header">
              <span className="tp-profit-kpi-label">Margem de Contribuição</span>
              <span className="tp-kpi-icon-wrap tp-icon-teal">
                <TrendingUp size={16} />
              </span>
            </div>
            <div className="tp-profit-kpi-value-wrap">
              <span className="tp-kpi-value">
                {formatCurrency(totals.contributionMargin)}
              </span>
            </div>
            <div className="tp-profit-kpi-footer">
              <span className="tp-kpi-meta-badge tp-meta-teal">
                {totals.contributionMarginPercent !== null
                  ? formatPercent(totals.contributionMarginPercent, 2)
                  : "—"}
              </span>
              <span className="tp-profit-kpi-subtext">
                Após CMV e desp. variáveis
              </span>
            </div>
          </article>

          {/* KPI 3 — Resultado Líquido Gerencial Estimado */}
          <article
            className={`tp-kpi-card tp-profit-kpi-card ${isPositiveNet
                ? "tp-card-profit"
                : isNegativeNet
                  ? "tp-card-loss"
                  : ""
              }`}
          >
            <div className="tp-profit-kpi-header">
              <span className="tp-profit-kpi-label">
                Resultado Líquido Gerencial Estimado
              </span>
              <span
                className={`tp-kpi-icon-wrap ${isPositiveNet
                    ? "tp-icon-teal"
                    : isNegativeNet
                      ? "tp-icon-magenta"
                      : "tp-icon-blue"
                  }`}
              >
                {isPositiveNet ? (
                  <TrendingUp size={16} />
                ) : isNegativeNet ? (
                  <TrendingDown size={16} />
                ) : (
                  <Scale size={16} />
                )}
              </span>
            </div>
            <div className="tp-profit-kpi-value-wrap">
              <span
                className={`tp-kpi-value ${isPositiveNet
                    ? "tp-value-positive"
                    : isNegativeNet
                      ? "tp-value-negative"
                      : ""
                  }`}
              >
                {hasNetResult
                  ? formatCurrency(totals.netManagerialResult as number)
                  : "Indisponível"}
              </span>
            </div>
            <div className="tp-profit-kpi-footer tp-dre-kpi-footer">
              <div className="tp-dre-kpi-badges-row">
                <span
                  className={`tp-kpi-status-badge ${!hasNetResult
                      ? "is-even"
                      : isPositiveNet
                        ? "is-profit"
                        : isNegativeNet
                          ? "is-loss"
                          : "is-even"
                    }`}
                  data-testid="dre-kpi-result-status-badge"
                >
                  {!hasNetResult
                    ? "Cobertura Insuficiente"
                    : totals.status === "PROFIT"
                      ? "Lucro"
                      : totals.status === "LOSS"
                        ? "Prejuízo"
                        : "Equilíbrio"}
                </span>
                {isCostQualityEstimated && hasNetResult && (
                  <span
                    className="tp-kpi-quality-badge"
                    data-testid="dre-kpi-cost-quality-badge"
                  >
                    {totals.costQualityStatus === "HIGH_CONFIDENCE_ESTIMATE"
                      ? `Alta confiança · ${totals.costCoveragePercent ? `${totals.costCoveragePercent.toFixed(1)}%` : "97,9%"}`
                      : "Estimativa provisória"}
                  </span>
                )}
              </div>
              <span className="tp-profit-kpi-subtext">
                {!hasNetResult
                  ? `Margem parcial: ${totals.partialManagerialResultOnCoveredRevenue !== undefined ? formatCurrency(totals.partialManagerialResultOnCoveredRevenue) : "—"} (cobertura CMV ${totals.costCoveragePercent != null ? totals.costCoveragePercent.toFixed(1) + "%" : "—"})`
                  : isCostQualityEstimated
                    ? "Estimativa gerencial com cobertura parcial de custos."
                    : "Resultado operacional líquido"}
              </span>
            </div>
          </article>

          {/* KPI 4 — Margem Líquida Gerencial Estimada */}
          <article className="tp-kpi-card tp-profit-kpi-card">
            <div className="tp-profit-kpi-header">
              <span className="tp-profit-kpi-label">
                Margem Líquida Gerencial Estimada
              </span>
              <span
                className={`tp-kpi-icon-wrap ${isPositiveNet
                    ? "tp-icon-teal"
                    : isNegativeNet
                      ? "tp-icon-magenta"
                      : "tp-icon-blue"
                  }`}
              >
                <Percent size={16} />
              </span>
            </div>
            <div className="tp-profit-kpi-value-wrap">
              <span
                className={`tp-kpi-value ${hasNetResult &&
                    totals.netManagerialMarginPercent !== null &&
                    totals.netManagerialMarginPercent < 0
                    ? "tp-value-negative"
                    : hasNetResult &&
                      totals.netManagerialMarginPercent !== null &&
                      totals.netManagerialMarginPercent > 0
                      ? "tp-value-positive"
                      : ""
                  }`}
              >
                {hasNetResult && totals.netManagerialMarginPercent !== null
                  ? formatPercent(totals.netManagerialMarginPercent, 2)
                  : "—"}
              </span>
            </div>
            <div className="tp-profit-kpi-footer">
              <span className="tp-profit-kpi-subtext">
                {hasNetResult
                  ? isCostQualityEstimated
                    ? "Margem líquida gerencial estimada"
                    : "Sobre a receita realizada"
                  : "Indisponível devido à cobertura insuficiente de custo"}
              </span>
            </div>
          </article>
        </div>
      </section>

      {/* Secondary Indicators Strip (5 Compact Metrics) */}
      <section
        className="tp-dre-secondary-strip"
        aria-label="Indicadores Secundários"
      >
        <div className="tp-secondary-metric-item">
          <span className="tp-secondary-label">
            CMV Estimado ao Custo Atual
          </span>
          <span className="tp-secondary-value">
            {formatCurrency(totals.estimatedCOGS)}
          </span>
        </div>
        <div className="tp-secondary-divider" />
        <div className="tp-secondary-metric-item">
          <span className="tp-secondary-label">Lucro Bruto Estimado</span>
          <span className="tp-secondary-value">
            {formatCurrency(totals.estimatedGrossProfit)}
          </span>
        </div>
        <div className="tp-secondary-divider" />
        <div className="tp-secondary-metric-item">
          <span className="tp-secondary-label">Margem Bruta Estimada</span>
          <span className="tp-secondary-value">
            {totals.estimatedGrossMarginPercent !== null
              ? formatPercent(totals.estimatedGrossMarginPercent, 2)
              : "—"}
          </span>
        </div>
        <div className="tp-secondary-divider" />
        <div className="tp-secondary-metric-item">
          <span className="tp-secondary-label">Despesas Operacionais</span>
          <span className="tp-secondary-value">
            {formatCurrency(totals.operatingExpenses.total)}
          </span>
        </div>
        <div className="tp-secondary-divider" />
        <div className="tp-secondary-metric-item">
          <span className="tp-secondary-label">Resultado Financeiro</span>
          <span
            className={`tp-secondary-value ${totals.financialResult.total < 0
                ? "tp-text-negative"
                : totals.financialResult.total > 0
                  ? "tp-text-positive"
                  : ""
              }`}
          >
            {formatCurrency(totals.financialResult.total)}
          </span>
        </div>
      </section>

      {/* Break-Even Analysis Section */}
      <FinancialDreBreakEvenSection
        totals={totals}
        breakEvenOverride={summaryData.breakEven}
        dataQuality={summaryData.dataQuality}
        onOpenMissingCosts={() => setIsMissingCostsOpen(true)}
      />

      {/* 1. Full-Width Monthly Evolution Section */}
      <section
        className="tp-dre-evolution-section"
        aria-label="Evolução Mensal do Resultado"
      >
        {monthlyError ? (
          <div className="tp-state-card tp-state-error" role="alert">
            <div className="tp-state-icon">
              <AlertCircle size={18} />
            </div>
            <div className="tp-state-content">
              <h4 className="tp-state-title">
                Falha ao carregar evolução mensal
              </h4>
              <p className="tp-state-message">{monthlyError}</p>
              <button
                type="button"
                className="tp-btn-retry"
                onClick={() => void loadMonthly(requiredYearsKey)}
              >
                <RefreshCw size={12} />
                <span>Tentar novamente</span>
              </button>
            </div>
          </div>
        ) : (
          <FinancialDreMonthlyChart
            monthlyData={monthlyData}
            period={currentPeriod}
            isLoading={isLoadingMonthly}
          />
        )}
      </section>

      {/* 2. Full-Width DRE Table Section */}
      <section
        className="tp-dre-table-section"
        aria-label="Demonstrativo do Resultado do Exercício"
      >
        <FinancialDreTable
          totals={totals}
          realizedRevenue={totals.realizedRevenue}
        />
      </section>

      {/* 3. Full-Width Expense Breakdown Section */}
      <section
        className="tp-dre-breakdown-section"
        aria-label="Composição das Despesas"
      >
        {breakdownError ? (
          <div className="tp-state-card tp-state-error" role="alert">
            <div className="tp-state-icon">
              <AlertCircle size={18} />
            </div>
            <div className="tp-state-content">
              <h4 className="tp-state-title">
                Falha ao carregar composição de despesas
              </h4>
              <p className="tp-state-message">{breakdownError}</p>
              <button
                type="button"
                className="tp-btn-retry"
                onClick={() =>
                  void loadBreakdown(currentPeriod.from, currentPeriod.to)
                }
              >
                <RefreshCw size={12} />
                <span>Tentar novamente</span>
              </button>
            </div>
          </div>
        ) : (
          <FinancialDreBreakdownCard
            breakdown={breakdownData}
            isLoading={isLoadingBreakdown}
          />
        )}
      </section>

      {/* Discreet Legal & Managerial Disclaimer */}
      <footer className="tp-dre-footer-disclaimer">
        <HelpCircle size={14} className="tp-disclaimer-icon" />
        <span>{summaryData.disclaimer || DRE_DISCLAIMER}</span>
      </footer>

      {/* Missing Costs Inspector Modal */}
      {isMissingCostsOpen && (
        <div
          className="tp-modal-overlay"
          role="dialog"
          aria-modal="true"
          aria-labelledby="missing-costs-title"
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(15, 23, 42, 0.75)",
            backdropFilter: "blur(4px)",
            zIndex: 1000,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "20px",
          }}
        >
          <div
            className="tp-modal-box"
            style={{
              background: "#0f172a",
              border: "1px solid #334155",
              borderRadius: "12px",
              width: "100%",
              maxWidth: "1000px",
              maxHeight: "90vh",
              display: "flex",
              flexDirection: "column",
              boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.5)",
              color: "#f8fafc",
            }}
          >
            {/* Header */}
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                padding: "16px 24px",
                borderBottom: "1px solid #1e293b",
              }}
            >
              <div>
                <h3 id="missing-costs-title" style={{ margin: 0, fontSize: "18px", fontWeight: 700, color: "#f8fafc" }}>
                  CMVs Pendentes
                </h3>
                <p style={{ margin: "4px 0 0 0", fontSize: "12px", color: "#94a3b8" }}>
                  Itens e produtos com vendas realizadas no período sem custo temporal associado no sistema.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsMissingCostsOpen(false)}
                style={{
                  background: "none",
                  border: "none",
                  color: "#94a3b8",
                  cursor: "pointer",
                  padding: "4px",
                }}
                aria-label="Fechar"
              >
                <X size={20} />
              </button>
            </div>

            {/* Summary Cards */}
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
                gap: "12px",
                padding: "16px 24px",
                background: "#0b1120",
                borderBottom: "1px solid #1e293b",
              }}
            >
              <div style={{ background: "#1e293b", padding: "12px 16px", borderRadius: "8px", border: "1px solid #334155" }}>
                <span style={{ fontSize: "11px", color: "#94a3b8", textTransform: "uppercase", fontWeight: 600 }}>
                  Receita sem CMV
                </span>
                <div style={{ fontSize: "18px", fontWeight: 700, color: "#f59e0b", marginTop: "4px" }}>
                  {formatCurrency(totalUncoveredRevenue)}
                </div>
              </div>
              <div style={{ background: "#1e293b", padding: "12px 16px", borderRadius: "8px", border: "1px solid #334155" }}>
                <span style={{ fontSize: "11px", color: "#94a3b8", textTransform: "uppercase", fontWeight: 600 }}>
                  Itens Pendentes
                </span>
                <div style={{ fontSize: "18px", fontWeight: 700, color: "#38bdf8", marginTop: "4px" }}>
                  {missingCostsTotal || missingCosts.length} itens
                </div>
              </div>
              <div style={{ background: "#1e293b", padding: "12px 16px", borderRadius: "8px", border: "1px solid #334155" }}>
                <span style={{ fontSize: "11px", color: "#94a3b8", textTransform: "uppercase", fontWeight: 600 }}>
                  Produtos Afetados
                </span>
                <div style={{ fontSize: "18px", fontWeight: 700, color: "#a855f7", marginTop: "4px" }}>
                  {groupedMissingProducts.length} produtos
                </div>
              </div>
            </div>

            {/* View Mode Toggle & Search */}
            <div
              style={{
                padding: "12px 24px",
                display: "flex",
                flexWrap: "wrap",
                gap: "12px",
                alignItems: "center",
                justifyContent: "space-between",
                borderBottom: "1px solid #1e293b",
              }}
            >
              <div style={{ display: "flex", background: "#1e293b", padding: "3px", borderRadius: "8px", border: "1px solid #334155" }}>
                <button
                  type="button"
                  onClick={() => setMissingCostsViewMode("items")}
                  style={{
                    background: missingCostsViewMode === "items" ? "#0284c7" : "transparent",
                    color: missingCostsViewMode === "items" ? "#ffffff" : "#94a3b8",
                    border: "none",
                    borderRadius: "6px",
                    padding: "6px 14px",
                    fontSize: "12px",
                    fontWeight: 600,
                    cursor: "pointer",
                    transition: "all 0.15s ease",
                  }}
                >
                  Por Venda / Item ({missingCosts.length})
                </button>
                <button
                  type="button"
                  onClick={() => setMissingCostsViewMode("products")}
                  style={{
                    background: missingCostsViewMode === "products" ? "#0284c7" : "transparent",
                    color: missingCostsViewMode === "products" ? "#ffffff" : "#94a3b8",
                    border: "none",
                    borderRadius: "6px",
                    padding: "6px 14px",
                    fontSize: "12px",
                    fontWeight: 600,
                    cursor: "pointer",
                    transition: "all 0.15s ease",
                  }}
                >
                  Agrupado por Produto ({groupedMissingProducts.length})
                </button>
              </div>

              <div style={{ position: "relative", minWidth: "280px", flex: 1, maxWidth: "420px" }}>
                <Search size={15} style={{ position: "absolute", left: "10px", top: "9px", color: "#64748b" }} />
                <input
                  type="text"
                  placeholder="Buscar produto, código ou documento..."
                  value={missingSearchTerm}
                  onChange={(e) => setMissingSearchTerm(e.target.value)}
                  style={{
                    width: "100%",
                    background: "#1e293b",
                    border: "1px solid #334155",
                    borderRadius: "6px",
                    padding: "6px 12px 6px 32px",
                    color: "#f8fafc",
                    fontSize: "12px",
                    boxSizing: "border-box",
                  }}
                />
              </div>
            </div>

            {/* Table Content */}
            <div style={{ flex: 1, overflowY: "auto", padding: "16px 24px" }}>
              {isLoadingMissingCosts ? (
                <div style={{ textAlign: "center", padding: "40px", color: "#94a3b8" }}>
                  <RefreshCw size={24} className="tp-spin" style={{ marginBottom: "8px" }} />
                  <div>Carregando pendências de CMV...</div>
                </div>
              ) : missingCostsError ? (
                <div style={{ color: "#ef4444", padding: "20px", textAlign: "center" }}>
                  {missingCostsError}
                </div>
              ) : missingCosts.length === 0 ? (
                <div style={{ textAlign: "center", padding: "40px", color: "#10b981" }}>
                  <CheckCircle2 size={32} style={{ marginBottom: "8px" }} />
                  <div style={{ fontWeight: 600 }}>Nenhum produto com CMV pendente no período!</div>
                  <div style={{ fontSize: "12px", color: "#94a3b8", marginTop: "4px" }}>
                    100% da receita realizada possui custo disponível.
                  </div>
                </div>
              ) : missingCostsViewMode === "items" ? (
                /* Mode: Por Venda / Item */
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "12px" }}>
                  <thead>
                    <tr style={{ borderBottom: "1px solid #334155", textAlign: "left", color: "#94a3b8" }}>
                      <th style={{ padding: "8px" }}>Data</th>
                      <th style={{ padding: "8px" }}>Doc / Venda</th>
                      <th style={{ padding: "8px" }}>Produto</th>
                      <th style={{ padding: "8px", textAlign: "right" }}>Qtd</th>
                      <th style={{ padding: "8px", textAlign: "right" }}>Receita</th>
                      <th style={{ padding: "8px" }}>Motivo</th>
                      <th style={{ padding: "8px", textAlign: "center" }}>Ação</th>
                    </tr>
                  </thead>
                  <tbody>
                    {missingCosts
                      .filter((item) => {
                        if (!missingSearchTerm) return true;
                        const term = missingSearchTerm.toLowerCase();
                        const pName = (item.productName || item.description || "").toLowerCase();
                        const pCode = (item.productCode || item.code || "").toLowerCase();
                        const doc = (item.documentNumber || "").toLowerCase();
                        return pName.includes(term) || pCode.includes(term) || doc.includes(term);
                      })
                      .map((item) => (
                        <tr key={item.saleItemId || `${item.sourceProductId}-${item.saleDate}`} style={{ borderBottom: "1px solid #1e293b" }}>
                          <td style={{ padding: "8px", whiteSpace: "nowrap", color: "#94a3b8" }}>
                            {item.saleDate ? formatDateBr(item.saleDate) : "—"}
                          </td>
                          <td style={{ padding: "8px", fontFamily: "monospace", color: "#64748b", fontSize: "11px" }}>
                            {item.documentNumber || "—"}
                          </td>
                          <td style={{ padding: "8px" }}>
                            <div style={{ fontWeight: 600, color: "#f8fafc" }}>
                              {item.productName || item.description || `Produto ${item.sourceProductId}`}
                            </div>
                            <div style={{ fontSize: "11px", color: "#38bdf8", fontFamily: "monospace" }}>
                              {item.productCode || item.code || item.sourceProductId}
                            </div>
                          </td>
                          <td style={{ padding: "8px", textAlign: "right", whiteSpace: "nowrap" }}>
                            {item.quantity ?? item.totalQuantity ?? 1} un
                          </td>
                          <td style={{ padding: "8px", textAlign: "right", color: "#f59e0b", fontWeight: 600, whiteSpace: "nowrap" }}>
                            {formatCurrency(item.soldValue ?? item.uncoveredRevenue ?? 0)}
                          </td>
                          <td style={{ padding: "8px", fontSize: "11px", color: "#94a3b8" }}>
                            {item.reason === "PRODUTO_NAO_ENCONTRADO_NO_CATALOGO"
                              ? "Sem cadastro catálogo"
                              : "Sem histórico de custo"}
                          </td>
                          <td style={{ padding: "8px", textAlign: "center", whiteSpace: "nowrap" }}>
                            <div style={{ display: "flex", gap: "6px", justifyContent: "center" }}>
                              <button
                                type="button"
                                onClick={() => handleOpenAddCost(item)}
                                style={{
                                  background: "#0284c7",
                                  color: "#ffffff",
                                  border: "none",
                                  borderRadius: "4px",
                                  padding: "4px 8px",
                                  fontSize: "11px",
                                  fontWeight: 600,
                                  cursor: "pointer",
                                  display: "inline-flex",
                                  alignItems: "center",
                                  gap: "3px",
                                }}
                              >
                                <Plus size={12} />
                                <span>INFORMAR CMV</span>
                              </button>
                              <button
                                type="button"
                                onClick={() =>
                                  handleOpenHistory(
                                    item.sourceProductId,
                                    item.productName || item.description,
                                  )
                                }
                                title="Ver histórico de custos"
                                style={{
                                  background: "#1e293b",
                                  color: "#94a3b8",
                                  border: "1px solid #334155",
                                  borderRadius: "4px",
                                  padding: "4px 6px",
                                  cursor: "pointer",
                                }}
                              >
                                <History size={13} />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              ) : (
                /* Mode: Agrupado por Produto */
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "12px" }}>
                  <thead>
                    <tr style={{ borderBottom: "1px solid #334155", textAlign: "left", color: "#94a3b8" }}>
                      <th style={{ padding: "8px" }}>Código</th>
                      <th style={{ padding: "8px" }}>Produto</th>
                      <th style={{ padding: "8px", textAlign: "right" }}>Vendas / Itens</th>
                      <th style={{ padding: "8px", textAlign: "right" }}>Qtd Total</th>
                      <th style={{ padding: "8px", textAlign: "right" }}>Receita Descoberta</th>
                      <th style={{ padding: "8px", textAlign: "center" }}>Ação</th>
                    </tr>
                  </thead>
                  <tbody>
                    {groupedMissingProducts
                      .filter((prod) => {
                        if (!missingSearchTerm) return true;
                        const term = missingSearchTerm.toLowerCase();
                        return (
                          prod.productName.toLowerCase().includes(term) ||
                          (prod.productCode && prod.productCode.toLowerCase().includes(term)) ||
                          prod.sourceProductId.toLowerCase().includes(term)
                        );
                      })
                      .map((prod) => (
                        <tr key={prod.sourceProductId} style={{ borderBottom: "1px solid #1e293b" }}>
                          <td style={{ padding: "8px", fontFamily: "monospace", color: "#38bdf8", whiteSpace: "nowrap" }}>
                            {prod.productCode || prod.sourceProductId}
                          </td>
                          <td style={{ padding: "8px", fontWeight: 600 }}>
                            {prod.productName}
                          </td>
                          <td style={{ padding: "8px", textAlign: "right", color: "#94a3b8" }}>
                            {prod.itemsCount} ocorrência(s)
                          </td>
                          <td style={{ padding: "8px", textAlign: "right", whiteSpace: "nowrap" }}>
                            {prod.totalQuantity} un
                          </td>
                          <td style={{ padding: "8px", textAlign: "right", color: "#f59e0b", fontWeight: 600, whiteSpace: "nowrap" }}>
                            {formatCurrency(prod.totalSoldValue)}
                          </td>
                          <td style={{ padding: "8px", textAlign: "center", whiteSpace: "nowrap" }}>
                            <div style={{ display: "flex", gap: "6px", justifyContent: "center" }}>
                              <button
                                type="button"
                                onClick={() =>
                                  handleOpenAddCost({
                                    productId: prod.productId,
                                    sourceProductId: prod.sourceProductId,
                                    productName: prod.productName,
                                    productCode: prod.productCode,
                                    saleDate: prod.earliestSaleDate,
                                    currentCost: prod.currentCost,
                                  })
                                }
                                style={{
                                  background: "#0284c7",
                                  color: "#ffffff",
                                  border: "none",
                                  borderRadius: "4px",
                                  padding: "4px 8px",
                                  fontSize: "11px",
                                  fontWeight: 600,
                                  cursor: "pointer",
                                  display: "inline-flex",
                                  alignItems: "center",
                                  gap: "3px",
                                }}
                              >
                                <Plus size={12} />
                                <span>INFORMAR CMV</span>
                              </button>
                              <button
                                type="button"
                                onClick={() => handleOpenHistory(prod.sourceProductId, prod.productName)}
                                title="Ver histórico de custos"
                                style={{
                                  background: "#1e293b",
                                  color: "#94a3b8",
                                  border: "1px solid #334155",
                                  borderRadius: "4px",
                                  padding: "4px 6px",
                                  cursor: "pointer",
                                }}
                              >
                                <History size={13} />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              )}
            </div>

            {/* Footer */}
            <div
              style={{
                padding: "12px 24px",
                borderTop: "1px solid #1e293b",
                display: "flex",
                justifyContent: "flex-end",
                background: "#090d16",
                borderBottomLeftRadius: "12px",
                borderBottomRightRadius: "12px",
              }}
            >
              <button
                type="button"
                onClick={() => setIsMissingCostsOpen(false)}
                style={{
                  background: "#1e293b",
                  border: "1px solid #334155",
                  borderRadius: "6px",
                  color: "#f8fafc",
                  padding: "6px 14px",
                  fontSize: "12.5px",
                  fontWeight: 500,
                  cursor: "pointer",
                }}
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add Product Cost Modal */}
      {isAddCostOpen && selectedProductForCost && (
        <div
          className="tp-modal-overlay"
          role="dialog"
          aria-modal="true"
          aria-labelledby="add-cost-title"
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(15, 23, 42, 0.85)",
            backdropFilter: "blur(6px)",
            zIndex: 1100,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "20px",
          }}
        >
          <div
            className="tp-modal-box"
            style={{
              background: "#0f172a",
              border: "1px solid #38bdf8",
              borderRadius: "12px",
              width: "100%",
              maxWidth: "520px",
              display: "flex",
              flexDirection: "column",
              boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.75)",
              color: "#f8fafc",
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                padding: "16px 20px",
                borderBottom: "1px solid #1e293b",
              }}
            >
              <h3 id="add-cost-title" style={{ margin: 0, fontSize: "16px", fontWeight: 700, color: "#f8fafc" }}>
                Cadastrar Custo Unitário
              </h3>
              <button
                type="button"
                onClick={() => setIsAddCostOpen(false)}
                style={{
                  background: "none",
                  border: "none",
                  color: "#94a3b8",
                  cursor: "pointer",
                  padding: "4px",
                }}
                aria-label="Fechar"
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleSaveCost} style={{ padding: "20px" }}>
              <div style={{ marginBottom: "14px" }}>
                <label style={{ display: "block", fontSize: "11px", color: "#94a3b8", textTransform: "uppercase", fontWeight: 700, marginBottom: "4px" }}>
                  Produto Selecionado
                </label>
                <div style={{ background: "#1e293b", padding: "10px", borderRadius: "6px", fontSize: "13px" }}>
                  <div style={{ fontWeight: 600 }}>{selectedProductForCost.productName}</div>
                  <div style={{ fontSize: "11px", color: "#38bdf8", marginTop: "2px" }}>
                    Código: {selectedProductForCost.productCode || "—"} | ID: {selectedProductForCost.sourceProductId}
                  </div>
                </div>
              </div>

              <div style={{ marginBottom: "14px" }}>
                <label style={{ display: "block", fontSize: "11px", color: "#94a3b8", textTransform: "uppercase", fontWeight: 700, marginBottom: "4px" }}>
                  Custo Unitário (R$) *
                </label>
                <input
                  type="text"
                  required
                  placeholder="Ex: 25.50"
                  value={costFormUnitCost}
                  onChange={(e) => setCostFormUnitCost(e.target.value)}
                  style={{
                    width: "100%",
                    background: "#1e293b",
                    border: "1px solid #334155",
                    borderRadius: "6px",
                    padding: "8px 12px",
                    color: "#f8fafc",
                    fontSize: "14px",
                    fontWeight: 600,
                    boxSizing: "border-box",
                  }}
                />
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px", marginBottom: "14px" }}>
                <div>
                  <label style={{ display: "block", fontSize: "11px", color: "#94a3b8", textTransform: "uppercase", fontWeight: 700, marginBottom: "4px" }}>
                    Vigência Início *
                  </label>
                  <input
                    type="date"
                    required
                    value={costFormValidFrom}
                    onChange={(e) => setCostFormValidFrom(e.target.value)}
                    style={{
                      width: "100%",
                      background: "#1e293b",
                      border: "1px solid #334155",
                      borderRadius: "6px",
                      padding: "8px 10px",
                      color: "#f8fafc",
                      fontSize: "12px",
                      boxSizing: "border-box",
                    }}
                  />
                </div>
                <div>
                  <label style={{ display: "block", fontSize: "11px", color: "#94a3b8", textTransform: "uppercase", fontWeight: 700, marginBottom: "4px" }}>
                    Vigência Fim (Opcional)
                  </label>
                  <input
                    type="date"
                    value={costFormValidTo}
                    onChange={(e) => setCostFormValidTo(e.target.value)}
                    style={{
                      width: "100%",
                      background: "#1e293b",
                      border: "1px solid #334155",
                      borderRadius: "6px",
                      padding: "8px 10px",
                      color: "#f8fafc",
                      fontSize: "12px",
                      boxSizing: "border-box",
                    }}
                  />
                </div>
              </div>

              <div style={{ marginBottom: "18px" }}>
                <label style={{ display: "block", fontSize: "11px", color: "#94a3b8", textTransform: "uppercase", fontWeight: 700, marginBottom: "4px" }}>
                  Observação / Justificativa
                </label>
                <input
                  type="text"
                  value={costFormNote}
                  onChange={(e) => setCostFormNote(e.target.value)}
                  style={{
                    width: "100%",
                    background: "#1e293b",
                    border: "1px solid #334155",
                    borderRadius: "6px",
                    padding: "8px 12px",
                    color: "#f8fafc",
                    fontSize: "12px",
                    boxSizing: "border-box",
                  }}
                />
              </div>

              {costSubmitError && (
                <div style={{ background: "rgba(239, 68, 68, 0.15)", border: "1px solid #ef4444", color: "#fca5a5", padding: "8px 12px", borderRadius: "6px", fontSize: "12px", marginBottom: "14px" }}>
                  {costSubmitError}
                </div>
              )}

              {costSubmitSuccess && (
                <div style={{ background: "rgba(16, 185, 129, 0.15)", border: "1px solid #10b981", color: "#6ee7b7", padding: "8px 12px", borderRadius: "6px", fontSize: "12px", marginBottom: "14px" }}>
                  {costSubmitSuccess}
                </div>
              )}

              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <button
                  type="button"
                  onClick={() => handleOpenHistory(selectedProductForCost.sourceProductId, selectedProductForCost.productName)}
                  style={{
                    background: "none",
                    border: "none",
                    color: "#38bdf8",
                    fontSize: "12px",
                    fontWeight: 500,
                    cursor: "pointer",
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "4px",
                    padding: 0,
                  }}
                >
                  <History size={14} />
                  <span>Ver histórico de custos</span>
                </button>

                <div style={{ display: "flex", gap: "10px" }}>
                  <button
                    type="button"
                    onClick={() => setIsAddCostOpen(false)}
                    disabled={isSubmittingCost}
                    style={{
                      background: "#1e293b",
                      border: "1px solid #334155",
                      borderRadius: "6px",
                      color: "#94a3b8",
                      padding: "8px 14px",
                      fontSize: "12.5px",
                      cursor: "pointer",
                    }}
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    disabled={isSubmittingCost}
                    style={{
                      background: "#0284c7",
                      border: "none",
                      borderRadius: "6px",
                      color: "#ffffff",
                      padding: "8px 18px",
                      fontSize: "12.5px",
                      fontWeight: 600,
                      cursor: "pointer",
                      display: "inline-flex",
                      alignItems: "center",
                      gap: "6px",
                    }}
                  >
                    {isSubmittingCost ? <RefreshCw size={14} className="tp-spin" /> : null}
                    <span>{isSubmittingCost ? "Salvando..." : "Salvar Custo"}</span>
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* History Modal */}
      {isHistoryOpen && (
        <div
          className="tp-modal-overlay"
          role="dialog"
          aria-modal="true"
          aria-labelledby="cost-history-title"
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(15, 23, 42, 0.85)",
            backdropFilter: "blur(6px)",
            zIndex: 1200,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "20px",
          }}
        >
          <div
            className="tp-modal-box"
            style={{
              background: "#0f172a",
              border: "1px solid #334155",
              borderRadius: "12px",
              width: "100%",
              maxWidth: "700px",
              maxHeight: "80vh",
              display: "flex",
              flexDirection: "column",
              boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.75)",
              color: "#f8fafc",
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                padding: "16px 20px",
                borderBottom: "1px solid #1e293b",
              }}
            >
              <div>
                <h3 id="cost-history-title" style={{ margin: 0, fontSize: "16px", fontWeight: 700, color: "#f8fafc" }}>
                  Histórico de Custos Unitários
                </h3>
                <div style={{ fontSize: "12px", color: "#38bdf8", marginTop: "2px" }}>
                  {historyProductName}
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsHistoryOpen(false)}
                style={{
                  background: "none",
                  border: "none",
                  color: "#94a3b8",
                  cursor: "pointer",
                  padding: "4px",
                }}
                aria-label="Fechar"
              >
                <X size={18} />
              </button>
            </div>

            <div style={{ flex: 1, overflowY: "auto", padding: "16px 20px" }}>
              {isLoadingHistory ? (
                <div style={{ textAlign: "center", padding: "30px", color: "#94a3b8" }}>
                  <RefreshCw size={22} className="tp-spin" style={{ marginBottom: "8px" }} />
                  <div>Carregando histórico...</div>
                </div>
              ) : historyError ? (
                <div style={{ color: "#ef4444", padding: "20px", textAlign: "center" }}>
                  {historyError}
                </div>
              ) : productHistory.length === 0 ? (
                <div style={{ textAlign: "center", padding: "30px", color: "#94a3b8" }}>
                  Nenhum registro histórico de custo encontrado para este produto.
                </div>
              ) : (
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "12px" }}>
                  <thead>
                    <tr style={{ borderBottom: "1px solid #334155", textAlign: "left", color: "#94a3b8" }}>
                      <th style={{ padding: "8px" }}>Custo Unitário</th>
                      <th style={{ padding: "8px" }}>Origem</th>
                      <th style={{ padding: "8px" }}>Vigência Início</th>
                      <th style={{ padding: "8px" }}>Vigência Fim</th>
                      <th style={{ padding: "8px" }}>Observação</th>
                      <th style={{ padding: "8px" }}>Cadastrado Em</th>
                    </tr>
                  </thead>
                  <tbody>
                    {productHistory.map((h) => (
                      <tr key={h.id} style={{ borderBottom: "1px solid #1e293b" }}>
                        <td style={{ padding: "8px", fontWeight: 700, color: "#10b981" }}>
                          {formatCurrency(h.unitCost)}
                        </td>
                        <td style={{ padding: "8px" }}>
                          <span
                            style={{
                              background: h.costSource === "MANUAL" ? "rgba(56, 189, 248, 0.15)" : "#1e293b",
                              color: h.costSource === "MANUAL" ? "#38bdf8" : "#94a3b8",
                              padding: "2px 6px",
                              borderRadius: "4px",
                              fontSize: "10.5px",
                              fontWeight: 600,
                            }}
                          >
                            {h.costSource}
                          </span>
                        </td>
                        <td style={{ padding: "8px", color: "#f8fafc" }}>
                          {formatDateBr(h.validFrom)}
                        </td>
                        <td style={{ padding: "8px", color: h.validTo ? "#f8fafc" : "#10b981" }}>
                          {h.validTo ? formatDateBr(h.validTo) : "Atual (em aberto)"}
                        </td>
                        <td style={{ padding: "8px", color: "#94a3b8", maxWidth: "160px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {h.note || "—"}
                        </td>
                        <td style={{ padding: "8px", color: "#64748b", fontSize: "11px" }}>
                          {formatDateBr(h.createdAt)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            <div
              style={{
                padding: "12px 20px",
                borderTop: "1px solid #1e293b",
                display: "flex",
                justifyContent: "flex-end",
                background: "#090d16",
                borderBottomLeftRadius: "12px",
                borderBottomRightRadius: "12px",
              }}
            >
              <button
                type="button"
                onClick={() => setIsHistoryOpen(false)}
                style={{
                  background: "#1e293b",
                  border: "1px solid #334155",
                  borderRadius: "6px",
                  color: "#f8fafc",
                  padding: "6px 14px",
                  fontSize: "12px",
                  cursor: "pointer",
                }}
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Offscreen Export Report Host (mounted when export menu is open or export is running) */}
      {(isExportMenuOpen || isExportBusy) && (
        <div
          ref={exportReportHostRef}
          className="tp-dre-export-offscreen-host"
          aria-hidden="true"
        >
          <FinancialDreExportReport
            companyName={resolvedCompanyName}
            period={currentPeriod}
            summaryData={summaryData}
            monthlyData={monthlyData}
            breakdownData={breakdownData}
            layoutMode={exportLayoutMode}
          />
        </div>
      )}
    </div>
  );
}
