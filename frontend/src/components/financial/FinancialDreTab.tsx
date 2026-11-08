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
} from "lucide-react";
import {
  fetchFinancialDreSummary,
  fetchFinancialDreMonthly,
  fetchFinancialDreBreakdown,
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

  const hasFullManagerialResult =
    totals.fullManagerialResultAvailable !== false && totals.netManagerialResult !== null;
  const isPositiveNet = hasFullManagerialResult && (totals.netManagerialResult ?? 0) > 0;
  const isNegativeNet = hasFullManagerialResult && (totals.netManagerialResult ?? 0) < 0;
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
            className={`tp-economic-status-badge ${
              totals.status === "PROFIT"
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
            className={`tp-kpi-card tp-profit-kpi-card ${
              isPositiveNet
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
                className={`tp-kpi-icon-wrap ${
                  isPositiveNet
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
                className={`tp-kpi-value ${
                  isPositiveNet
                    ? "tp-value-positive"
                    : isNegativeNet
                    ? "tp-value-negative"
                    : ""
                }`}
              >
                {hasFullManagerialResult
                  ? formatCurrency(totals.netManagerialResult as number)
                  : "Indisponível"}
              </span>
            </div>
            <div className="tp-profit-kpi-footer">
              <span
                className={`tp-kpi-status-badge ${
                  !hasFullManagerialResult
                    ? "is-even"
                    : isPositiveNet
                    ? "is-profit"
                    : isNegativeNet
                    ? "is-loss"
                    : "is-even"
                }`}
              >
                {!hasFullManagerialResult
                  ? "Cobertura Parcial"
                  : totals.status === "PROFIT"
                  ? "Lucro"
                  : totals.status === "LOSS"
                  ? "Prejuízo"
                  : "Equilíbrio"}
              </span>
              <span className="tp-profit-kpi-subtext">
                {!hasFullManagerialResult
                  ? `Margem parcial: ${totals.partialManagerialResultOnCoveredRevenue !== undefined ? formatCurrency(totals.partialManagerialResultOnCoveredRevenue) : "—"} (cobertura CMV ${totals.costCoveragePercent != null ? totals.costCoveragePercent.toFixed(1) + "%" : "—"})`
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
                className={`tp-kpi-icon-wrap ${
                  isPositiveNet
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
                className={`tp-kpi-value ${
                  hasFullManagerialResult &&
                  totals.netManagerialMarginPercent !== null &&
                  totals.netManagerialMarginPercent < 0
                    ? "tp-value-negative"
                    : hasFullManagerialResult &&
                      totals.netManagerialMarginPercent !== null &&
                      totals.netManagerialMarginPercent > 0
                    ? "tp-value-positive"
                    : ""
                }`}
              >
                {hasFullManagerialResult && totals.netManagerialMarginPercent !== null
                  ? formatPercent(totals.netManagerialMarginPercent, 2)
                  : "—"}
              </span>
            </div>
            <div className="tp-profit-kpi-footer">
              <span className="tp-profit-kpi-subtext">
                {hasFullManagerialResult
                  ? "Sobre a receita realizada"
                  : "Indisponível devido à cobertura parcial de custo"}
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
            className={`tp-secondary-value ${
              totals.financialResult.total < 0
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
