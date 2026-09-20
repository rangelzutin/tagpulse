import { useState, useEffect, useCallback, useRef } from "react";
import {
  fetchSalesOverview,
  fetchCustomerOverview,
  fetchProductsOverview,
  fetchInventoryOverview,
  fetchProfitabilityOverview,
  fetchDecisionsOverview,
  fetchCategoryTree,
  fetchDataRange,
  type SalesOverviewResult,
  type CustomerOverviewResult,
  type ProductsOverviewResult,
  type InventoryOverviewResult,
  type ProfitabilityOverviewResult,
  type DecisionsOverviewResult,
  type DecisionsWindowDays,
  type CommercialChannel,
  type CategoryTreeNode,
  type InventoryWindowDays,
  type BiDataRangeResult,
  type CustomerDocumentType,
} from "./api/bi";
import { AppShell } from "./components/AppShell";
import { Header } from "./components/Header";
import { PeriodFilter, type PeriodMode } from "./components/PeriodFilter";
import { KpiGrid } from "./components/KpiGrid";
import { MonthlyChart } from "./components/MonthlyChart";
import { CustomerKpiGrid } from "./components/CustomerKpiGrid";
import { CustomerRankingCard } from "./components/CustomerRankingCard";
import { RecencyDistributionCard } from "./components/RecencyDistributionCard";
import { CustomerSegmentDrawer } from "./components/CustomerSegmentDrawer";
import { CustomerDocumentTypeSelector } from "./components/CustomerDocumentTypeSelector";
import { ProductsView } from "./components/ProductsView";
import { InventoryView } from "./components/InventoryView";
import { ProfitabilityView } from "./components/ProfitabilityView";
import { DecisionsView } from "./components/DecisionsView";
import { InventoryWindowSelector } from "./components/InventoryWindowSelector";
import type { CustomerRecencyBucket, CustomerSegmentType } from "./api/bi";
import type { RateContextData } from "./components/CustomerSegmentView";
import { AlertCircle, RefreshCw, Users } from "lucide-react";
import { getDefaultPeriod, formatDateBr } from "./utils/formatters";

export function App() {
  const [activeNav, setActiveNav] = useState<
    "commercial" | "products" | "inventory" | "profitability" | "decisions"
  >("commercial");
  const [periodMode, setPeriodMode] = useState<PeriodMode>("range");
  const [dataRange, setDataRange] = useState<BiDataRangeResult | null>(null);

  const [currentPeriod, setCurrentPeriod] = useState(() => getDefaultPeriod());

  // Sales State
  const [salesData, setSalesData] = useState<SalesOverviewResult | null>(null);
  const [isSalesLoading, setIsSalesLoading] = useState(true);
  const [salesError, setSalesError] = useState<string | null>(null);

  // Customer State
  const [customerData, setCustomerData] =
    useState<CustomerOverviewResult | null>(null);
  const [isCustomerLoading, setIsCustomerLoading] = useState(true);
  const [customerError, setCustomerError] = useState<string | null>(null);
  const [customerDocumentType, setCustomerDocumentType] =
    useState<CustomerDocumentType>("all");

  // Products State (Lazy loaded)
  const [productsData, setProductsData] =
    useState<ProductsOverviewResult | null>(null);
  const [isProductsLoading, setIsProductsLoading] = useState(false);
  const [productsError, setProductsError] = useState<string | null>(null);
  const [productsLoadedPeriod, setProductsLoadedPeriod] = useState<string | null>(
    null,
  );

  // Inventory State (Lazy loaded)
  const [inventoryData, setInventoryData] =
    useState<InventoryOverviewResult | null>(null);
  const [isInventoryLoading, setIsInventoryLoading] = useState(false);
  const [isInventoryRefreshing, setIsInventoryRefreshing] = useState(false);
  const [inventoryError, setInventoryError] = useState<string | null>(null);
  const [inventoryWindowDays, setInventoryWindowDays] =
    useState<InventoryWindowDays>(90);
  const [inventoryLoadedWindow, setInventoryLoadedWindow] =
    useState<InventoryWindowDays | null>(null);
  const inventoryRequestSeq = useRef(0);
  const inventoryAbortControllerRef = useRef<AbortController | null>(null);

  // Profitability State (Lazy loaded, protected against race conditions)
  const [profitabilityData, setProfitabilityData] =
    useState<ProfitabilityOverviewResult | null>(null);
  const [isProfitabilityLoading, setIsProfitabilityLoading] = useState(false);
  const [isProfitabilityRefreshing, setIsProfitabilityRefreshing] =
    useState(false);
  const [profitabilityError, setProfitabilityError] = useState<string | null>(
    null,
  );
  const [selectedProfitabilityChannel, setSelectedProfitabilityChannel] =
    useState<CommercialChannel | null>(null);
  const [
    selectedProfitabilityCategorySourceId,
    setSelectedProfitabilityCategorySourceId,
  ] = useState<string | null>(null);
  const [categoryTree, setCategoryTree] = useState<CategoryTreeNode[]>([]);
  const profitabilityRequestSeq = useRef(0);
  const profitabilityAbortControllerRef = useRef<AbortController | null>(null);

  // Decisions State (Lazy loaded, protected against race conditions)
  const [decisionsData, setDecisionsData] =
    useState<DecisionsOverviewResult | null>(null);
  const [isDecisionsLoading, setIsDecisionsLoading] = useState(false);
  const [isDecisionsRefreshing, setIsDecisionsRefreshing] = useState(false);
  const [decisionsError, setDecisionsError] = useState<string | null>(null);
  const [decisionsWindowDays, setDecisionsWindowDays] =
    useState<DecisionsWindowDays>(90);
  const [
    decisionsSelectedCategorySourceId,
    setDecisionsSelectedCategorySourceId,
  ] = useState<string | null>(null);
  const decisionsRequestSeq = useRef(0);
  const decisionsAbortControllerRef = useRef<AbortController | null>(null);

  // Drawer State
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [drawerMode, setDrawerMode] = useState<"segment" | "detail">("segment");
  const [selectedSegment, setSelectedSegment] =
    useState<CustomerSegmentType | null>(null);
  const [selectedRecencyBucket, setSelectedRecencyBucket] =
    useState<CustomerRecencyBucket | null>(null);
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(
    null,
  );
  const [drawerRateContext, setDrawerRateContext] =
    useState<RateContextData | null>(null);
  const [canGoBackToSegment, setCanGoBackToSegment] = useState(false);

  // Global updating state for header
  const [isUpdating, setIsUpdating] = useState(false);

  // Fetch Sales Overview independently
  const loadSalesOverview = useCallback(
    async (from: string, to: string, isBackground = false) => {
      setSalesError(null);
      if (!isBackground) {
        setIsSalesLoading(true);
      }

      try {
        const result = await fetchSalesOverview(from, to);
        setSalesData(result);
      } catch (err) {
        const message =
          err instanceof Error
            ? err.message
            : "Não foi possível carregar os dados de vendas.";
        setSalesError(message);
      } finally {
        setIsSalesLoading(false);
      }
    },
    [],
  );

  // Fetch Customer Overview independently
  const loadCustomerOverview = useCallback(
    async (
      from: string,
      to: string,
      isBackground = false,
      docType: CustomerDocumentType = customerDocumentType,
    ) => {
      setCustomerError(null);
      if (!isBackground) {
        setIsCustomerLoading(true);
      }

      try {
        const result = await fetchCustomerOverview(from, to, docType);
        setCustomerData(result);
      } catch (err) {
        const message =
          err instanceof Error
            ? err.message
            : "Não foi possível carregar a inteligência de clientes.";
        setCustomerError(message);
      } finally {
        setIsCustomerLoading(false);
      }
    },
    [customerDocumentType],
  );

  // Fetch Products Overview independently (lazy loaded)
  const loadProductsOverview = useCallback(
    async (from: string, to: string, isBackground = false) => {
      setProductsError(null);
      if (!isBackground) {
        setIsProductsLoading(true);
      }

      try {
        const result = await fetchProductsOverview(from, to);
        setProductsData(result);
        setProductsLoadedPeriod(`${from}:${to}`);
      } catch (err) {
        const message =
          err instanceof Error
            ? err.message
            : "Não foi possível carregar os indicadores de produtos.";
        setProductsError(message);
      } finally {
        setIsProductsLoading(false);
      }
    },
    [],
  );

  // Fetch Inventory Overview independently (lazy loaded, protected against race conditions)
  const loadInventoryOverview = useCallback(
    async (windowDays: InventoryWindowDays, isBackground = false) => {
      if (inventoryAbortControllerRef.current) {
        inventoryAbortControllerRef.current.abort();
      }
      const controller = new AbortController();
      inventoryAbortControllerRef.current = controller;

      const currentSeq = ++inventoryRequestSeq.current;

      setInventoryError(null);
      if (!isBackground) {
        setIsInventoryLoading(true);
      } else {
        setIsInventoryRefreshing(true);
      }

      try {
        const result = await fetchInventoryOverview(
          windowDays,
          controller.signal,
        );
        if (currentSeq === inventoryRequestSeq.current) {
          setInventoryData(result);
          setInventoryLoadedWindow(windowDays);
        }
      } catch (err: unknown) {
        if (err instanceof DOMException && err.name === "AbortError") {
          return;
        }
        if (currentSeq === inventoryRequestSeq.current) {
          const message =
            err instanceof Error
              ? err.message
              : "Não foi possível carregar os dados de Estoque & Giro.";
          setInventoryError(message);
        }
      } finally {
        if (currentSeq === inventoryRequestSeq.current) {
          setIsInventoryLoading(false);
          setIsInventoryRefreshing(false);
        }
      }
    },
    [],
  );

  // Fetch Profitability Overview independently (lazy loaded, protected against race conditions)
  const loadProfitabilityOverview = useCallback(
    async (
      from: string,
      to: string,
      channel: CommercialChannel | null = selectedProfitabilityChannel,
      categorySourceId: string | null = selectedProfitabilityCategorySourceId,
      isBackground = false,
    ) => {
      if (profitabilityAbortControllerRef.current) {
        profitabilityAbortControllerRef.current.abort();
      }
      const controller = new AbortController();
      profitabilityAbortControllerRef.current = controller;

      const currentSeq = ++profitabilityRequestSeq.current;

      setProfitabilityError(null);
      if (!isBackground) {
        setIsProfitabilityLoading(true);
      } else {
        setIsProfitabilityRefreshing(true);
      }

      try {
        const result = await fetchProfitabilityOverview({
          from,
          to,
          channel,
          categorySourceId,
          signal: controller.signal,
        });
        if (currentSeq === profitabilityRequestSeq.current) {
          setProfitabilityData(result);
        }
      } catch (err: unknown) {
        if (err instanceof DOMException && err.name === "AbortError") {
          return;
        }
        if (currentSeq === profitabilityRequestSeq.current) {
          const message =
            err instanceof Error
              ? err.message
              : "Não foi possível carregar a inteligência de rentabilidade.";
          setProfitabilityError(message);
        }
      } finally {
        if (currentSeq === profitabilityRequestSeq.current) {
          setIsProfitabilityLoading(false);
          setIsProfitabilityRefreshing(false);
        }
      }
    },
    [selectedProfitabilityChannel, selectedProfitabilityCategorySourceId],
  );

  // Fetch Decisions Overview independently (lazy loaded, protected against race conditions)
  const loadDecisionsOverview = useCallback(
    async (
      windowDays: DecisionsWindowDays = decisionsWindowDays,
      categorySourceId: string | null = decisionsSelectedCategorySourceId,
      isBackground = false,
    ) => {
      if (decisionsAbortControllerRef.current) {
        decisionsAbortControllerRef.current.abort();
      }
      const controller = new AbortController();
      decisionsAbortControllerRef.current = controller;

      const currentSeq = ++decisionsRequestSeq.current;

      setDecisionsError(null);
      if (!isBackground) {
        setIsDecisionsLoading(true);
      } else {
        setIsDecisionsRefreshing(true);
      }

      try {
        const result = await fetchDecisionsOverview({
          windowDays,
          categorySourceId,
          signal: controller.signal,
        });
        if (currentSeq === decisionsRequestSeq.current) {
          setDecisionsData(result);
        }
      } catch (err: unknown) {
        if (err instanceof DOMException && err.name === "AbortError") {
          return;
        }
        if (currentSeq === decisionsRequestSeq.current) {
          const message =
            err instanceof Error
              ? err.message
              : "Não foi possível carregar a Central de Decisões.";
          setDecisionsError(message);
        }
      } finally {
        if (currentSeq === decisionsRequestSeq.current) {
          setIsDecisionsLoading(false);
          setIsDecisionsRefreshing(false);
        }
      }
    },
    [decisionsWindowDays, decisionsSelectedCategorySourceId],
  );

  // Orchestrate commercial endpoints concurrently
  const loadCommercialData = useCallback(
    async (
      from: string,
      to: string,
      docType: CustomerDocumentType = customerDocumentType,
    ) => {
      const hasAnyData = Boolean(salesData || customerData);
      if (hasAnyData) {
        setIsUpdating(true);
      }

      await Promise.allSettled([
        loadSalesOverview(from, to, hasAnyData),
        loadCustomerOverview(from, to, hasAnyData, docType),
      ]);

      setIsUpdating(false);
    },
    [
      loadSalesOverview,
      loadCustomerOverview,
      salesData,
      customerData,
      customerDocumentType,
    ],
  );

  const handleCustomerDocumentTypeChange = (
    newDocType: CustomerDocumentType,
  ) => {
    if (newDocType === customerDocumentType) return;
    if (isDrawerOpen) {
      setIsDrawerOpen(false);
    }
    setCustomerDocumentType(newDocType);
    loadCustomerOverview(
      currentPeriod.from,
      currentPeriod.to,
      Boolean(customerData),
      newDocType,
    );
  };

  const handleSelectNav = (
    nav: "commercial" | "products" | "inventory" | "profitability" | "decisions",
  ) => {
    setActiveNav(nav);
    if (nav === "products") {
      const periodKey = `${currentPeriod.from}:${currentPeriod.to}`;
      if (productsLoadedPeriod !== periodKey && !isProductsLoading) {
        void loadProductsOverview(
          currentPeriod.from,
          currentPeriod.to,
          Boolean(productsData),
        );
      }
    } else if (nav === "inventory") {
      if (inventoryLoadedWindow !== inventoryWindowDays && !isInventoryLoading) {
        void loadInventoryOverview(
          inventoryWindowDays,
          Boolean(inventoryData),
        );
      }
    } else if (nav === "profitability") {
      if (!profitabilityData && !isProfitabilityLoading) {
        void loadProfitabilityOverview(
          currentPeriod.from,
          currentPeriod.to,
          selectedProfitabilityChannel,
          selectedProfitabilityCategorySourceId,
          false,
        );
      }
    } else if (nav === "decisions") {
      if (!decisionsData && !isDecisionsLoading) {
        void loadDecisionsOverview(
          decisionsWindowDays,
          decisionsSelectedCategorySourceId,
          false,
        );
      }
    }
  };

  const handleInventoryWindowChange = (newWindow: InventoryWindowDays) => {
    if (newWindow === inventoryWindowDays) return;
    setInventoryWindowDays(newWindow);
    void loadInventoryOverview(newWindow, Boolean(inventoryData));
  };

  const handleSyncSuccess = useCallback(() => {
    fetchDataRange()
      .then((res) => {
        setDataRange(res);
      })
      .catch(() => {});

    if (activeNav === "commercial") {
      setProductsLoadedPeriod(null);
      setInventoryLoadedWindow(null);
      void loadCommercialData(currentPeriod.from, currentPeriod.to);
    } else if (activeNav === "products") {
      setInventoryLoadedWindow(null);
      void loadProductsOverview(
        currentPeriod.from,
        currentPeriod.to,
        Boolean(productsData),
      );
    } else if (activeNav === "inventory") {
      setProductsLoadedPeriod(null);
      void loadInventoryOverview(
        inventoryWindowDays,
        Boolean(inventoryData),
      );
    } else if (activeNav === "profitability") {
      setProductsLoadedPeriod(null);
      setInventoryLoadedWindow(null);
      void loadProfitabilityOverview(
        currentPeriod.from,
        currentPeriod.to,
        selectedProfitabilityChannel,
        selectedProfitabilityCategorySourceId,
        Boolean(profitabilityData),
      );
    } else if (activeNav === "decisions") {
      setProductsLoadedPeriod(null);
      setInventoryLoadedWindow(null);
      void loadDecisionsOverview(
        decisionsWindowDays,
        decisionsSelectedCategorySourceId,
        Boolean(decisionsData),
      );
    }
  }, [
    activeNav,
    currentPeriod.from,
    currentPeriod.to,
    decisionsData,
    decisionsSelectedCategorySourceId,
    decisionsWindowDays,
    inventoryData,
    inventoryWindowDays,
    loadCommercialData,
    loadDecisionsOverview,
    loadInventoryOverview,
    loadProductsOverview,
    loadProfitabilityOverview,
    productsData,
    profitabilityData,
    selectedProfitabilityChannel,
    selectedProfitabilityCategorySourceId,
  ]);

  // Carrega a árvore de categorias na montagem inicial
  useEffect(() => {
    let isCancelled = false;
    async function loadTree() {
      try {
        const res = await fetchCategoryTree();
        if (!isCancelled) {
          setCategoryTree(res.categories);
        }
      } catch {
        // Falha não-bloqueante na árvore
      }
    }
    loadTree();
    return () => {
      isCancelled = true;
    };
  }, []);

  // Cleanup de requisições abortadas ao desmontar
  useEffect(() => {
    return () => {
      if (inventoryAbortControllerRef.current) {
        inventoryAbortControllerRef.current.abort();
      }
      if (profitabilityAbortControllerRef.current) {
        profitabilityAbortControllerRef.current.abort();
      }
      if (decisionsAbortControllerRef.current) {
        decisionsAbortControllerRef.current.abort();
      }
    };
  }, []);

  // Initial load: apenas comercial
  useEffect(() => {
    fetchDataRange()
      .then((res) => {
        setDataRange(res);
      })
      .catch((err) => {
        console.error("Falha ao consultar limites da base de dados:", err);
      });

    void loadCommercialData(currentPeriod.from, currentPeriod.to);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleApplyFilter = (from: string, to: string, mode: PeriodMode) => {
    if (
      from === currentPeriod.from &&
      to === currentPeriod.to &&
      mode === periodMode
    ) {
      return;
    }
    setPeriodMode(mode);
    setCurrentPeriod({ from, to });
    setIsUpdating(true);

    if (activeNav === "commercial") {
      setProductsLoadedPeriod(null);
      Promise.allSettled([
        loadSalesOverview(from, to, Boolean(salesData)),
        loadCustomerOverview(
          from,
          to,
          Boolean(customerData),
          customerDocumentType,
        ),
      ]).finally(() => {
        setIsUpdating(false);
      });
    } else if (activeNav === "products") {
      Promise.allSettled([
        loadProductsOverview(from, to, Boolean(productsData)),
      ]).finally(() => {
        setIsUpdating(false);
      });
    } else if (activeNav === "profitability") {
      Promise.allSettled([
        loadProfitabilityOverview(
          from,
          to,
          selectedProfitabilityChannel,
          selectedProfitabilityCategorySourceId,
          Boolean(profitabilityData),
        ),
      ]).finally(() => {
        setIsUpdating(false);
      });
    }
  };

  const handleRetrySales = () => {
    void loadSalesOverview(currentPeriod.from, currentPeriod.to, false);
  };

  const handleRetryCustomers = () => {
    void loadCustomerOverview(
      currentPeriod.from,
      currentPeriod.to,
      false,
      customerDocumentType,
    );
  };

  const handleRetryProducts = () => {
    void loadProductsOverview(currentPeriod.from, currentPeriod.to, false);
  };

  const handleRetryInventory = () => {
    void loadInventoryOverview(inventoryWindowDays, false);
  };

  const handleRetryProfitability = () => {
    void loadProfitabilityOverview(
      currentPeriod.from,
      currentPeriod.to,
      selectedProfitabilityChannel,
      selectedProfitabilityCategorySourceId,
      false,
    );
  };

  const handleProfitabilityChannelChange = (
    channel: CommercialChannel | null,
  ) => {
    setSelectedProfitabilityChannel(channel);
    void loadProfitabilityOverview(
      currentPeriod.from,
      currentPeriod.to,
      channel,
      selectedProfitabilityCategorySourceId,
      Boolean(profitabilityData),
    );
  };

  const handleProfitabilityCategoryChange = (
    categorySourceId: string | null,
  ) => {
    setSelectedProfitabilityCategorySourceId(categorySourceId);
    void loadProfitabilityOverview(
      currentPeriod.from,
      currentPeriod.to,
      selectedProfitabilityChannel,
      categorySourceId,
      Boolean(profitabilityData),
    );
  };

  const handleDecisionsWindowChange = (newWindow: DecisionsWindowDays) => {
    if (newWindow === decisionsWindowDays) return;
    setDecisionsWindowDays(newWindow);
    void loadDecisionsOverview(
      newWindow,
      decisionsSelectedCategorySourceId,
      Boolean(decisionsData),
    );
  };

  const handleDecisionsCategoryChange = (
    categorySourceId: string | null,
  ) => {
    setDecisionsSelectedCategorySourceId(categorySourceId);
    void loadDecisionsOverview(
      decisionsWindowDays,
      categorySourceId,
      Boolean(decisionsData),
    );
  };

  const handleRetryDecisions = () => {
    void loadDecisionsOverview(
      decisionsWindowDays,
      decisionsSelectedCategorySourceId,
      false,
    );
  };

  const handleOpenSegmentDrawer = (
    segment: CustomerSegmentType,
    rateContext?: RateContextData | null,
    recencyBucket?: CustomerRecencyBucket | null,
  ) => {
    setSelectedSegment(segment);
    setSelectedRecencyBucket(recencyBucket ?? null);
    setDrawerRateContext(rateContext ?? null);
    setSelectedCustomerId(null);
    setDrawerMode("segment");
    setCanGoBackToSegment(false);
    setIsDrawerOpen(true);
  };

  const handleOpenCustomerDetail = (customerId: string) => {
    setSelectedCustomerId(customerId);
    setDrawerMode("detail");
    setCanGoBackToSegment(false);
    setIsDrawerOpen(true);
  };

  const handleCloseDrawer = () => {
    setIsDrawerOpen(false);
  };

  const isAnyLoading =
    isSalesLoading ||
    isCustomerLoading ||
    isProductsLoading ||
    isInventoryLoading ||
    isProfitabilityLoading ||
    isDecisionsLoading ||
    isUpdating;

  return (
    <AppShell
      activeNav={activeNav}
      onSelectNav={handleSelectNav}
      onSyncSuccess={handleSyncSuccess}
    >
      <main className="tp-dashboard-main">
        {/* Header with integrated Period Filter or Inventory Window Selector */}
        <Header
          title={
            activeNav === "inventory"
              ? "Estoque & Giro"
              : activeNav === "products"
                ? "Produtos"
                : activeNav === "profitability"
                  ? "Rentabilidade"
                  : activeNav === "decisions"
                    ? "Decisões"
                    : "Performance Comercial"
          }
          subtitle={
            activeNav === "inventory"
              ? "Estoque atual cruzado com a velocidade recente de saída"
              : activeNav === "products"
                ? "Mix, volume e desempenho dos produtos realizados no período"
                : activeNav === "profitability"
                  ? "Rentabilidade estimada ao custo atual de catálogo TagPlus"
                  : activeNav === "decisions"
                    ? "Cruzamento operacional de vendas recentes, estoque atual e rentabilidade estimada"
                    : "Análise operacional e comercial da Nineclouds com base nas vendas realizadas e no comportamento da base de clientes."
          }
          badge={
            activeNav === "decisions" && decisionsData?.meta.asOfDate
              ? `Posição em ${formatDateBr(decisionsData.meta.asOfDate)}`
              : activeNav === "inventory" && inventoryData?.asOfDate
                ? `Posição em ${formatDateBr(inventoryData.asOfDate)}`
                : undefined
          }
          isUpdating={
            isUpdating ||
            isInventoryRefreshing ||
            isProfitabilityRefreshing ||
            isDecisionsRefreshing
          }
        >
          {activeNav === "inventory" ? (
            <InventoryWindowSelector
              value={inventoryWindowDays}
              onChange={handleInventoryWindowChange}
              disabled={isInventoryLoading || isInventoryRefreshing}
            />
          ) : activeNav === "profitability" || activeNav === "decisions" ? null : (
            <PeriodFilter
              initialFrom={currentPeriod.from}
              initialTo={currentPeriod.to}
              periodMode={periodMode}
              minDate={dataRange?.firstRealizedDate}
              isLoading={isAnyLoading}
              onApply={handleApplyFilter}
            />
          )}
        </Header>

        {activeNav === "inventory" ? (
          <InventoryView
            data={inventoryData}
            isLoading={isInventoryLoading}
            isRefreshing={isInventoryRefreshing}
            error={inventoryError}
            onRetry={handleRetryInventory}
          />
        ) : activeNav === "products" ? (
          <ProductsView
            data={productsData}
            isLoading={isProductsLoading}
            isRefreshing={isUpdating}
            error={productsError}
            onRetry={handleRetryProducts}
          />
        ) : activeNav === "profitability" ? (
          <ProfitabilityView
            data={profitabilityData}
            isLoading={isProfitabilityLoading}
            isRefreshing={isProfitabilityRefreshing}
            error={profitabilityError}
            onRetry={handleRetryProfitability}
            selectedChannel={selectedProfitabilityChannel}
            onSelectChannel={handleProfitabilityChannelChange}
            selectedCategorySourceId={selectedProfitabilityCategorySourceId}
            onSelectCategorySourceId={handleProfitabilityCategoryChange}
            categoryTree={categoryTree}
          />
        ) : activeNav === "decisions" ? (
          <DecisionsView
            data={decisionsData}
            isLoading={isDecisionsLoading}
            isRefreshing={isDecisionsRefreshing}
            error={decisionsError}
            onRetry={handleRetryDecisions}
            windowDays={decisionsWindowDays}
            onSelectWindowDays={handleDecisionsWindowChange}
            selectedCategorySourceId={decisionsSelectedCategorySourceId}
            onSelectCategorySourceId={handleDecisionsCategoryChange}
            categoryTree={categoryTree}
          />
        ) : (
          <>
            {/* =======================================================
                SEÇÃO 1: PERFORMANCE COMERCIAL (SALES OVERVIEW)
                ======================================================= */}
            <section
              className="tp-dashboard-section"
              aria-label="Performance Comercial"
            >
              {/* Sales Error Card (Partial Degradation) */}
              {salesError && (
                <div className="tp-state-card tp-state-error" role="alert">
                  <div className="tp-state-icon">
                    <AlertCircle size={20} />
                  </div>
                  <div className="tp-state-content">
                    <h3 className="tp-state-title">
                      Falha ao consultar indicadores de vendas
                    </h3>
                    <p className="tp-state-message">{salesError}</p>
                    <button
                      type="button"
                      onClick={handleRetrySales}
                      disabled={isSalesLoading}
                      className="tp-btn-retry"
                    >
                      <RefreshCw size={13} />
                      <span>Tentar novamente</span>
                    </button>
                  </div>
                </div>
              )}

              {/* Sales Skeleton Loading */}
              {isSalesLoading && !salesData && !salesError && (
                <div className="tp-section-skeleton" aria-label="Carregando vendas">
                  <div className="tp-kpi-grid">
                    {[1, 2, 3, 4].map((idx) => (
                      <div key={idx} className="tp-kpi-card tp-skeleton-card">
                        <div className="tp-skeleton-line tp-skeleton-short" />
                        <div className="tp-skeleton-line tp-skeleton-long" />
                      </div>
                    ))}
                  </div>
                  <div className="tp-chart-card tp-skeleton-card tp-skeleton-chart">
                    <div className="tp-skeleton-line tp-skeleton-short" />
                    <div className="tp-skeleton-line tp-skeleton-chart-body" />
                  </div>
                </div>
              )}

              {/* Sales Content */}
              {salesData && (
                <div
                  className={`tp-sales-content ${isUpdating ? "is-refreshing" : ""}`}
                >
                  <KpiGrid summary={salesData.summary} />

                  {salesData.summary.sales === 0 ? (
                    <div className="tp-state-card tp-state-empty">
                      <div className="tp-state-content">
                        <h3 className="tp-state-title">Nenhuma venda encontrada</h3>
                        <p className="tp-state-message">
                          Não há vendas realizadas entre as datas informadas. Tente
                          selecionar um período diferente para visualizar a
                          evolução.
                        </p>
                      </div>
                    </div>
                  ) : (
                    <MonthlyChart
                      trend={salesData.trend}
                      monthly={salesData.monthly}
                      from={currentPeriod.from}
                      toDate={currentPeriod.to}
                    />
                  )}
                </div>
              )}
            </section>

            {/* =======================================================
                SEÇÃO 2: INTELIGÊNCIA DE CLIENTES (CUSTOMER OVERVIEW)
                ======================================================= */}
            <section
              className="tp-dashboard-section tp-customer-section"
              id="clientes"
              aria-label="Inteligência de Clientes"
            >
              <div className="tp-section-header tp-customer-section-header">
                <div className="tp-section-header-main">
                  <div className="tp-section-title-wrap">
                    <span className="tp-section-icon-badge">
                      <Users size={14} />
                    </span>
                    <h2 className="tp-section-title">Inteligência de Clientes</h2>
                  </div>
                  <p className="tp-section-desc">
                    Comportamento, taxa de recorrência, concentração de faturamento e
                    tempo de recência da base.
                  </p>
                </div>
                <div className="tp-section-header-controls">
                  <CustomerDocumentTypeSelector
                    value={customerDocumentType}
                    onChange={handleCustomerDocumentTypeChange}
                    disabled={isCustomerLoading && !customerData}
                  />
                </div>
              </div>

              {/* Customer Error Card (Partial Degradation) */}
              {customerError && (
                <div className="tp-state-card tp-state-error" role="alert">
                  <div className="tp-state-icon">
                    <AlertCircle size={20} />
                  </div>
                  <div className="tp-state-content">
                    <h3 className="tp-state-title">
                      Falha ao consultar inteligência de clientes
                    </h3>
                    <p className="tp-state-message">{customerError}</p>
                    <button
                      type="button"
                      onClick={handleRetryCustomers}
                      disabled={isCustomerLoading}
                      className="tp-btn-retry"
                    >
                      <RefreshCw size={13} />
                      <span>Tentar novamente</span>
                    </button>
                  </div>
                </div>
              )}

              {/* Customer Skeleton Loading */}
              {isCustomerLoading && !customerData && !customerError && (
                <div
                  className="tp-section-skeleton"
                  aria-label="Carregando inteligência de clientes"
                >
                  <div className="tp-kpi-grid">
                    {[1, 2, 3, 4].map((idx) => (
                      <div key={idx} className="tp-kpi-card tp-skeleton-card">
                        <div className="tp-skeleton-line tp-skeleton-short" />
                        <div className="tp-skeleton-line tp-skeleton-long" />
                      </div>
                    ))}
                  </div>
                  <div className="tp-split-grid">
                    <div className="tp-card tp-skeleton-card tp-skeleton-table">
                      <div className="tp-skeleton-line tp-skeleton-short" />
                      <div className="tp-skeleton-line tp-skeleton-chart-body" />
                    </div>
                    <div className="tp-card tp-skeleton-card tp-skeleton-recency">
                      <div className="tp-skeleton-line tp-skeleton-short" />
                      <div className="tp-skeleton-line tp-skeleton-chart-body" />
                    </div>
                  </div>
                </div>
              )}

              {/* Customer Content */}
              {customerData && (
                <div
                  className={`tp-customer-content ${isUpdating ? "is-refreshing" : ""}`}
                >
                  <CustomerKpiGrid
                    metrics={customerData.customers}
                    lifetime={customerData.lifetime}
                    periodMode={periodMode}
                    onSelectSegment={handleOpenSegmentDrawer}
                  />

                  <div className="tp-split-grid">
                    <div className="tp-split-col-ranking">
                      <CustomerRankingCard
                        ranking={customerData.ranking}
                        onSelectCustomer={handleOpenCustomerDetail}
                      />
                    </div>
                    <div className="tp-split-col-recency">
                      <RecencyDistributionCard
                        recency={customerData.recency}
                        onSelectSegment={handleOpenSegmentDrawer}
                        onSelectRecencyBucket={(bucket) =>
                          handleOpenSegmentDrawer("recency", null, bucket)
                        }
                      />
                    </div>
                  </div>
                </div>
              )}
            </section>
          </>
        )}
      </main>

      {/* Unified Customer Segment & Detail Drawer */}
      <CustomerSegmentDrawer
        isOpen={isDrawerOpen}
        initialMode={drawerMode}
        segment={selectedSegment}
        recencyBucket={selectedRecencyBucket}
        documentType={customerDocumentType}
        customerId={selectedCustomerId}
        from={currentPeriod.from}
        to={currentPeriod.to}
        periodMode={periodMode}
        rateContext={drawerRateContext}
        canGoBackToSegment={canGoBackToSegment}
        onClose={handleCloseDrawer}
      />
    </AppShell>
  );
}
