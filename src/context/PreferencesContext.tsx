import React, { createContext, useContext, useState } from 'react';
import { CountryCode, CurrencyCode } from '../types';

export type HeaderThemeColor = 'green';

interface PreferencesContextType {
  selectedCountry: CountryCode;
  setSelectedCountry: (country: CountryCode) => void;
  selectedCurrency: CurrencyCode;
  setSelectedCurrency: (currency: CurrencyCode) => void;
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
  const [selectedCountry, setSelectedCountry] = useState<CountryCode>('GW');
  const [selectedCurrency, setSelectedCurrency] = useState<CurrencyCode>('XOF');
  const [language, setLanguage] = useState<string>('pt');
  const [theme, setTheme] = useState<'light' | 'dark'>('light');
  const [headerTheme, setHeaderTheme] = useState<HeaderThemeColor>('green');
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const handleSetHeaderTheme = (color: HeaderThemeColor) => {
    setHeaderTheme('green');
    localStorage.setItem('nusali_header_theme', 'green');
  };

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3500);
  };

  return (
    <PreferencesContext.Provider
      value={{
        selectedCountry,
        setSelectedCountry,
        selectedCurrency,
        setSelectedCurrency,
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
