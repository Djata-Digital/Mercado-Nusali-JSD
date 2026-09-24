/**
 * FASE D16-H3 — Destino de Entrega Antecipado e Compartilhado.
 *
 * Responsabilidade EXCLUSIVA deste context: a intenção TEMPORÁRIA de
 * destino de entrega da jornada de compra atual (ProductDetail → Cart →
 * Checkout). NUNCA:
 *   - altera PreferencesContext.selectedCountry (o país "Enviar para" do
 *     Header continua sendo autoridade — este context só LÊ selectedCountry
 *     para validar/invalidar, nunca escreve nele);
 *   - altera PreferencesContext.catalogOriginFilter (conceito
 *     completamente diferente — de qual país eu quero VER produtos, nunca
 *     para onde entregar);
 *   - cria/persiste um endereço real (addresses) — mode:'sector' nunca tem
 *     rua/número/bairro/destinatário/documento, só o suficiente para
 *     consultar frete (shippingSectorId + nomes de exibição);
 *   - é autoridade de preço/rota/origem/seller/inventory — F3/F4/F6.2
 *     continuam validando o shippingSectorId no servidor, exatamente como
 *     antes; este context é só a intenção do comprador, nunca uma garantia.
 *
 * Persistência: localStorage, chave PRÓPRIA ('nusali_delivery_destination'),
 * nunca reaproveitando 'nusali_display_country'/'nusali_catalog_origin_filter'
 * (ver PreferencesContext.tsx) nem o storage do carrinho/endereços.
 */
import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { usePreferences } from './PreferencesContext';

const STORAGE_KEY = 'nusali_delivery_destination';

export interface SavedAddressDestinationIntent {
  mode: 'saved';
  addressId: string;
  shippingSectorId: string;
  shippingSectorName?: string | null;
  shippingRegionId?: string | null;
  shippingRegionName?: string | null;
  countryCode: string;
}

export interface SectorDestinationIntent {
  mode: 'sector';
  shippingSectorId: string;
  shippingSectorName: string;
  shippingRegionId: string;
  shippingRegionName: string;
  countryCode: string;
}

export type DeliveryDestinationIntent = SavedAddressDestinationIntent | SectorDestinationIntent;

/**
 * Pura — parseia o valor cru do localStorage, validando a FORMA mínima de
 * cada modo. Qualquer JSON malformado, tipo errado, ou campo obrigatório
 * ausente resolve para null (nunca lança, nunca "adivinha" um valor).
 * Exportada para ser testável diretamente (cenário J do enunciado).
 */
export function parseStoredDeliveryDestination(raw: string | null | undefined): DeliveryDestinationIntent | null {
  if (!raw) return null;
  let parsed: any;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== 'object') return null;

  const isNonEmptyString = (v: any): v is string => typeof v === 'string' && v.length > 0;
  const optionalString = (v: any): string | null => (typeof v === 'string' ? v : null);

  if (parsed.mode === 'saved') {
    if (!isNonEmptyString(parsed.addressId) || !isNonEmptyString(parsed.shippingSectorId) || !isNonEmptyString(parsed.countryCode)) {
      return null;
    }
    return {
      mode: 'saved',
      addressId: parsed.addressId,
      shippingSectorId: parsed.shippingSectorId,
      shippingSectorName: optionalString(parsed.shippingSectorName),
      shippingRegionId: optionalString(parsed.shippingRegionId),
      shippingRegionName: optionalString(parsed.shippingRegionName),
      countryCode: parsed.countryCode,
    };
  }

  if (parsed.mode === 'sector') {
    if (
      !isNonEmptyString(parsed.shippingSectorId) ||
      !isNonEmptyString(parsed.shippingRegionId) ||
      !isNonEmptyString(parsed.countryCode)
    ) {
      return null;
    }
    return {
      mode: 'sector',
      shippingSectorId: parsed.shippingSectorId,
      shippingSectorName: isNonEmptyString(parsed.shippingSectorName) ? parsed.shippingSectorName : '',
      shippingRegionId: parsed.shippingRegionId,
      shippingRegionName: isNonEmptyString(parsed.shippingRegionName) ? parsed.shippingRegionName : '',
      countryCode: parsed.countryCode,
    };
  }

  return null;
}

/** Pura — usada tanto na leitura inicial quanto na invalidação em runtime (cenário G). */
export function isDeliveryDestinationValidForCountry(
  destination: DeliveryDestinationIntent | null,
  currentCountryCode: string
): boolean {
  if (!destination) return false;
  return destination.countryCode === currentCountryCode;
}

function readStoredDestination(currentCountryCode: string): DeliveryDestinationIntent | null {
  try {
    const parsed = parseStoredDeliveryDestination(localStorage.getItem(STORAGE_KEY));
    return isDeliveryDestinationValidForCountry(parsed, currentCountryCode) ? parsed : null;
  } catch {
    return null;
  }
}

interface DeliveryDestinationContextType {
  /** null = nenhuma intenção temporária válida — todas as telas devem cair no fallback (endereço padrão do comprador). */
  destination: DeliveryDestinationIntent | null;
  setSavedAddressIntent: (input: Omit<SavedAddressDestinationIntent, 'mode'>) => void;
  setSectorIntent: (input: Omit<SectorDestinationIntent, 'mode'>) => void;
  clearDestination: () => void;
}

const DeliveryDestinationContext = createContext<DeliveryDestinationContextType | undefined>(undefined);

export const DeliveryDestinationProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { selectedCountry } = usePreferences();

  const [destination, setDestination] = useState<DeliveryDestinationIntent | null>(() =>
    readStoredDestination(selectedCountry)
  );

  // FASE D16-H3, item 2 — invalidação por troca de país no Header: NUNCA
  // altera selectedCountry (ele continua a autoridade), só invalida a
  // intenção de destino quando ela pertence a um país diferente do
  // atualmente selecionado (cenário G). Usa updater funcional para não
  // precisar de `destination` no dependency array (evita qualquer risco de
  // loop — a comparação abaixo já é idempotente quando já é null).
  useEffect(() => {
    setDestination((prev) => {
      if (prev && prev.countryCode !== selectedCountry) {
        try {
          localStorage.removeItem(STORAGE_KEY);
        } catch {
          /* localStorage indisponível (modo privado, etc.) — nunca quebra a navegação. */
        }
        return null;
      }
      return prev;
    });
  }, [selectedCountry]);

  const persist = useCallback((next: DeliveryDestinationIntent | null) => {
    setDestination(next);
    try {
      if (next) localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      else localStorage.removeItem(STORAGE_KEY);
    } catch {
      /* localStorage indisponível — a intenção só não sobrevive a um refresh, nunca quebra a compra. */
    }
  }, []);

  const setSavedAddressIntent = useCallback(
    (input: Omit<SavedAddressDestinationIntent, 'mode'>) => {
      persist({ mode: 'saved', ...input });
    },
    [persist]
  );

  const setSectorIntent = useCallback(
    (input: Omit<SectorDestinationIntent, 'mode'>) => {
      persist({ mode: 'sector', ...input });
    },
    [persist]
  );

  const clearDestination = useCallback(() => persist(null), [persist]);

  return (
    <DeliveryDestinationContext.Provider value={{ destination, setSavedAddressIntent, setSectorIntent, clearDestination }}>
      {children}
    </DeliveryDestinationContext.Provider>
  );
};

export const useDeliveryDestination = () => {
  const ctx = useContext(DeliveryDestinationContext);
  if (!ctx) {
    throw new Error('useDeliveryDestination must be used within a DeliveryDestinationProvider');
  }
  return ctx;
};
