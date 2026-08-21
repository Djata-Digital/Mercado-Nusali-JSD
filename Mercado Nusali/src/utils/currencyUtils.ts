import { CountryCode, CountryConfig, CurrencyCode } from '../types';
import { CurrencyService, LiveRatesResponse } from '../services/currencyService';

export const countriesConfig: Record<CountryCode, CountryConfig> = {
  GW: {
    code: 'GW',
    name: 'Guiné-Bissau',
    flag: '🇬🇼',
    currency: 'XOF',
    currencySymbol: 'CFA',
    exchangeRateToUSD: 603.5, // 1 USD = 603.50 CFA (BCEAO)
    phonePrefix: '+245',
    paymentMethods: ['orange_money', 'mtn_money', 'nusali_wallet', 'credit_card'],
  },
  BR: {
    code: 'BR',
    name: 'Brasil',
    flag: '🇧🇷',
    currency: 'BRL',
    currencySymbol: 'R$',
    exchangeRateToUSD: 5.48, // 1 USD = 5.48 BRL
    phonePrefix: '+55',
    paymentMethods: ['pix', 'credit_card', 'boleto', 'nusali_wallet'],
  },
  PT: {
    code: 'PT',
    name: 'Portugal',
    flag: '🇵🇹',
    currency: 'EUR',
    currencySymbol: '€',
    exchangeRateToUSD: 0.92, // 1 USD = 0.92 EUR
    phonePrefix: '+351',
    paymentMethods: ['credit_card', 'stripe_paypal', 'nusali_wallet'],
  },
  AO: {
    code: 'AO',
    name: 'Angola',
    flag: '🇦🇴',
    currency: 'AOA',
    currencySymbol: 'Kz',
    exchangeRateToUSD: 915.0, // 1 USD = 915 Kz
    phonePrefix: '+244',
    paymentMethods: ['credit_card', 'nusali_wallet'],
  },
  US: {
    code: 'US',
    name: 'Estados Unidos',
    flag: '🇺🇸',
    currency: 'USD',
    currencySymbol: '$',
    exchangeRateToUSD: 1.0,
    phonePrefix: '+1',
    paymentMethods: ['credit_card', 'stripe_paypal', 'nusali_wallet'],
  },
  MZ: {
    code: 'MZ',
    name: 'Moçambique',
    flag: '🇲🇿',
    currency: 'MZN',
    currencySymbol: 'MT',
    exchangeRateToUSD: 63.85,
    phonePrefix: '+258',
    paymentMethods: ['credit_card', 'nusali_wallet'],
  },
  CV: {
    code: 'CV',
    name: 'Cabo Verde',
    flag: '🇨🇻',
    currency: 'CVE',
    currencySymbol: 'Esc',
    exchangeRateToUSD: 101.45,
    phonePrefix: '+238',
    paymentMethods: ['credit_card', 'nusali_wallet'],
  },
  ST: {
    code: 'ST',
    name: 'São Tomé e Príncipe',
    flag: '🇸🇹',
    currency: 'STN',
    currencySymbol: 'Db',
    exchangeRateToUSD: 22.54,
    phonePrefix: '+239',
    paymentMethods: ['credit_card', 'nusali_wallet'],
  },
};

/**
 * Returns current live daily exchange rate relative to USD
 */
export const getLiveExchangeRate = (currency: CurrencyCode | string): number => {
  const rates = CurrencyService.getRates().rates;
  if (rates && rates[currency]) {
    return rates[currency];
  }
  const config = Object.values(countriesConfig).find((c) => c.currency === currency);
  return config ? config.exchangeRateToUSD : 1;
};

/**
 * Converts any amount between any two supported currencies using today's official international daily exchange rate
 */
export const convertCurrency = (
  amount: number,
  fromCurrency: CurrencyCode | string,
  toCurrency: CurrencyCode | string
): number => {
  return CurrencyService.convert(amount, fromCurrency, toCurrency);
};

/**
 * Returns complete quote information of the day for a pair of currencies
 */
export const getExchangeRateDetails = (
  fromCurrency: CurrencyCode | string,
  toCurrency: CurrencyCode | string
) => {
  const liveRates = CurrencyService.getRates();
  const directRate = CurrencyService.getPairRate(fromCurrency, toCurrency);
  const inverseRate = directRate > 0 ? Number((1 / directRate).toFixed(4)) : 1;

  return {
    fromCurrency,
    toCurrency,
    directRate,
    inverseRate,
    date: liveRates.date,
    lastUpdated: liveRates.lastUpdated,
    source: liveRates.source,
    formattedQuote: `1 ${fromCurrency} = ${directRate.toLocaleString('pt-BR', { maximumFractionDigits: 4 })} ${toCurrency}`,
  };
};

export const getCountryConfig = (code?: CountryCode | string): CountryConfig => {
  if (code && countriesConfig[code as CountryCode]) {
    return countriesConfig[code as CountryCode];
  }
  return countriesConfig.GW;
};

export const getCountryName = (code?: CountryCode | string): string => {
  return getCountryConfig(code).name;
};

export const getCountryFlag = (code?: CountryCode | string): string => {
  return getCountryConfig(code).flag;
};

export const COUNTRY_TO_CURRENCY_MAP: Record<CountryCode, CurrencyCode> = {
  GW: 'XOF',
  BR: 'BRL',
  PT: 'EUR',
  AO: 'AOA',
  US: 'USD',
  MZ: 'MZN',
  CV: 'CVE',
  ST: 'STN',
};

export interface FormattedPriceInfo {
  formatted: string;
  originalFormatted: string;
  isConverted: boolean;
  convertedAmount: number;
  displayCurrency: CurrencyCode;
  originalCurrency: CurrencyCode;
}

export function formatPriceWithConversion(
  amount: number,
  originalCurrency: CurrencyCode = 'XOF',
  displayCurrency: CurrencyCode = 'XOF'
): FormattedPriceInfo {
  const origCurr: CurrencyCode = originalCurrency || 'XOF';
  const dispCurr: CurrencyCode = displayCurrency || origCurr;

  const originalFormatted = formatCurrency(amount, origCurr);

  if (origCurr === dispCurr) {
    return {
      formatted: originalFormatted,
      originalFormatted,
      isConverted: false,
      convertedAmount: amount,
      displayCurrency: dispCurr,
      originalCurrency: origCurr,
    };
  }

  const convertedAmount = CurrencyService.convert(amount, origCurr, dispCurr);
  if (isNaN(convertedAmount) || convertedAmount <= 0) {
    return {
      formatted: originalFormatted,
      originalFormatted,
      isConverted: false,
      convertedAmount: amount,
      displayCurrency: origCurr,
      originalCurrency: origCurr,
    };
  }

  const formatted = formatCurrency(convertedAmount, dispCurr);

  return {
    formatted,
    originalFormatted,
    isConverted: true,
    convertedAmount,
    displayCurrency: dispCurr,
    originalCurrency: origCurr,
  };
}

export const formatCurrency = (
  amountInUSDOrLocal: number,
  currency: CurrencyCode = 'XOF',
  isBaseUSD: boolean = false
): string => {
  let finalAmount = amountInUSDOrLocal;

  if (isBaseUSD) {
    const rate = getLiveExchangeRate(currency);
    finalAmount = amountInUSDOrLocal * rate;
  }

  const symbol =
    Object.values(countriesConfig).find((c) => c.currency === currency)?.currencySymbol || currency;

  if (currency === 'XOF') {
    return `${Math.round(finalAmount).toLocaleString('pt-GW')} ${symbol}`;
  }
  if (currency === 'BRL') {
    return `${symbol} ${finalAmount.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }
  if (currency === 'EUR') {
    return `${finalAmount.toLocaleString('pt-PT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${symbol}`;
  }
  if (currency === 'AOA') {
    return `${Math.round(finalAmount).toLocaleString('pt-AO')} ${symbol}`;
  }
  return `${symbol} ${finalAmount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};

export const formatMoney = formatCurrency;
