import { useState, useEffect } from 'react';
import { CartService } from '../services/cartService';
import { storageService } from '../services/storage/storageService';
import { CartItem, Product } from '../types';

export const useCart = () => {
  const [items, setItems] = useState<CartItem[]>(() => CartService.getCart());

  const loadCart = async () => {
    const token = storageService.getToken();
    if (token) {
      const serverItems = await CartService.fetchServerCart();
      setItems(serverItems);
    } else {
      setItems(CartService.getCart());
    }
  };

  useEffect(() => {
    loadCart();
  }, []);

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
  };

  const updateQuantity = async (productId: string, quantity: number) => {
    const updated = await CartService.updateQuantity(productId, quantity);
    setItems([...updated]);
  };

  const removeItem = async (productId: string) => {
    const updated = await CartService.removeItem(productId);
    setItems([...updated]);
  };

  const clearCart = async () => {
    const updated = await CartService.clearCart();
    setItems([...updated]);
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
    loadCart,
    addItem,
    updateQuantity,
    removeItem,
    clearCart,
  };
};
