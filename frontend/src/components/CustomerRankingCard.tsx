import { Award, User } from "lucide-react";
import type { CustomerRankingItem } from "../api/bi";
import {
  formatCurrency,
  formatCustomerName,
  formatNumber,
  formatPercent,
} from "../utils/formatters";

interface CustomerRankingCardProps {
  ranking: CustomerRankingItem[];
  onSelectCustomer?: (customerId: string) => void;
}

export function CustomerRankingCard({
  ranking,
  onSelectCustomer,
}: CustomerRankingCardProps) {
  if (!ranking || ranking.length === 0) {
    return (
      <section className="tp-card tp-ranking-card" aria-label="Top 10 Clientes">
        <div className="tp-card-header">
          <div>
            <h3 className="tp-card-title">Top Clientes por Faturamento</h3>
            <p className="tp-card-subtitle">
              Principais compradores por faturamento no período
            </p>
          </div>
        </div>
        <div className="tp-empty-message">
          Nenhum cliente identificado com faturamento no período.
        </div>
      </section>
    );
  }

  const lastItem = ranking[ranking.length - 1];
  const totalTopShare = lastItem ? lastItem.cumulativeRevenueSharePercent : 0;

  return (
    <section className="tp-card tp-ranking-card" aria-label="Top 10 Clientes">
      <div className="tp-card-header">
        <div>
          <div className="tp-title-with-badge">
            <h3 className="tp-card-title">Top Clientes por Faturamento</h3>
            <span className="tp-badge-count">Top {ranking.length}</span>
          </div>
          <p className="tp-card-subtitle">
            Classificação por receita líquida realizada com cliente identificado
          </p>
        </div>
      </div>

      <div className="tp-table-responsive">
        <table className="tp-analytical-table">
          <thead>
            <tr>
              <th className="tp-th-rank">#</th>
              <th className="tp-th-client">Cliente</th>
              <th className="tp-th-num">Faturamento</th>
              <th className="tp-th-num">Compras</th>
              <th className="tp-th-num">Ticket médio</th>
              <th className="tp-th-share">Participação</th>
            </tr>
          </thead>
          <tbody>
            {ranking.map((item, index) => {
              const rank = index + 1;
              const isTop3 = rank <= 3;

              const isClickable = Boolean(onSelectCustomer && item.customerId);
              const formattedName = formatCustomerName(item.displayName);

              return (
                <tr
                  key={item.customerId || `${item.displayName}-${index}`}
                  className={`tp-table-row ${isTop3 ? "is-top-rank" : ""} ${isClickable ? "tp-table-row-clickable" : ""}`}
                  tabIndex={isClickable ? 0 : undefined}
                  role={isClickable ? "button" : undefined}
                  aria-label={
                    isClickable
                      ? `Ver detalhes de ${formattedName}`
                      : undefined
                  }
                  onClick={() => {
                    if (isClickable && item.customerId) {
                      onSelectCustomer?.(item.customerId);
                    }
                  }}
                  onKeyDown={(e) => {
                    if (
                      isClickable &&
                      item.customerId &&
                      (e.key === "Enter" || e.key === " ")
                    ) {
                      e.preventDefault();
                      onSelectCustomer?.(item.customerId);
                    }
                  }}
                >
                  <td className="tp-td-rank">
                    <span className={`tp-rank-tag tp-rank-${rank}`}>
                      {rank <= 3 && (
                        <Award size={11} className="tp-award-icon" />
                      )}
                      {rank}
                    </span>
                  </td>
                  <td className="tp-td-client">
                    <div className="tp-client-info">
                      <span
                        className="tp-client-name"
                        title={formattedName}
                      >
                        {formattedName}
                      </span>
                      {item.code && (
                        <span className="tp-client-code">Cód. {item.code}</span>
                      )}
                    </div>
                  </td>
                  <td className="tp-td-num tp-cell-strong">
                    {formatCurrency(item.revenue)}
                  </td>
                  <td className="tp-td-num">
                    {formatNumber(item.purchaseCount)}
                  </td>
                  <td className="tp-td-num">
                    {formatCurrency(item.averageTicket)}
                  </td>
                  <td className="tp-td-share">
                    <div className="tp-share-cell">
                      <span className="tp-share-text">
                        {formatPercent(item.revenueSharePercent)}
                      </span>
                      <div className="tp-share-track">
                        <div
                          className="tp-share-fill"
                          style={{
                            width: `${Math.min(100, Math.max(4, item.revenueSharePercent))}%`,
                          }}
                        />
                      </div>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="tp-card-footer">
        <span className="tp-footer-highlight-icon">
          <User size={13} />
        </span>
        <span className="tp-footer-text">
          Top {ranking.length} representam{" "}
          <strong className="tp-strong-cyan">
            {formatPercent(totalTopShare)}
          </strong>{" "}
          do faturamento identificado
        </span>
      </div>
    </section>
  );
}
