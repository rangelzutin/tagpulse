import { ArrowRight, Layers, Tag, Ruler, Building2, ShoppingCart, HelpCircle, AlertOctagon } from "lucide-react";
import type {
  ProductMixItem,
  ProductCategoryItem,
  ShapeSizeMixItem,
  ProductChannelMixItem,
  CommercialChannel,
} from "../api/bi";
import { formatCurrency, formatNumber, formatPercent } from "../utils/formatters";

interface ProductHighlightsCardProps {
  commercialLineMix?: ProductMixItem[];
  categories?: ProductCategoryItem[];
  shapeSizeMix?: ShapeSizeMixItem[];
  channelMix?: ProductChannelMixItem[];
  onViewMix: () => void;
}

function cleanShapeSize(size: string, label?: string): string {
  if (size === "OTHER" || label === "OTHER" || label === "Outros") {
    return "Outros";
  }
  if (size === "UNCLASSIFIED" || label === "UNCLASSIFIED" || label === "Não classificado") {
    return "Não classificado";
  }
  const clean = String(label || size || "").replace(/["“”'']/g, "").trim();
  return clean ? `${clean}"` : `${size}"`;
}

function getChannelLabel(channel: CommercialChannel): { label: string; icon: typeof Building2 } {
  switch (channel) {
    case "ATACADO":
      return { label: "Atacado", icon: Building2 };
    case "VAREJO":
      return { label: "Varejo", icon: ShoppingCart };
    case "CONFLITO":
      return { label: "Conflito", icon: AlertOctagon };
    case "INDETERMINADO":
    default:
      return { label: "Indeterminado", icon: HelpCircle };
  }
}

export function ProductHighlightsCard({
  commercialLineMix = [],
  categories = [],
  shapeSizeMix = [],
  channelMix = [],
  onViewMix,
}: ProductHighlightsCardProps) {
  // 1. Marca / Linha Líder
  const topBrand = [...commercialLineMix].sort(
    (a, b) => b.realizedRevenue - a.realizedRevenue,
  )[0];

  // 2. Categoria Líder
  const topCategory = [...categories].sort(
    (a, b) => b.realizedRevenue - a.realizedRevenue,
  )[0];

  // 3. Shape Líder (por volume físico)
  const topShape = [...shapeSizeMix].sort(
    (a, b) => b.realizedQuantity - a.realizedQuantity,
  )[0];

  // 4. Canal Líder
  const topChannel = [...channelMix].sort(
    (a, b) => b.realizedRevenue - a.realizedRevenue,
  )[0];

  const ChannelIcon = topChannel ? getChannelLabel(topChannel.channel).icon : Building2;
  const channelDisplayLabel = topChannel ? getChannelLabel(topChannel.channel).label : "—";

  return (
    <section className="tp-card tp-highlights-card" aria-label="Destaques do período">
      <div className="tp-card-header">
        <div>
          <h3 className="tp-card-title">Destaques do período</h3>
          <p className="tp-card-subtitle">
            Linhas, categorias, formatos e canais líderes em movimentação
          </p>
        </div>
        <button
          type="button"
          className="tp-btn-link-action"
          onClick={onViewMix}
          aria-label="Ver análise de Mix"
        >
          <span>Ver análise de Mix</span>
          <ArrowRight size={13} />
        </button>
      </div>

      <div className="tp-highlights-grid">
        {/* Destaque 1: Marca / Linha Líder */}
        <div className="tp-highlight-item">
          <div className="tp-highlight-badge">
            <Layers size={11} className="tp-mix-icon" />
            <span>Marca / Linha líder</span>
          </div>
          <div className="tp-highlight-title" title={topBrand?.label ?? "—"}>
            {topBrand?.label ?? "Sem dados"}
          </div>
          <div className="tp-highlight-metric">
            {topBrand ? `${formatPercent(topBrand.revenueShare ?? 0)} do faturamento` : "—"}
          </div>
          <div className="tp-highlight-sub">
            {topBrand ? (
              <>
                <span>{formatCurrency(topBrand.realizedRevenue)}</span>
                <span className="tp-bullet">•</span>
                <span>{formatNumber(topBrand.realizedQuantity)} un</span>
              </>
            ) : (
              <span>Nenhuma movimentação</span>
            )}
          </div>
        </div>

        {/* Destaque 2: Categoria Líder */}
        <div className="tp-highlight-item">
          <div className="tp-highlight-badge">
            <Tag size={11} className="tp-mix-icon" />
            <span>Categoria líder</span>
          </div>
          <div
            className="tp-highlight-title"
            title={topCategory?.label ?? topCategory?.category ?? "—"}
          >
            {topCategory?.label ?? topCategory?.category ?? "Sem dados"}
          </div>
          <div className="tp-highlight-metric">
            {topCategory
              ? `${formatPercent(topCategory.revenueShare ?? topCategory.shareOfRevenue ?? 0)} do faturamento`
              : "—"}
          </div>
          <div className="tp-highlight-sub">
            {topCategory ? (
              <>
                <span>{formatCurrency(topCategory.realizedRevenue)}</span>
                <span className="tp-bullet">•</span>
                <span>{formatNumber(topCategory.realizedQuantity ?? topCategory.quantity ?? 0)} un</span>
              </>
            ) : (
              <span>Nenhuma movimentação</span>
            )}
          </div>
        </div>

        {/* Destaque 3: Shape Líder */}
        <div className="tp-highlight-item">
          <div className="tp-highlight-badge">
            <Ruler size={11} className="tp-mix-icon" />
            <span>Shape líder</span>
          </div>
          <div
            className="tp-highlight-title"
            title={topShape ? cleanShapeSize(topShape.size, topShape.label) : "—"}
          >
            {topShape ? cleanShapeSize(topShape.size, topShape.label) : "Sem dados"}
          </div>
          <div className="tp-highlight-metric">
            {topShape
              ? `${formatPercent(topShape.quantityShare ?? 0)} do volume de shapes`
              : "—"}
          </div>
          <div className="tp-highlight-sub">
            {topShape ? (
              <>
                <span>{formatNumber(topShape.realizedQuantity)} un</span>
                <span className="tp-bullet">•</span>
                <span>{formatNumber(topShape.distinctProducts)} modelos</span>
              </>
            ) : (
              <span>Nenhuma movimentação</span>
            )}
          </div>
        </div>

        {/* Destaque 4: Canal Líder */}
        <div className="tp-highlight-item">
          <div className="tp-highlight-badge">
            <ChannelIcon size={11} className="tp-mix-icon" />
            <span>Canal líder</span>
          </div>
          <div className="tp-highlight-title" title={channelDisplayLabel}>
            {channelDisplayLabel}
          </div>
          <div className="tp-highlight-metric">
            {topChannel
              ? `${formatPercent(topChannel.revenueShare ?? 0)} do faturamento`
              : "—"}
          </div>
          <div className="tp-highlight-sub">
            {topChannel ? (
              <>
                <span>{formatCurrency(topChannel.realizedRevenue)}</span>
                <span className="tp-bullet">•</span>
                <span>{formatNumber(topChannel.realizedQuantity ?? topChannel.quantity ?? 0)} un</span>
              </>
            ) : (
              <span>Nenhuma movimentação</span>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
