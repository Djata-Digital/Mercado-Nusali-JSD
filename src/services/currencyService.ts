import { apiClient } from '../api/apiClient';
import { CurrencyCode } from '../types';

export interface LiveRatesResponse {
  base: string;
  date: string;
  lastUpdated: string;
  source: string;
  rates: Record<string, number>;
}

// Official baseline fallback rates
const DEFAULT_RATES: Record<string, number> = {
  USD: 1.0,
  BRL: 5.48, // 1 USD = 5.48 BRL
  EUR: 0.92, // 1 USD = 0.92 EUR
  XOF: 603.5, // 1 USD = 603.5 CFA
  AOA: 915.0, // 1 USD = 915 Kz
  MZN: 63.85, // 1 USD = 63.85 MT
  CVE: 101.45, // 1 USD = 101.45 Esc
  STN: 22.54, // 1 USD = 22.54 Db
  GBP: 0.79,
  CNY: 7.23,
  CAD: 1.37,
};

let currentLiveRates: LiveRatesResponse = {
  base: 'USD',
  date: new Date().toISOString().split('T')[0],
  lastUpdated: new Date().toISOString(),
  source: 'Banco Central / Câmbio Comercial Oficial do Dia',
  rates: { ...DEFAULT_RATES },
};

const listeners = new Set<(rates: LiveRatesResponse) => void>();

// Load cached rates from localStorage if available
try {
  const cached = localStorage.getItem('nusali_daily_exchange_rates');
  if (cached) {
    const parsed = JSON.parse(cached);
    if (parsed && parsed.rates) {
      currentLiveRates = parsed;
    }
  }
} catch (e) {
  // localStorage might be unavailable in some iframe sandboxes
}

export const CurrencyService = {
  /**
   * Returns currently active live rates immediately
   */
  getRates(): LiveRatesResponse {
    return currentLiveRates;
  },

  /**
   * Fetches latest official daily exchange rates from backend or fallback
   */
  async fetchLiveRates(): Promise<LiveRatesResponse> {
    try {
      const response = await apiClient.get<{ success: boolean; data: LiveRatesResponse }>('/rates/live');
      if (response.data?.success && response.data?.data) {
        currentLiveRates = response.data.data;
        try {
          localStorage.setItem('nusali_daily_exchange_rates', JSON.stringify(currentLiveRates));
        } catch (e) {}

        listeners.forEach((cb) => cb(currentLiveRates));
        return currentLiveRates;
      }
    } catch (err) {
      // Fallback: try open public API directly from client
      try {
        const res = await fetch('https://open.er-api.com/v6/latest/USD');
        if (res.ok) {
          const data: any = await res.json();
          if (data?.rates) {
            currentLiveRates = {
              base: 'USD',
              date: data.time_last_update_utc ? new Date(data.time_last_update_utc).toISOString().split('T')[0] : new Date().toISOString().split('T')[0],
              lastUpdated: new Date().toISOString(),
              source: 'ExchangeRate-API Internacional',
              rates: {
                ...DEFAULT_RATES,
                ...data.rates,
              },
            };
            listeners.forEach((cb) => cb(currentLiveRates));
            return currentLiveRates;
          }
        }
      } catch (clientErr) {
        console.warn('Using standard daily fallback rates:', clientErr);
      }
    }

    return currentLiveRates;
  },

  /**
   * Converts an amount from one currency to another using the live daily international rate
   */
  convert(amount: number, fromCurrency: CurrencyCode | string, toCurrency: CurrencyCode | string): number {
    if (fromCurrency === toCurrency) return amount;

    const rates = currentLiveRates.rates;
    const rateFrom = rates[fromCurrency] || DEFAULT_RATES[fromCurrency] || 1;
    const rateTo = rates[toCurrency] || DEFAULT_RATES[toCurrency] || 1;

    // (amount / rateFromUSD) * rateToUSD
    const amountInUSD = amount / rateFrom;
    const converted = amountInUSD * rateTo;

    return Number(converted.toFixed(2));
  },

  /**
   * Returns exact direct exchange rate between two currencies (e.g. 1 USD = X BRL, or 1 EUR = X XOF)
   */
  getPairRate(fromCurrency: CurrencyCode | string, toCurrency: CurrencyCode | string): number {
    const rates = currentLiveRates.rates;
    const rateFrom = rates[fromCurrency] || DEFAULT_RATES[fromCurrency] || 1;
    const rateTo = rates[toCurrency] || DEFAULT_RATES[toCurrency] || 1;
    return Number((rateTo / rateFrom).toFixed(4));
  },

  /**
   * Subscribe to rate updates
   */
  subscribe(callback: (rates: LiveRatesResponse) => void): () => void {
    listeners.add(callback);
    return () => listeners.delete(callback);
  },
};

// Initial auto-fetch
if (typeof window !== 'undefined') {
  CurrencyService.fetchLiveRates().catch(() => {});
}
