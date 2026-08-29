import { useState, useEffect } from 'react';
import { CartService } from '../services/cartService';
import { storageService } from '../services/storage/storageService';
import { CartItem, Product } from '../types';

export const useCart = () => {
  const [items, setItems] = useState<CartItem[]>(() => CartService.getCart());
  // Correção pré-piloto (race condition/duplicação): sem isLoading, telas como
  // Cart/Checkout não conseguiam distinguir "ainda buscando o carrinho real no
  // backend" de "carrinho genuinamente vazio" — o snapshot inicial (vazio para
  // usuário logado, já que getCart() só serve o carrinho local) aparecia como
  // "carrinho vazio" por um instante antes do GET /cart real terminar.
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadCart = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const token = storageService.getToken();
      if (token) {
        const serverItems = await CartService.fetchServerCart();
        setItems(serverItems);
      } else {
        setItems(CartService.getCart());
      }
    } catch (err: any) {
      setError(err?.message || 'Erro ao carregar carrinho.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadCart();
  }, []);

  // addItem/updateQuantity/removeItem/clearCart retornam o carrinho real
  // atualizado (resposta do backend) — o chamador pode usar isso como fonte
  // imediata de verdade, sem depender de um novo render para ler `items`.
  // Erros propagam (não são engolidos aqui): quem chama decide o que fazer
  // (ex.: não navegar para checkout se a mutação falhou).
  const addItem = async (
    product: Product,
    quantity = 1,
    options?: {
      color?: string;
      size?: string;
      storage?: string;
      kit?: any;
      unitPriceOverride?: number;
      selectedVariantSku?: string;
      selectedVariantImage?: string;
    }
  ) => {
    const updated = await CartService.addItem(product, quantity, options);
    setItems([...updated]);
    return updated;
  };

  const updateQuantity = async (productId: string, quantity: number) => {
    const updated = await CartService.updateQuantity(productId, quantity);
    setItems([...updated]);
    return updated;
  };

  const removeItem = async (productId: string) => {
    const updated = await CartService.removeItem(productId);
    setItems([...updated]);
    return updated;
  };

  const clearCart = async () => {
    const updated = await CartService.clearCart();
    setItems([...updated]);
    return updated;
  };

  const total = items.reduce((acc, item) => {
    const unitPrice = item.unitPriceOverride || item.product.price;
    return acc + unitPrice * item.quantity;
  }, 0);
  const totalCount = items.reduce((acc, item) => acc + item.quantity, 0);

  return {
    items,
    total,
    totalCount,
    isLoading,
    error,
    loadCart,
    addItem,
    updateQuantity,
    removeItem,
    clearCart,
  };
};
