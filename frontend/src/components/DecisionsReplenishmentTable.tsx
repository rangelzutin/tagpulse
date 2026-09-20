import { useState, useEffect } from "react";
import { AlertCircle, Clock, ShieldAlert, ChevronLeft, ChevronRight } from "lucide-react";
import type {
  DecisionsProductItem,
  DecisionsReplenishmentGroups,
  InventoryWindowDays,
} from "../api/bi";
import { formatCurrency, formatNumber } from "../utils/formatters";

interface DecisionsReplenishmentTableProps {
  replenishment: DecisionsReplenishmentGroups;
  windowDays: InventoryWindowDays;
  onFilterResetTrigger?: number; // Para resetar página quando janela ou categoria mudar
}

type ReplenishmentTab = "demandWithoutStock" | "criticalCoverage" | "alertCoverage";

export function DecisionsReplenishmentTable({
  replenishment,
  windowDays,
  onFilterResetTrigger,
}: DecisionsReplenishmentTableProps) {
  const [activeTab, setActiveTab] = useState<ReplenishmentTab>("demandWithoutStock");
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState<number>(10);

  // Reset de página ao alterar tab ou acionador externo (janela/categoria)
  useEffect(() => {
    setCurrentPage(1);
  }, [activeTab, onFilterResetTrigger]);

  const currentList: DecisionsProductItem[] = replenishment[activeTab] || [];
  const totalItems = currentList.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));

  // Proteção: não permitir página maior que totalPages
  const safePage = Math.min(currentPage, totalPages);
  const startIndex = (safePage - 1) * pageSize;
  const endIndex = Math.min(startIndex + pageSize, totalItems);
  const paginatedItems = currentList.slice(startIndex, endIndex);

  return (
    <div className="tp-card tp-decisions-table-card">
      <div className="tp-decisions-card-header">
        <div className="tp-decisions-header-titles">
          <div className="tp-decisions-title-row">
            <ShieldAlert size={18} className="tp-icon-rose" />
            <h2 className="tp-card-title">Reposição — Onde Repor Primeiro</h2>
          </div>
          <p className="tp-card-subtitle">
            Produtos ativos priorizados por maior lucro bruto estimado e menor cobertura de estoque
          </p>
        </div>

        <div className="tp-decisions-tabs" role="tablist" aria-label="Abas de Reposição">
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === "demandWithoutStock"}
            className={`tp-decisions-tab-btn ${activeTab === "demandWithoutStock" ? "is-active is-rose" : ""}`}
            onClick={() => setActiveTab("demandWithoutStock")}
          >
            <AlertCircle size={14} />
            <span>Demanda sem estoque</span>
            <span className="tp-tab-count-badge">
              {replenishment.demandWithoutStock.length}
            </span>
          </button>

          <button
            type="button"
            role="tab"
            aria-selected={activeTab === "criticalCoverage"}
            className={`tp-decisions-tab-btn ${activeTab === "criticalCoverage" ? "is-active is-red" : ""}`}
            onClick={() => setActiveTab("criticalCoverage")}
          >
            <Clock size={14} />
            <span>Cobertura crítica &lt; 15 dias</span>
            <span className="tp-tab-count-badge">
              {replenishment.criticalCoverage.length}
            </span>
          </button>

          <button
            type="button"
            role="tab"
            aria-selected={activeTab === "alertCoverage"}
            className={`tp-decisions-tab-btn ${activeTab === "alertCoverage" ? "is-active is-amber" : ""}`}
            onClick={() => setActiveTab("alertCoverage")}
          >
            <Clock size={14} />
            <span>Cobertura de alerta 15–30 dias</span>
            <span className="tp-tab-count-badge">
              {replenishment.alertCoverage.length}
            </span>
          </button>
        </div>
      </div>

      <div className="tp-table-responsive">
        <table className="tp-table tp-table-compact" aria-label="Tabela de Reposição">
          <thead>
            <tr>
              <th className="tp-th-left" scope="col">Produto</th>
              <th className="tp-th-left" scope="col">Categoria raiz / Família</th>
              <th className="tp-th-right" scope="col">Estoque</th>
              <th className="tp-th-right" scope="col">Vendas ({windowDays}d)</th>
              <th className="tp-th-right" scope="col">Receita</th>
              <th className="tp-th-right" scope="col">Lucro Bruto Est.</th>
              <th className="tp-th-right" scope="col">Margem Est.</th>
              <th className="tp-th-center" scope="col">Cobertura</th>
              <th className="tp-th-center" scope="col">Canais</th>
              <th className="tp-th-right" scope="col">Clientes</th>
            </tr>
          </thead>
          <tbody>
            {paginatedItems.length === 0 ? (
              <tr>
                <td colSpan={10} className="tp-table-empty">
                  Nenhum produto encontrado nesta faixa de reposição para os filtros aplicados.
                </td>
              </tr>
            ) : (
              paginatedItems.map((item) => {
                const hasMargin = item.estimatedGrossMarginPercentInWindow !== null;
                const marginVal = item.estimatedGrossMarginPercentInWindow ?? 0;

                return (
                  <tr key={item.productSourceId} className="tp-table-row">
                    <td className="tp-td-left">
                      <div className="tp-prod-info">
                        <span className="tp-prod-name" title={item.description ?? ""}>
                          {item.description || "Sem descrição"}
                        </span>
                        <div className="tp-prod-sub">
                          {item.code && <span className="tp-prod-code">Cód: {item.code}</span>}
                          {item.categoryDescription && (
                            <span className="tp-prod-cat">• {item.categoryDescription}</span>
                          )}
                        </div>
                      </div>
                    </td>

                    <td className="tp-td-left">
                      <span className="tp-root-badge">
                        {item.rootCategoryDescription || "—"}
                      </span>
                    </td>

                    <td className="tp-td-right tp-font-mono">
                      <span className={item.currentStock <= 0 ? "tp-stock-zero" : "tp-stock-pos"}>
                        {formatNumber(item.currentStock)} un
                      </span>
                    </td>

                    <td className="tp-td-right tp-font-mono">
                      {formatNumber(item.physicalQuantityInWindow)} un
                    </td>

                    <td className="tp-td-right tp-font-mono">
                      {formatCurrency(item.realizedRevenueInWindow)}
                    </td>

                    <td className="tp-td-right tp-font-mono tp-td-bold">
                      {item.estimatedGrossProfitInWindow !== null
                        ? formatCurrency(item.estimatedGrossProfitInWindow)
                        : "—"}
                    </td>

                    <td className="tp-td-right tp-font-mono">
                      {hasMargin ? (
                        <span
                          className={`tp-margin-badge ${
                            marginVal >= 40
                              ? "is-emerald"
                              : marginVal >= 25
                                ? "is-blue"
                                : marginVal >= 0
                                  ? "is-amber"
                                  : "is-rose"
                          }`}
                        >
                          {marginVal.toFixed(1)}%
                        </span>
                      ) : (
                        "—"
                      )}
                    </td>

                    <td className="tp-td-center">
                      {item.currentStock <= 0 || item.estimatedCoverageDays === null ? (
                        <span className="tp-cov-badge is-nostock">Sem estoque</span>
                      ) : item.estimatedCoverageDays < 15 ? (
                        <span className="tp-cov-badge is-critical">
                          {item.estimatedCoverageDays.toFixed(1)} dias
                        </span>
                      ) : item.estimatedCoverageDays < 30 ? (
                        <span className="tp-cov-badge is-alert">
                          {item.estimatedCoverageDays.toFixed(1)} dias
                        </span>
                      ) : (
                        <span className="tp-cov-badge is-normal">
                          {item.estimatedCoverageDays.toFixed(1)} dias
                        </span>
                      )}
                    </td>

                    <td className="tp-td-center">
                      <div className="tp-channel-badges-wrap">
                        {item.channelsInWindow.length === 0 ? (
                          <span className="tp-channel-tag is-dim">—</span>
                        ) : (
                          item.channelsInWindow.map((ch) => (
                            <span
                              key={ch}
                              className={`tp-channel-tag ${
                                ch === "ATACADO"
                                  ? "is-atacado"
                                  : ch === "VAREJO"
                                    ? "is-varejo"
                                    : "is-other"
                              }`}
                            >
                              {ch === "ATACADO" ? "Atacado" : ch === "VAREJO" ? "Varejo" : ch}
                            </span>
                          ))
                        )}
                      </div>
                    </td>

                    <td className="tp-td-right tp-font-mono">
                      {formatNumber(item.customerCountInWindow)}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Paginação */}
      {totalItems > 0 && (
        <div className="tp-pagination-bar">
          <div className="tp-pagination-info">
            Mostrando <strong>{startIndex + 1}</strong> a <strong>{endIndex}</strong> de{" "}
            <strong>{totalItems}</strong> produtos
          </div>

          <div className="tp-pagination-controls">
            <div className="tp-pagesize-select-wrap">
              <label htmlFor="rep-pagesize" className="tp-pagesize-label">Linhas:</label>
              <select
                id="rep-pagesize"
                className="tp-pagesize-select"
                value={pageSize}
                onChange={(e) => {
                  setPageSize(Number(e.target.value));
                  setCurrentPage(1);
                }}
              >
                <option value={10}>10</option>
                <option value={25}>25</option>
              </select>
            </div>

            <button
              type="button"
              className="tp-page-btn"
              disabled={safePage <= 1}
              onClick={() => setCurrentPage((prev) => Math.max(1, prev - 1))}
              aria-label="Página anterior"
            >
              <ChevronLeft size={16} />
              <span>Anterior</span>
            </button>

            <span className="tp-pagination-page-indicator">
              Página {safePage} de {totalPages}
            </span>

            <button
              type="button"
              className="tp-page-btn"
              disabled={safePage >= totalPages}
              onClick={() => setCurrentPage((prev) => Math.min(totalPages, prev + 1))}
              aria-label="Próxima página"
            >
              <span>Próxima</span>
              <ChevronRight size={16} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
