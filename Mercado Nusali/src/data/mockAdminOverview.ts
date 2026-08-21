export interface GlobalOverviewMetrics {
  gmvGlobalFormatted: string;
  platformRevenueFormatted: string;
  netRevenueFormatted: string;
  ordersCount: number;
  salesCount: number;
  buyersCount: number;
  sellersCount: number;
  verifiedSellersCount: number;
  pendingSellersCount: number;
  storesCount: number;
  productsCount: number;
  pendingProductsCount: number;
  activeCountriesCount: number;
  currenciesCount: number;
  escrowBalanceFormatted: string;
  releasedBalanceFormatted: string;
  disputedBalanceFormatted: string;
  refundsFormatted: string;
  payoutsFormatted: string;
  disputesCount: number;
  returnsCount: number;
  totalDeliveries: number;
  delayedDeliveries: number;
  supportTicketsCount: number;
  denunciasCount: number;
  fraudAlertsCount: number;
}

export const mockGlobalOverviewData: GlobalOverviewMetrics = {
  gmvGlobalFormatted: '0 XOF',
  platformRevenueFormatted: '0 XOF',
  netRevenueFormatted: '0 XOF',
  ordersCount: 0,
  salesCount: 0,
  buyersCount: 0,
  sellersCount: 0,
  verifiedSellersCount: 0,
  pendingSellersCount: 0,
  storesCount: 0,
  productsCount: 0,
  pendingProductsCount: 0,
  activeCountriesCount: 0,
  currenciesCount: 0,
  escrowBalanceFormatted: '0 XOF',
  releasedBalanceFormatted: '0 XOF',
  disputedBalanceFormatted: '0 XOF',
  refundsFormatted: '0 XOF',
  payoutsFormatted: '0 XOF',
  disputesCount: 0,
  returnsCount: 0,
  totalDeliveries: 0,
  delayedDeliveries: 0,
  supportTicketsCount: 0,
  denunciasCount: 0,
  fraudAlertsCount: 0
};

export const mockGmvPeriodChart: { label: string; gmv: number }[] = [];

export const mockGmvByCountryChart: { country: string; value: number; formatted: string }[] = [];

export const mockPaymentMethodsChart: { method: string; pct: number }[] = [];
