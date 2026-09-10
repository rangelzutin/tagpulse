export function getLocalDateString(d: Date = new Date()): string {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function getDefaultPeriod(): { from: string; to: string } {
  const now = new Date();
  const year = now.getFullYear();
  return {
    from: `${year}-01-01`,
    to: getLocalDateString(now),
  };
}

export function formatCurrency(value: number): string {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(value);
}

export function formatNumber(value: number): string {
  return new Intl.NumberFormat("pt-BR").format(value);
}

const MONTH_NAMES = [
  "Jan",
  "Fev",
  "Mar",
  "Abr",
  "Mai",
  "Jun",
  "Jul",
  "Ago",
  "Set",
  "Out",
  "Nov",
  "Dez",
];

export function formatMonthLabel(monthKey: string): string {
  // Format: "YYYY-MM"
  const parts = monthKey.split("-");
  if (parts.length === 2) {
    const monthIndex = parseInt(parts[1], 10) - 1;
    const yearShort = parts[0].slice(-2);
    if (monthIndex >= 0 && monthIndex < 12) {
      return `${MONTH_NAMES[monthIndex]}/${yearShort}`;
    }
  }
  return monthKey;
}

export function formatFullMonthName(monthKey: string): string {
  const parts = monthKey.split("-");
  if (parts.length === 2) {
    const monthIndex = parseInt(parts[1], 10) - 1;
    const year = parts[0];
    const fullNames = [
      "Janeiro",
      "Fevereiro",
      "Março",
      "Abril",
      "Maio",
      "Junho",
      "Julho",
      "Agosto",
      "Setembro",
      "Outubro",
      "Novembro",
      "Dezembro",
    ];
    if (monthIndex >= 0 && monthIndex < 12) {
      return `${fullNames[monthIndex]} de ${year}`;
    }
  }
  return monthKey;
}

export function formatPercent(value: number, decimals = 1): string {
  if (typeof value !== "number" || Number.isNaN(value)) {
    return "0,0%";
  }
  return (
    new Intl.NumberFormat("pt-BR", {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    }).format(value) + "%"
  );
}

export function formatCompactCurrency(value: number): string {
  if (typeof value !== "number" || Number.isNaN(value) || value === 0) {
    return "R$ 0";
  }
  if (Math.abs(value) >= 1_000_000) {
    const formatted = (value / 1_000_000).toLocaleString("pt-BR", {
      maximumFractionDigits: 1,
    });
    return `R$ ${formatted}M`;
  }
  if (Math.abs(value) >= 1_000) {
    const formatted = (value / 1_000).toLocaleString("pt-BR", {
      maximumFractionDigits: 0,
    });
    return `R$ ${formatted}k`;
  }
  return formatCurrency(value);
}

export function parseIsoDate(isoDate: string): Date {
  const [y, m, d] = isoDate.split("-").map(Number);
  return new Date(y, m - 1, d);
}

export function formatDisplayDate(isoDate: string): string {
  if (!isoDate) return "";
  const parts = isoDate.split("-");
  if (parts.length === 3) {
    return `${parts[2]}/${parts[1]}/${parts[0]}`;
  }
  return isoDate;
}
