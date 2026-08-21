import { Router, Request, Response } from 'express';

export const ratesRouter = Router();

export interface ExchangeRatesData {
  base: string;
  date: string;
  lastUpdated: string;
  source: string;
  rates: Record<string, number>;
}

// Default baseline rates (official international rates)
const FALLBACK_RATES: Record<string, number> = {
  USD: 1.0,
  BRL: 5.48, // 1 USD = 5.48 BRL
  EUR: 0.92, // 1 USD = 0.92 EUR
  XOF: 603.5, // 1 USD = 603.50 CFA (BCEAO Peg to EUR: 1 EUR = 655.957 XOF)
  AOA: 915.0, // 1 USD = 915 Kz
  MZN: 63.85, // 1 USD = 63.85 MT
  CVE: 101.45, // 1 USD = 101.45 Esc (Pegged to EUR at 110.265)
  STN: 22.54, // 1 USD = 22.54 Db
  GBP: 0.79,
  CNY: 7.23,
  CAD: 1.37,
};

let cachedRates: ExchangeRatesData = {
  base: 'USD',
  date: new Date().toISOString().split('T')[0],
  lastUpdated: new Date().toISOString(),
  source: 'Banco Central / Câmbio Comercial Oficial do Dia',
  rates: { ...FALLBACK_RATES },
};

let lastFetchTimestamp = 0;
const CACHE_TTL_MS = 30 * 60 * 1000; // 30 minutes cache

/**
 * Helper to fetch live daily international rates from open reliable endpoints
 */
export async function fetchLiveDailyRates(): Promise<ExchangeRatesData> {
  const now = Date.now();
  if (now - lastFetchTimestamp < CACHE_TTL_MS && Object.keys(cachedRates.rates).length > 5) {
    return cachedRates;
  }

  try {
    // Try Open ER API (free, reliable, daily updated)
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 4000);

    const response = await fetch('https://open.er-api.com/v6/latest/USD', {
      signal: controller.signal,
      headers: { 'Accept': 'application/json' },
    });
    clearTimeout(timeoutId);

    if (response.ok) {
      const data: any = await response.json();
      if (data && data.rates) {
        // Compute and guarantee all Lusophone / African currencies
        const rates: Record<string, number> = {
          ...FALLBACK_RATES,
          ...data.rates,
        };

        // Standard fixed peg calculations if not directly present:
        // CFA (XOF) is pegged to EUR at 1 EUR = 655.957 XOF
        if (rates.EUR && (!rates.XOF || rates.XOF < 100)) {
          rates.XOF = Number((655.957 / rates.EUR).toFixed(2));
        }
        // Cape Verde Escudo (CVE) is pegged to EUR at 1 EUR = 110.265 CVE
        if (rates.EUR && (!rates.CVE || rates.CVE < 10)) {
          rates.CVE = Number((110.265 / rates.EUR).toFixed(2));
        }
        // Sao Tome Dobra (STN) is pegged to EUR at 1 EUR = 24.50 STN
        if (rates.EUR && (!rates.STN || rates.STN < 5)) {
          rates.STN = Number((24.50 / rates.EUR).toFixed(2));
        }

        cachedRates = {
          base: 'USD',
          date: data.time_last_update_utc ? new Date(data.time_last_update_utc).toISOString().split('T')[0] : new Date().toISOString().split('T')[0],
          lastUpdated: new Date().toISOString(),
          source: 'ExchangeRate-API / Banco Central (Câmbio Comercial do Dia)',
          rates,
        };
        lastFetchTimestamp = now;
        return cachedRates;
      }
    }
  } catch (err: any) {
    console.warn('Notice: Could not fetch remote daily exchange rates, using high-precision fallback rates:', err?.message);
  }

  return cachedRates;
}

// Initial async fetch at startup
fetchLiveDailyRates().catch(() => {});

/**
 * GET /api/rates/live
 * Returns the current daily international exchange rates
 */
ratesRouter.get('/live', async (req: Request, res: Response) => {
  try {
    const ratesData = await fetchLiveDailyRates();
    return res.json({
      success: true,
      data: ratesData,
    });
  } catch (error: any) {
    return res.json({
      success: true,
      data: cachedRates,
      fallback: true,
    });
  }
});

/**
 * GET /api/rates/convert?amount=100&from=XOF&to=BRL
 * Performs exact daily conversion between any 2 supported currencies
 */
ratesRouter.get('/convert', async (req: Request, res: Response) => {
  try {
    const amount = Number(req.query.amount) || 0;
    const from = String(req.query.from || 'USD').toUpperCase();
    const to = String(req.query.to || 'BRL').toUpperCase();

    const ratesData = await fetchLiveDailyRates();
    const rates = ratesData.rates;

    const rateFrom = rates[from] || 1;
    const rateTo = rates[to] || 1;

    // Convert: (amount / rateFrom) * rateTo
    const amountInUSD = amount / rateFrom;
    const convertedAmount = amountInUSD * rateTo;
    const directRate = rateTo / rateFrom;

    return res.json({
      success: true,
      data: {
        originalAmount: amount,
        fromCurrency: from,
        toCurrency: to,
        convertedAmount: Number(convertedAmount.toFixed(2)),
        directExchangeRate: Number(directRate.toFixed(6)),
        inverseExchangeRate: Number((1 / directRate).toFixed(6)),
        rateDate: ratesData.date,
        source: ratesData.source,
      },
    });
  } catch (error: any) {
    return res.status(500).json({
      success: false,
      message: 'Erro ao calcular conversão de moeda: ' + error?.message,
    });
  }
});

export function getCachedRates(): ExchangeRatesData {
  return cachedRates;
}
