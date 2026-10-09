import { Ruler } from "lucide-react";
import type { ShapeSizeMixItem, ShapeCommercialSize } from "../api/bi";
import { formatCurrency, formatNumber, formatPercent } from "../utils/formatters";

interface ProductShapeSizeMixCardProps {
  shapeSizeMix?: ShapeSizeMixItem[];
}

const FIXED_SIZE_ORDER: ShapeCommercialSize[] = [
  "7.7",
  "7.8",
  "8.0",
  "8.1",
  "8.2",
  "8.5",
  "OTHER",
  "UNCLASSIFIED",
];

function getShapeSizeDisplay(size: ShapeCommercialSize, label?: string) {
  if (size === "OTHER" || label === "OTHER" || label === "Outros") {
    return { title: "Outros", subtitle: "Outros tamanhos detectados" };
  }
  if (
    size === "UNCLASSIFIED" ||
    label === "UNCLASSIFIED" ||
    label === "Não classificado"
  ) {
    return { title: "Não classificado", subtitle: "Shape sem medida detectada" };
  }

  // Remove qualquer aspa pré-existente (retas, curvas, simples ou duplas) da string
  const clean = String(label || size || "")
    .replace(/["“”'']/g, "")
    .trim();

  return {
    title: clean ? `${clean}"` : `${size}"`,
    subtitle: `Tamanho ${clean || size}`,
  };
}

export function ProductShapeSizeMixCard({
  shapeSizeMix = [],
}: ProductShapeSizeMixCardProps) {
  // Cria mapa rápido para ordenação fixa
  const itemsBySize = new Map<ShapeCommercialSize, ShapeSizeMixItem>();
  let totalShapesQuantity = 0;

  for (const item of shapeSizeMix) {
    itemsBySize.set(item.size, item);
    totalShapesQuantity += item.realizedQuantity;
  }

  const orderedItems: ShapeSizeMixItem[] = FIXED_SIZE_ORDER.map((size) => {
    return (
      itemsBySize.get(size) ?? {
        size,
        label: size,
        realizedRevenue: 0,
        realizedQuantity: 0,
        revenueShare: 0,
        quantityShare: 0,
        distinctProducts: 0,
      }
    );
  });

  // Filtra itens com volume > 0 para exibição limpa, ou preserva todos se desejar
  const hasAnyShapes = totalShapesQuantity > 0;

  if (!hasAnyShapes) {
    return (
      <section className="tp-card tp-mix-card" aria-label="Shapes por Tamanho">
        <div className="tp-card-header">
          <div>
            <h3 className="tp-card-title">Shapes por Tamanho</h3>
            <p className="tp-card-subtitle">
              Distribuição do volume físico entre larguras de shapes
            </p>
          </div>
        </div>
        <div className="tp-empty-message">
          Nenhum shape vendido no período selecionado.
        </div>
      </section>
    );
  }

  // Filtramos os que têm movimentação no período para apresentação gerencial elegante
  const activeItems = orderedItems.filter((item) => item.realizedQuantity > 0);

  return (
    <section className="tp-card tp-mix-card" aria-label="Shapes por Tamanho">
      <div className="tp-card-header">
        <div>
          <div className="tp-title-with-badge">
            <h3 className="tp-card-title">Shapes por Tamanho</h3>
            <span className="tp-badge-count">
              {formatNumber(totalShapesQuantity)} un
            </span>
          </div>
          <p className="tp-card-subtitle">
            Participação por volume no universo de shapes vendidos
          </p>
        </div>
      </div>

      <div className="tp-mix-ranking-list">
        {activeItems.map((item) => {
          const display = getShapeSizeDisplay(item.size, item.label);
          // O backend já calculou quantityShare relativo ao universo de shapes
          const qtyShare = item.quantityShare ?? 0;

          return (
            <div key={item.size} className="tp-mix-item-row">
              <div className="tp-mix-meta-line">
                <div className="tp-mix-name-wrap">
                  <Ruler size={11} className="tp-mix-icon" />
                  <span className="tp-mix-name" title={display.subtitle}>
                    {display.title}
                  </span>
                </div>
                <div className="tp-mix-figures">
                  <span className="tp-shape-qty-primary">
                    {formatNumber(item.realizedQuantity)} un · {formatPercent(qtyShare)}
                  </span>
                  <span className="tp-shape-rev-secondary">
                    {formatCurrency(item.realizedRevenue)}
                  </span>
                </div>
              </div>

              {/* Barra horizontal proporcional ao volume */}
              <div className="tp-mix-bar-track">
                <div
                  className="tp-mix-bar-fill tp-mix-bar-fill-indigo"
                  style={{ width: `${Math.min(100, Math.max(0, qtyShare))}%` }}
                />
              </div>

              <div className="tp-mix-sub-stats">
                <span>{formatNumber(item.distinctProducts)} modelos distintos</span>
                <span className="tp-bullet">•</span>
                <span>Receita: {formatCurrency(item.realizedRevenue)}</span>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
