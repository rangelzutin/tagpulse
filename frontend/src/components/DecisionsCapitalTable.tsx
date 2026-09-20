import { useState, useEffect } from "react";
import { AlertTriangle, Boxes, ChevronLeft, ChevronRight, Layers } from "lucide-react";
import type {
  DecisionsCapitalGroups,
  DecisionsProductItem,
  InventoryWindowDays,
} from "../api/bi";
import { formatCurrency, formatNumber } from "../utils/formatters";

interface DecisionsCapitalTableProps {
  capitalOptimization: DecisionsCapitalGroups;
  windowDays: InventoryWindowDays;
  onFilterResetTrigger?: number;
}

type CapitalTab = "inventoryWithoutSales" | "highCoverage" | "inactiveWithStock";

export function DecisionsCapitalTable({
  capitalOptimization,
  windowDays,
  onFilterResetTrigger,
}: DecisionsCapitalTableProps) {
  const [activeTab, setActiveTab] = useState<CapitalTab>("inventoryWithoutSales");
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState<number>(10);

  // Reset de página ao alterar tab ou trigger externo
  useEffect(() => {
    setCurrentPage(1);
  }, [activeTab, onFilterResetTrigger]);

  const currentList: DecisionsProductItem[] = capitalOptimization[activeTab] || [];
  const totalItems = currentList.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));

  const safePage = Math.min(currentPage, totalPages);
  const startIndex = (safePage - 1) * pageSize;
  const endIndex = Math.min(startIndex + pageSize, totalItems);
  const paginatedItems = currentList.slice(startIndex, endIndex);

  return (
    <div className="tp-card tp-decisions-table-card">
      <div className="tp-decisions-card-header">
        <div className="tp-decisions-header-titles">
          <div className="tp-decisions-title-row">
            <Boxes size={18} className="tp-icon-amber" />
            <h2 className="tp-card-title">Capital — Onde Evitar Compra &amp; Otimizar Saldo</h2>
          </div>
          <p className="tp-card-subtitle">
            Estoque ordenado por maior capital imobilizado a custo para apoiar decisões de desmobilização e retenção de compras
          </p>
        </div>

        <div className="tp-decisions-tabs" role="tablist" aria-label="Abas de Capital">
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === "inventoryWithoutSales"}
            className={`tp-decisions-tab-btn ${activeTab === "inventoryWithoutSales" ? "is-active is-amber" : ""}`}
            onClick={() => setActiveTab("inventoryWithoutSales")}
          >
            <AlertTriangle size={14} />
            <span>Sem saída na janela</span>
            <span className="tp-tab-count-badge">
              {capitalOptimization.inventoryWithoutSales.length}
            </span>
          </button>

          <button
            type="button"
            role="tab"
            aria-selected={activeTab === "highCoverage"}
            className={`tp-decisions-tab-btn ${activeTab === "highCoverage" ? "is-active is-blue" : ""}`}
            onClick={() => setActiveTab("highCoverage")}
          >
            <Layers size={14} />
            <span>Cobertura &gt; 90 dias</span>
            <span className="tp-tab-count-badge">
              {capitalOptimization.highCoverage.length}
            </span>
          </button>

          <button
            type="button"
            role="tab"
            aria-selected={activeTab === "inactiveWithStock"}
            className={`tp-decisions-tab-btn ${activeTab === "inactiveWithStock" ? "is-active is-dim" : ""}`}
            onClick={() => setActiveTab("inactiveWithStock")}
          >
            <Boxes size={14} />
            <span>Inativos com estoque</span>
            <span className="tp-tab-count-badge">
              {capitalOptimization.inactiveWithStock.length}
            </span>
          </button>
        </div>
      </div>

      <div className="tp-table-responsive">
        <table className="tp-table tp-table-compact" aria-label="Tabela de Capital">
          <thead>
            <tr>
              <th className="tp-th-left" scope="col">Produto</th>
              <th className="tp-th-left" scope="col">Categoria raiz / Família</th>
              <th className="tp-th-right" scope="col">Estoque</th>
              <th className="tp-th-right" scope="col">Custo Unitário</th>
              <th className="tp-th-right" scope="col">Capital Atual</th>
              <th className="tp-th-right" scope="col">Vendas ({windowDays}d)</th>
              <th className="tp-th-center" scope="col">Dias s/ Saída</th>
              <th className="tp-th-center" scope="col">Cobertura</th>
              <th className="tp-th-right" scope="col">Valor de Tabela</th>
            </tr>
          </thead>
          <tbody>
            {paginatedItems.length === 0 ? (
              <tr>
                <td colSpan={9} className="tp-table-empty">
                  Nenhum produto encontrado nesta faixa de capital para os filtros aplicados.
                </td>
              </tr>
            ) : (
              paginatedItems.map((item) => {
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
                          {!item.active && (
                            <span className="tp-badge-inactive">Inativo no ERP</span>
                          )}
                        </div>
                      </div>
                    </td>

                    <td className="tp-td-left">
                      <span className="tp-root-badge">
                        {item.rootCategoryDescription || "—"}
                      </span>
                    </td>

                    <td className="tp-td-right tp-font-mono tp-stock-pos">
                      {formatNumber(item.currentStock)} un
                    </td>

                    <td className="tp-td-right tp-font-mono">
                      {item.currentEffectiveCost !== null
                        ? formatCurrency(item.currentEffectiveCost)
                        : "—"}
                    </td>

                    <td className="tp-td-right tp-font-mono tp-td-bold tp-color-amber">
                      {item.currentInventoryCostValue !== null
                        ? formatCurrency(item.currentInventoryCostValue)
                        : "—"}
                    </td>

                    <td className="tp-td-right tp-font-mono">
                      {formatNumber(item.physicalQuantityInWindow)} un
                    </td>

                    <td className="tp-td-center tp-font-mono">
                      {item.daysSinceLastPhysicalSale !== null ? (
                        <span
                          className={`tp-recency-pill ${
                            item.daysSinceLastPhysicalSale > 180
                              ? "is-ancient"
                              : item.daysSinceLastPhysicalSale > 90
                                ? "is-old"
                                : "is-moderate"
                          }`}
                        >
                          {item.daysSinceLastPhysicalSale} dias
                        </span>
                      ) : (
                        <span className="tp-recency-pill is-none">Sem registro</span>
                      )}
                    </td>

                    <td className="tp-td-center">
                      {item.estimatedCoverageDays !== null ? (
                        <span className="tp-cov-badge is-high">
                          {item.estimatedCoverageDays.toFixed(1)} dias
                        </span>
                      ) : (
                        <span className="tp-cov-badge is-none">—</span>
                      )}
                    </td>

                    <td className="tp-td-right tp-font-mono tp-td-muted">
                      {item.currentInventoryListValue !== null
                        ? formatCurrency(item.currentInventoryListValue)
                        : "—"}
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
              <label htmlFor="cap-pagesize" className="tp-pagesize-label">Linhas:</label>
              <select
                id="cap-pagesize"
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
