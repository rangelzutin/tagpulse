import { Building2, ShoppingCart, HelpCircle, AlertOctagon } from "lucide-react";
import type { ProductChannelMixItem, CommercialChannel } from "../api/bi";
import {
  formatCurrency,
  formatNumber,
  formatPercent,
} from "../utils/formatters";

interface ProductChannelMixCardProps {
  channelMix: ProductChannelMixItem[];
  totalRevenue: number;
}

function getChannelConfig(channel: CommercialChannel) {
  switch (channel) {
    case "ATACADO":
      return {
        label: "Atacado",
        desc: "Pedidos e vendas diretas com CNPJ",
        badgeClass: "tp-channel-badge-atacado",
        icon: Building2,
        fillClass: "tp-channel-fill-atacado",
      };
    case "VAREJO":
      return {
        label: "Varejo",
        desc: "Vendas diretas com CPF / Consumidor",
        badgeClass: "tp-channel-badge-varejo",
        icon: ShoppingCart,
        fillClass: "tp-channel-fill-varejo",
      };
    case "CONFLITO":
      return {
        label: "Conflito",
        desc: "Evidências divergentes de canal",
        badgeClass: "tp-channel-badge-conflito",
        icon: AlertOctagon,
        fillClass: "tp-channel-fill-conflito",
      };
    case "INDETERMINADO":
    default:
      return {
        label: "Indeterminado",
        desc: "Sem documento ou evidência cadastral",
        badgeClass: "tp-channel-badge-indeterminado",
        icon: HelpCircle,
        fillClass: "tp-channel-fill-indeterminado",
      };
  }
}

export function ProductChannelMixCard({
  channelMix,
  totalRevenue,
}: ProductChannelMixCardProps) {
  if (!channelMix || channelMix.length === 0) {
    return (
      <section className="tp-card tp-channel-mix-card" aria-label="Mix por Canal">
        <div className="tp-card-header">
          <div>
            <h3 className="tp-card-title">Mix por canal</h3>
            <p className="tp-card-subtitle">
              Distribuição do faturamento e volume físico entre canais
            </p>
          </div>
        </div>
        <div className="tp-empty-message">
          Nenhum canal com movimentação no período selecionado.
        </div>
      </section>
    );
  }

  // Ordena por faturamento decrescente
  const sortedChannels = [...channelMix].sort(
    (a, b) => b.realizedRevenue - a.realizedRevenue,
  );

  return (
    <section className="tp-card tp-channel-mix-card" aria-label="Mix por Canal">
      <div className="tp-card-header">
        <div>
          <h3 className="tp-card-title">Mix por canal</h3>
          <p className="tp-card-subtitle">
            Classificação homologada por perfil de cliente e natureza da negociação
          </p>
        </div>
      </div>

      <div className="tp-channel-list">
        {sortedChannels.map((item) => {
          const config = getChannelConfig(item.channel);
          const Icon = config.icon;
          const share =
            totalRevenue > 0
              ? (item.realizedRevenue / totalRevenue) * 100
              : 0;

          return (
            <div key={item.channel} className="tp-channel-item">
              <div className="tp-channel-header-row">
                <div className="tp-channel-title-group">
                  <span className={`tp-channel-badge ${config.badgeClass}`}>
                    <Icon size={12} />
                    <span>{config.label}</span>
                  </span>
                  <span className="tp-channel-desc">{config.desc}</span>
                </div>
                <div className="tp-channel-values">
                  <span className="tp-channel-rev">
                    {formatCurrency(item.realizedRevenue)}
                  </span>
                  <span className="tp-channel-share">
                    {formatPercent(share)}
                  </span>
                </div>
              </div>

              {/* Barra de progresso */}
              <div className="tp-channel-bar-track">
                <div
                  className={`tp-channel-bar-fill ${config.fillClass}`}
                  style={{ width: `${Math.min(100, Math.max(0, share))}%` }}
                />
              </div>

              <div className="tp-channel-sub-info">
                <span>{formatNumber(item.quantity)} un vendidas</span>
                <span className="tp-bullet">•</span>
                <span>{formatNumber(item.distinctProducts)} SKUs distintos</span>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
