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
import { useCountries } from '../hooks/useCountries';
import { resolveCurrencyForCountry } from '../utils/countryResolution';
import { storageService } from '../services/storage/storageService';

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

  // Países operacionais reais (GET /api/v1/countries) — única fonte de
  // verdade sobre quais países/moedas existem de fato. COUNTRY_TO_CURRENCY_MAP
  // só é usado como fallback seguro enquanto a lista real não carregou, nunca
  // para decidir se um país é válido.
  const { data: operationalCountries } = useCountries();
  const currencyForCountry = (code: CountryCode): CurrencyCode | undefined =>
    resolveCurrencyForCountry(code, operationalCountries, COUNTRY_TO_CURRENCY_MAP) as CurrencyCode | undefined;

  // Initialize display country and currency. Não invalida a preferência
  // salva contra um mapa hardcoded — um país real (ex.: GM, SN) fora do
  // antigo COUNTRY_TO_CURRENCY_MAP não pode ser descartado silenciosamente.
  const [selectedCountry, setSelectedCountryState] = useState<CountryCode>(() => {
    try {
      const saved = localStorage.getItem('nusali_display_country') as CountryCode;
      if (saved) return saved;
    } catch (e) {}
    return 'GW';
  });

  const [selectedCurrency, setSelectedCurrencyState] = useState<CurrencyCode>(() => {
    try {
      const savedCurr = localStorage.getItem('nusali_display_currency') as CurrencyCode;
      if (savedCurr) return savedCurr;
    } catch (e) {}
    return (COUNTRY_TO_CURRENCY_MAP[selectedCountry] as CurrencyCode) || 'XOF';
  });

  // Melhoria pré-piloto (elegibilidade por país): storageService.getSelectedCountry()
  // alimenta o header X-Country-Code enviado em TODA requisição da API (apiClient.ts),
  // mas usava uma chave de localStorage separada ('nusali_selected_country') que nunca
  // era escrita por ninguém — o header sempre caía no fallback fixo ('GW'), nunca no
  // país realmente selecionado aqui. Sincronizar os dois faz o backend enxergar o
  // destino real do comprador em toda rota pública (catálogo, busca, produto, etc.)
  // sem precisar alterar cada tela individualmente.
  useEffect(() => {
    storageService.setSelectedCountry(selectedCountry);
  }, [selectedCountry]);

  // Track if user explicitly selected a preference in session or localStorage
  const [hasManualSelection, setHasManualSelection] = useState<boolean>(() => {
    try {
      return Boolean(localStorage.getItem('nusali_display_country') || localStorage.getItem('nusali_display_currency'));
    } catch (e) {
      return false;
    }
  });

  // Assim que a lista real de países carrega, corrige a moeda exibida caso o
  // país selecionado (salvo ou do usuário) não estivesse no mapa hardcoded
  // antigo — sem isso, GM/SN ficariam presos em XOF por engano.
  useEffect(() => {
    if (!operationalCountries) return;
    const resolved = currencyForCountry(selectedCountry);
    if (resolved && resolved !== selectedCurrency) {
      setSelectedCurrencyState(resolved);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [operationalCountries]);

  // Sync with authenticated user profile when logged in (unless user manually selected a header country/currency)
  useEffect(() => {
    if (user && !hasManualSelection) {
      const userCountry = (user.countryCode || (user as any).country || 'GW') as CountryCode;
      const resolvedCurrency = currencyForCountry(userCountry);
      const userCurrency = ((user as any).preferredCurrency || resolvedCurrency || 'XOF') as CurrencyCode;

      // Antes só aplicava se o país estivesse no mapa hardcoded — isso
      // impedia o próprio país real do usuário (ex.: GM, SN) de ser
      // refletido no header. Agora aplica sempre: é o país já validado pelo
      // backend no cadastro/login do usuário.
      setSelectedCountryState(userCountry);
      setSelectedCurrencyState(userCurrency);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, hasManualSelection, operationalCountries]);

  const [language, setLanguage] = useState<string>('pt');
  const [theme, setTheme] = useState<'light' | 'dark'>('light');
  const [headerTheme, setHeaderTheme] = useState<HeaderThemeColor>('green');
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const setSelectedCountry = useCallback((country: CountryCode) => {
    const matchedCurrency = currencyForCountry(country) || 'XOF';
    setSelectedCountryState(country);
    setSelectedCurrencyState(matchedCurrency);
    setHasManualSelection(true);

    try {
      localStorage.setItem('nusali_display_country', country);
      localStorage.setItem('nusali_display_currency', matchedCurrency);
    } catch (e) {}
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [operationalCountries]);

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
