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

export type SalesTrendGranularity = "daily" | "weekly" | "monthly";

export interface SalesTrendPoint {
  key: string;
  label: string;
  periodStart: string;
  periodEnd: string;
  revenue: number;
  sales: number;
  averageTicket: number;
  customers: number;
}

export interface SalesTrend {
  granularity: SalesTrendGranularity;
  points: SalesTrendPoint[];
}

export interface SalesOverviewResult {
  period: SalesOverviewPeriod;
  summary: SalesOverviewSummary;
  monthly: SalesOverviewMonthly[];
  trend: SalesTrend;
}

export interface BiDataRangeResult {
  firstRealizedDate: string | null;
  lastRealizedDate: string | null;
}

export async function fetchDataRange(): Promise<BiDataRangeResult> {
  const rawBaseUrl = import.meta.env.VITE_API_URL || "";
  const baseUrl = rawBaseUrl.endsWith("/")
    ? rawBaseUrl.slice(0, -1)
    : rawBaseUrl;

  const url = `${baseUrl}/bi/data-range`;

  let response: Response;
  try {
    response = await fetch(url, {
      headers: {
        Accept: "application/json",
      },
    });
  } catch {
    throw new Error(
      "Não foi possível conectar ao servidor para obter o intervalo da base.",
    );
  }

  if (!response.ok) {
    throw new Error("Erro ao obter o intervalo da base de dados.");
  }

  return (await response.json()) as BiDataRangeResult;
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

export interface CustomerOverviewPeriod {
  from: string;
  to: string;
  asOfDate: string;
}

export interface CustomerOverviewMetrics {
  buyingCustomers: number;
  newCustomers: number;
  returningCustomers: number;
  recurrenceRate: number;
}

export interface CustomerRankingItem {
  customerId: string;
  code: string | null;
  displayName: string;
  revenue: number;
  purchaseCount: number;
  averageTicket: number;
  revenueSharePercent: number;
  cumulativeRevenueSharePercent: number;
}

export interface CustomerLifetimeMetrics {
  customers: number;
  singlePurchaseCustomers: number;
  repeatCustomers: number;
  repeatRate: number;
}

export interface CustomerRecencySegment {
  key:
    | "0-30"
    | "31-60"
    | "61-90"
    | "91-180"
    | "181-365"
    | "366-730"
    | "731+";
  label: string;
  customerCount: number;
  percentage: number;
}

export interface CustomerOverviewResult {
  period: CustomerOverviewPeriod;
  customers: CustomerOverviewMetrics;
  lifetime: CustomerLifetimeMetrics;
  ranking: CustomerRankingItem[];
  recency: CustomerRecencySegment[];
}

export async function fetchCustomerOverview(
  from: string,
  to: string,
): Promise<CustomerOverviewResult> {
  const rawBaseUrl = import.meta.env.VITE_API_URL || "";
  const baseUrl = rawBaseUrl.endsWith("/")
    ? rawBaseUrl.slice(0, -1)
    : rawBaseUrl;

  const url = `${baseUrl}/bi/customers/overview?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`;

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
        "Ocorreu uma instabilidade no servidor ao consultar os dados de clientes.",
      );
    }
    throw new Error(
      "Não foi possível carregar os dados de clientes para o período informado. Verifique as datas selecionadas.",
    );
  }

  try {
    const data = (await response.json()) as CustomerOverviewResult;
    return data;
  } catch {
    throw new Error("Formato de resposta inesperado do servidor.");
  }
}

export type CustomerSegmentType =
  | "buyers"
  | "new"
  | "returning"
  | "historical"
  | "single"
  | "repeat";

export type CustomerSegmentSort =
  | "revenue_desc"
  | "purchases_desc"
  | "last_purchase_desc"
  | "name_asc";

export interface CustomerSegmentItem {
  customerId: string;
  code: string | null;
  legalName: string | null;
  tradeName: string | null;
  displayName: string;
  cpfCnpj: string | null;
  purchasesInPeriod: number;
  revenueInPeriod: number;
  averageTicketInPeriod: number;
  firstPurchaseDate: string | null;
  lastPurchaseDate: string | null;
  lifetimePurchaseCount: number;
  lifetimeRevenue: number;
  daysSinceLastPurchase: number | null;
}

export interface CustomerSegmentResult {
  segment: CustomerSegmentType;
  period: {
    from: string;
    to: string;
  };
  pagination: {
    page: number;
    pageSize: number;
    totalRecords: number;
    totalPages: number;
  };
  summary: {
    segmentCustomerCount: number;
    segmentTotalRevenueInPeriod: number;
  };
  customers: CustomerSegmentItem[];
}

export interface FetchCustomerSegmentParams {
  from: string;
  to: string;
  segment: CustomerSegmentType;
  page?: number;
  pageSize?: number;
  search?: string;
  sort?: CustomerSegmentSort;
}

export async function fetchCustomerSegment(
  params: FetchCustomerSegmentParams,
): Promise<CustomerSegmentResult> {
  const rawBaseUrl = import.meta.env.VITE_API_URL || "";
  const baseUrl = rawBaseUrl.endsWith("/")
    ? rawBaseUrl.slice(0, -1)
    : rawBaseUrl;

  const searchParams = new URLSearchParams({
    from: params.from,
    to: params.to,
    segment: params.segment,
    page: String(params.page ?? 1),
    pageSize: String(params.pageSize ?? 20),
  });

  if (params.search && params.search.trim()) {
    searchParams.set("search", params.search.trim());
  }
  if (params.sort) {
    searchParams.set("sort", params.sort);
  }

  const url = `${baseUrl}/bi/customers/segment?${searchParams.toString()}`;

  let response: Response;
  try {
    response = await fetch(url, {
      headers: {
        Accept: "application/json",
      },
    });
  } catch {
    throw new Error(
      "Não foi possível conectar ao servidor para carregar o segmento.",
    );
  }

  if (!response.ok) {
    throw new Error("Erro ao carregar a lista de clientes do segmento.");
  }

  return (await response.json()) as CustomerSegmentResult;
}

export interface CustomerDetailOverviewResult {
  identity: {
    customerId: string;
    sourceId: string;
    code: string | null;
    legalName: string | null;
    tradeName: string | null;
    displayName: string;
    cpfCnpj: string | null;
    city: string | null;
    state: string | null;
  };
  classification: {
    isNewInPeriod: boolean;
    isReturningInPeriod: boolean;
    hasPeriodActivity: boolean;
  };
  period: {
    from: string;
    to: string;
    revenue: number;
    purchaseCount: number;
    averageTicket: number;
    revenueSharePercent: number;
  };
  lifetime: {
    asOfDate: string;
    firstPurchaseDate: string | null;
    lastPurchaseDate: string | null;
    purchaseCount: number;
    revenue: number;
    averageTicket: number;
    daysSinceLastPurchase: number | null;
  };
}

export async function fetchCustomerDetailOverview(
  customerId: string,
  from: string,
  to: string,
): Promise<CustomerDetailOverviewResult> {
  const rawBaseUrl = import.meta.env.VITE_API_URL || "";
  const baseUrl = rawBaseUrl.endsWith("/")
    ? rawBaseUrl.slice(0, -1)
    : rawBaseUrl;

  const url = `${baseUrl}/bi/customers/${encodeURIComponent(customerId)}/overview?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`;

  let response: Response;
  try {
    response = await fetch(url, {
      headers: {
        Accept: "application/json",
      },
    });
  } catch {
    throw new Error(
      "Não foi possível conectar ao servidor para carregar o detalhe do cliente.",
    );
  }

  if (!response.ok) {
    if (response.status === 404) {
      throw new Error("Cliente não encontrado.");
    }
    throw new Error("Erro ao consultar os dados cadastrais do cliente.");
  }

  return (await response.json()) as CustomerDetailOverviewResult;
}

export type CustomerSalesScope = "period" | "history";

export interface CustomerSaleDocument {
  id: string;
  docType: string;
  sourceId: string;
  status: string | null;
  netAmount: number | null;
  realizedDate: string | null;
  sourceConfirmedAt: string | null;
  sourceEmissaoAt: string | null;
  isRealizedDoc: boolean;
}

export interface CustomerSaleItem {
  saleId: string;
  anchorType: string;
  anchorSourceId: string;
  hasPedido: boolean;
  pedidoSourceId: string | null;
  commercialDate: string | null;
  saleRealizedDate: string;
  totalRealizedAmount: number;
  realizedDocCount: number;
  documents: CustomerSaleDocument[];
}

export interface CustomerSalesResult {
  customerId: string;
  pagination: {
    page: number;
    pageSize: number;
    totalRecords: number;
    totalPages: number;
  };
  sales: CustomerSaleItem[];
}

export interface FetchCustomerSalesParams {
  from: string;
  to: string;
  scope?: CustomerSalesScope;
  page?: number;
  pageSize?: number;
}

export async function fetchCustomerSales(
  customerId: string,
  params: FetchCustomerSalesParams,
): Promise<CustomerSalesResult> {
  const rawBaseUrl = import.meta.env.VITE_API_URL || "";
  const baseUrl = rawBaseUrl.endsWith("/")
    ? rawBaseUrl.slice(0, -1)
    : rawBaseUrl;

  const searchParams = new URLSearchParams({
    from: params.from,
    to: params.to,
    scope: params.scope ?? "history",
    page: String(params.page ?? 1),
    pageSize: String(params.pageSize ?? 20),
  });

  const url = `${baseUrl}/bi/customers/${encodeURIComponent(customerId)}/sales?${searchParams.toString()}`;

  let response: Response;
  try {
    response = await fetch(url, {
      headers: {
        Accept: "application/json",
      },
    });
  } catch {
    throw new Error(
      "Não foi possível conectar ao servidor para carregar as negociações.",
    );
  }

  if (!response.ok) {
    throw new Error("Erro ao carregar o histórico de negociações do cliente.");
  }

  return (await response.json()) as CustomerSalesResult;
}
