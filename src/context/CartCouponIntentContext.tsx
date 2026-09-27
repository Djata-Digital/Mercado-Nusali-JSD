/**
 * FASE D18-C3.4 — Intenção de Cupom por Loja, Compartilhada (Cart → Checkout).
 *
 * Responsabilidade EXCLUSIVA deste context: carregar a INTENÇÃO de qual
 * cupom o comprador quer aplicar em cada loja, do CartView (onde o cupom é
 * validado via preview) até o CheckoutView (onde `storeCoupons` é enviado a
 * POST /orders). Mesmo padrão já estabelecido em DeliveryDestinationContext.tsx
 * (D16-H3) — nunca reaproveita a mesma storage key.
 *
 * NUNCA é autoridade: guarda só {storeId, code}, nunca discountAmount,
 * eligibleSubtotal, sellerId, couponId ou qualquer valor calculado — o
 * backend SEMPRE revalida e recalcula tudo do zero dentro da transação de
 * checkout (orderService.ts:resolveGroupCouponLocked). Se o comprador
 * recarregar a página no meio do checkout, o pior caso é a intenção ser
 * perdida (o comprador reaplica o cupom) — nunca um valor desatualizado
 * sendo confiado.
 *
 * Persistência: sessionStorage (não localStorage) — uma intenção de cupom é
 * escopada à sessão de compra atual, não deve sobreviver indefinidamente
 * entre visitas como o destino de entrega faz.
 */
import React, { createContext, useContext, useState, useCallback } from 'react';

const STORAGE_KEY = 'nusali_cart_coupon_intents';

export interface StoreCouponIntent {
  storeId: string;
  code: string;
}

function readStoredIntents(): Record<string, string> {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    const result: Record<string, string> = {};
    for (const [storeId, code] of Object.entries(parsed)) {
      if (typeof storeId === 'string' && typeof code === 'string' && code) result[storeId] = code;
    }
    return result;
  } catch {
    return {};
  }
}

interface CartCouponIntentContextType {
  /** storeId -> code (já validado por um preview bem-sucedido) */
  intents: Record<string, string>;
  setStoreCouponIntent: (storeId: string, code: string) => void;
  clearStoreCouponIntent: (storeId: string) => void;
  clearAllCouponIntents: () => void;
  /** Forma pronta para POST /orders — nunca inclui discountAmount/sellerId/etc. */
  toStoreCouponsPayload: () => StoreCouponIntent[];
}

const CartCouponIntentContext = createContext<CartCouponIntentContextType | undefined>(undefined);

export const CartCouponIntentProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [intents, setIntents] = useState<Record<string, string>>(() => readStoredIntents());

  const persist = useCallback((next: Record<string, string>) => {
    setIntents(next);
    try {
      if (Object.keys(next).length === 0) sessionStorage.removeItem(STORAGE_KEY);
      else sessionStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      /* sessionStorage indisponível — a intenção só não sobrevive a um refresh, nunca quebra a compra. */
    }
  }, []);

  const setStoreCouponIntent = useCallback(
    (storeId: string, code: string) => {
      setIntents((prev) => {
        const next = { ...prev, [storeId]: code };
        persist(next);
        return next;
      });
    },
    [persist]
  );

  const clearStoreCouponIntent = useCallback(
    (storeId: string) => {
      setIntents((prev) => {
        if (!(storeId in prev)) return prev;
        const next = { ...prev };
        delete next[storeId];
        persist(next);
        return next;
      });
    },
    [persist]
  );

  const clearAllCouponIntents = useCallback(() => persist({}), [persist]);

  const toStoreCouponsPayload = useCallback((): StoreCouponIntent[] => {
    return Object.entries(intents).map(([storeId, code]) => ({ storeId, code }));
  }, [intents]);

  return (
    <CartCouponIntentContext.Provider
      value={{ intents, setStoreCouponIntent, clearStoreCouponIntent, clearAllCouponIntents, toStoreCouponsPayload }}
    >
      {children}
    </CartCouponIntentContext.Provider>
  );
};

export const useCartCouponIntent = () => {
  const ctx = useContext(CartCouponIntentContext);
  if (!ctx) {
    throw new Error('useCartCouponIntent must be used within a CartCouponIntentProvider');
  }
  return ctx;
};
