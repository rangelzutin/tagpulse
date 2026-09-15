import { ShieldAlert, HelpCircle } from "lucide-react";
import type { InventoryCoverageDistribution } from "../api/bi";
import { formatNumber } from "../utils/formatters";

interface InventoryCoverageCardProps {
  distribution: InventoryCoverageDistribution;
}

export function InventoryCoverageCard({
  distribution,
}: InventoryCoverageCardProps) {
  const {
    lt15,
    from15to30,
    from30to45,
    from45to90,
    gt90,
    totalWithStockAndSales,
    noSalesInWindow,
  } = distribution;

  const getPercent = (count: number) => {
    if (totalWithStockAndSales <= 0) return 0;
    return (count / totalWithStockAndSales) * 100;
  };

  const segments = [
    {
      label: "< 15 dias",
      count: lt15,
      percent: getPercent(lt15),
      colorClass: "tp-seg-lt15",
      desc: "Cobertura muito curta",
    },
    {
      label: "15–30 dias",
      count: from15to30,
      percent: getPercent(from15to30),
      colorClass: "tp-seg-15to30",
      desc: "Cobertura curta",
    },
    {
      label: "30–45 dias",
      count: from30to45,
      percent: getPercent(from30to45),
      colorClass: "tp-seg-30to45",
      desc: "Faixa equilibrada",
    },
    {
      label: "45–90 dias",
      count: from45to90,
      percent: getPercent(from45to90),
      colorClass: "tp-seg-45to90",
      desc: "Cobertura confortável",
    },
    {
      label: "> 90 dias",
      count: gt90,
      percent: getPercent(gt90),
      colorClass: "tp-seg-gt90",
      desc: "Cobertura estimada longa",
    },
  ];

  return (
    <section className="tp-card tp-inventory-coverage-card" aria-label="Cobertura estimada">
      <div className="tp-card-header">
        <div>
          <div className="tp-title-with-badge">
            <h3 className="tp-card-title">Cobertura estimada</h3>
            <span
              className="tp-help-tooltip-icon"
              title="Estoque atual ÷ velocidade média de saída da janela (não é previsão de demanda)"
            >
              <HelpCircle size={14} />
            </span>
          </div>
          <p className="tp-card-subtitle">
            Estoque atual ÷ velocidade média de saída da janela
          </p>
        </div>
        <div className="tp-coverage-total-badge">
          <span className="tp-coverage-total-label">Base com venda:</span>
          <strong>{`${formatNumber(totalWithStockAndSales)} SKUs`}</strong>
        </div>
      </div>

      <div className="tp-coverage-card-body">
        {/* Barra segmentada contínua */}
        <div className="tp-coverage-bar-section">
          <div className="tp-coverage-bar-wrap">
            <div
              className="tp-coverage-segmented-bar"
              role="progressbar"
              aria-label="Distribuição de cobertura estimada"
            >
              {segments.map((seg) => {
                if (seg.percent <= 0) return null;
                return (
                  <div
                    key={seg.label}
                    className={`tp-coverage-bar-seg ${seg.colorClass}`}
                    style={{ width: `${seg.percent}%` }}
                    title={`${seg.label}: ${seg.count} SKUs (${seg.percent.toFixed(1)}%) — ${seg.desc}`}
                  />
                );
              })}
            </div>
          </div>
        </div>

        {/* Legenda e contadores das faixas */}
        <div className="tp-coverage-legend-grid">
          {segments.map((seg) => (
            <div key={seg.label} className="tp-coverage-legend-item">
              <div className="tp-coverage-legend-header">
                <span className={`tp-coverage-legend-dot ${seg.colorClass}`} />
                <span className="tp-coverage-legend-label">{seg.label}</span>
              </div>
              <div className="tp-coverage-legend-values">
                <strong className="tp-coverage-legend-count">
                  {formatNumber(seg.count)}
                </strong>
                <span className="tp-coverage-legend-share">
                  {`${seg.percent.toFixed(1)}%`}
                </span>
              </div>
              <span className="tp-coverage-legend-desc">
                {seg.desc}
              </span>
            </div>
          ))}
        </div>

        {/* Item destacado separado: Produtos com estoque e sem saída */}
        <div className="tp-coverage-no-sales-pill">
          <div className="tp-no-sales-pill-left">
            <ShieldAlert size={16} className="tp-pill-icon" />
            <div className="tp-no-sales-pill-text">
              <span className="tp-pill-label">Sem saída física na janela:</span>
              <span className="tp-pill-desc">SKUs com saldo positivo e zero vendas recentes</span>
            </div>
          </div>
          <div className="tp-no-sales-pill-right">
            <strong className="tp-pill-count">{`${formatNumber(noSalesInWindow)} SKUs`}</strong>
            <span className="tp-pill-sub">(fora da distribuição matemática)</span>
          </div>
        </div>
      </div>
    </section>
  );
}
