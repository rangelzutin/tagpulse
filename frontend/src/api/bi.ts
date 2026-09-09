export interface SalesOverviewPeriod {
  from: string;
  to: string;
}

export interface SalesOverviewSummary {
  sales: number;
  revenue: number;
  avgTicket: number;
  customers: number;
  salesWithoutCustomer: number;
}

export interface SalesOverviewMonthly {
  month: string;
  sales: number;
  revenue: number;
  avgTicket: number;
  customers: number;
}

export interface SalesOverviewResult {
  period: SalesOverviewPeriod;
  summary: SalesOverviewSummary;
  monthly: SalesOverviewMonthly[];
}

export async function fetchSalesOverview(
  from: string,
  to: string,
): Promise<SalesOverviewResult> {
  const rawBaseUrl = import.meta.env.VITE_API_URL || "";
  const baseUrl = rawBaseUrl.endsWith("/")
    ? rawBaseUrl.slice(0, -1)
    : rawBaseUrl;

  const url = `${baseUrl}/bi/sales/overview?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`;

  let response: Response;
  try {
    response = await fetch(url, {
      headers: {
        Accept: "application/json",
      },
    });
  } catch {
    throw new Error(
      "Não foi possível conectar ao servidor. Verifique se o serviço está ativo e tente novamente.",
    );
  }

  if (!response.ok) {
    if (response.status >= 500) {
      throw new Error(
        "Ocorreu uma instabilidade no servidor ao consultar os dados de vendas.",
      );
    }
    throw new Error(
      "Não foi possível carregar os dados para o período informado. Verifique as datas selecionadas.",
    );
  }

  try {
    const data = (await response.json()) as SalesOverviewResult;
    return data;
  } catch {
    throw new Error("Formato de resposta inesperado do servidor.");
  }
}
