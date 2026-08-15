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
  gmvGlobalFormatted: '2.450.800.000 XOF',
  platformRevenueFormatted: '110.286.000 XOF',
  netRevenueFormatted: '88.228.800 XOF',
  ordersCount: 42800,
  salesCount: 42800,
  buyersCount: 184000,
  sellersCount: 1250,
  verifiedSellersCount: 980,
  pendingSellersCount: 270,
  storesCount: 890,
  productsCount: 18400,
  pendingProductsCount: 140,
  activeCountriesCount: 6,
  currenciesCount: 5,
  escrowBalanceFormatted: '185.400.000 XOF',
  releasedBalanceFormatted: '2.140.000.000 XOF',
  disputedBalanceFormatted: '18.200.000 XOF',
  refundsFormatted: '12.400.000 XOF',
  payoutsFormatted: '1.980.000.000 XOF',
  disputesCount: 24,
  returnsCount: 18,
  totalDeliveries: 41200,
  delayedDeliveries: 320,
  supportTicketsCount: 45,
  denunciasCount: 8,
  fraudAlertsCount: 3
};

export const mockGmvPeriodChart = [
  { label: 'Jan', gmv: 180 },
  { label: 'Fev', gmv: 210 },
  { label: 'Mar', gmv: 250 },
  { label: 'Abr', gmv: 290 },
  { label: 'Mai', gmv: 340 },
  { label: 'Jun', gmv: 410 },
  { label: 'Jul', gmv: 520 }
];

export const mockGmvByCountryChart = [
  { country: 'Guiné-Bissau 🇬🇼', value: 48, formatted: '1.176.384.000 XOF' },
  { country: 'Brasil 🇧🇷', value: 28, formatted: '686.224.000 XOF eq.' },
  { country: 'Portugal 🇵🇹', value: 14, formatted: '343.112.000 XOF eq.' },
  { country: 'Angola 🇦🇴', value: 7, formatted: '171.556.000 XOF eq.' },
  { country: 'Outros CPLP 🇨🇻🇲🇿', value: 3, formatted: '73.524.000 XOF eq.' }
];

export const mockPaymentMethodsChart = [
  { method: 'Orange Money 🇬🇼', pct: 42 },
  { method: 'PIX 🇧🇷', pct: 26 },
  { method: 'Nusali Pay (Carteira)', pct: 15 },
  { method: 'MB WAY / CTT 🇵🇹', pct: 10 },
  { method: 'Multicaixa / Outros 🇦🇴', pct: 7 }
];
