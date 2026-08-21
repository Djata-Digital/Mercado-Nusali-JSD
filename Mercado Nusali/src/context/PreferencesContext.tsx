import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { CountryCode, CurrencyCode } from '../types';
import {
  COUNTRY_TO_CURRENCY_MAP,
  formatPriceWithConversion,
  FormattedPriceInfo,
  formatCurrency,
} from '../utils/currencyUtils';
import { CurrencyService } from '../services/currencyService';
import { useAuth } from './AuthContext';

export type HeaderThemeColor = 'green';

interface PreferencesContextType {
  selectedCountry: CountryCode;
  setSelectedCountry: (country: CountryCode) => void;
  selectedCurrency: CurrencyCode;
  setSelectedCurrency: (currency: CurrencyCode) => void;
  displayCountry: CountryCode;
  displayCurrency: CurrencyCode;
  formatPrice: (amount: number, originalCurrency?: CurrencyCode) => FormattedPriceInfo;
  convertPrice: (amount: number, originalCurrency?: CurrencyCode) => number;
  language: string;
  setLanguage: (lang: string) => void;
  theme: 'light' | 'dark';
  setTheme: (theme: 'light' | 'dark') => void;
  headerTheme: HeaderThemeColor;
  setHeaderTheme: (color: HeaderThemeColor) => void;
  toastMessage: string | null;
  showToast: (msg: string) => void;
}

const PreferencesContext = createContext<PreferencesContextType | undefined>(undefined);

export const PreferencesProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user } = useAuth();

  // Initialize display country and currency
  const [selectedCountry, setSelectedCountryState] = useState<CountryCode>(() => {
    try {
      const saved = localStorage.getItem('nusali_display_country') as CountryCode;
      if (saved && COUNTRY_TO_CURRENCY_MAP[saved]) return saved;
    } catch (e) {}
    return 'GW';
  });

  const [selectedCurrency, setSelectedCurrencyState] = useState<CurrencyCode>(() => {
    try {
      const savedCurr = localStorage.getItem('nusali_display_currency') as CurrencyCode;
      if (savedCurr) return savedCurr;
    } catch (e) {}
    return COUNTRY_TO_CURRENCY_MAP[selectedCountry] || 'XOF';
  });

  // Track if user explicitly selected a preference in session or localStorage
  const [hasManualSelection, setHasManualSelection] = useState<boolean>(() => {
    try {
      return Boolean(localStorage.getItem('nusali_display_country') || localStorage.getItem('nusali_display_currency'));
    } catch (e) {
      return false;
    }
  });

  // Sync with authenticated user profile when logged in (unless user manually selected a header country/currency)
  useEffect(() => {
    if (user && !hasManualSelection) {
      const userCountry = (user.countryCode || (user as any).country || 'GW') as CountryCode;
      const userCurrency = ((user as any).preferredCurrency || COUNTRY_TO_CURRENCY_MAP[userCountry] || 'XOF') as CurrencyCode;

      if (COUNTRY_TO_CURRENCY_MAP[userCountry]) {
        setSelectedCountryState(userCountry);
        setSelectedCurrencyState(userCurrency);
      }
    }
  }, [user, hasManualSelection]);

  const [language, setLanguage] = useState<string>('pt');
  const [theme, setTheme] = useState<'light' | 'dark'>('light');
  const [headerTheme, setHeaderTheme] = useState<HeaderThemeColor>('green');
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const setSelectedCountry = useCallback((country: CountryCode) => {
    const matchedCurrency = COUNTRY_TO_CURRENCY_MAP[country] || 'XOF';
    setSelectedCountryState(country);
    setSelectedCurrencyState(matchedCurrency);
    setHasManualSelection(true);

    try {
      localStorage.setItem('nusali_display_country', country);
      localStorage.setItem('nusali_display_currency', matchedCurrency);
    } catch (e) {}
  }, []);

  const setSelectedCurrency = useCallback((currency: CurrencyCode) => {
    setSelectedCurrencyState(currency);
    setHasManualSelection(true);

    try {
      localStorage.setItem('nusali_display_currency', currency);
    } catch (e) {}
  }, []);

  const handleSetHeaderTheme = (color: HeaderThemeColor) => {
    setHeaderTheme('green');
    localStorage.setItem('nusali_header_theme', 'green');
  };

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3500);
  };

  const formatPrice = useCallback(
    (amount: number, originalCurrency: CurrencyCode = 'XOF'): FormattedPriceInfo => {
      return formatPriceWithConversion(amount, originalCurrency, selectedCurrency);
    },
    [selectedCurrency]
  );

  const convertPrice = useCallback(
    (amount: number, originalCurrency: CurrencyCode = 'XOF'): number => {
      if (originalCurrency === selectedCurrency) return amount;
      return CurrencyService.convert(amount, originalCurrency, selectedCurrency);
    },
    [selectedCurrency]
  );

  return (
    <PreferencesContext.Provider
      value={{
        selectedCountry,
        setSelectedCountry,
        selectedCurrency,
        setSelectedCurrency,
        displayCountry: selectedCountry,
        displayCurrency: selectedCurrency,
        formatPrice,
        convertPrice,
        language,
        setLanguage,
        theme,
        setTheme,
        headerTheme,
        setHeaderTheme: handleSetHeaderTheme,
        toastMessage,
        showToast,
      }}
    >
      {children}
    </PreferencesContext.Provider>
  );
};

export const usePreferences = () => {
  const ctx = useContext(PreferencesContext);
  if (!ctx) {
    throw new Error('usePreferences must be used within a PreferencesProvider');
  }
  return ctx;
};
