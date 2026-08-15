import { useState, useEffect } from 'react';
import { CartService } from '../services/cartService';
import { CartItem, Product } from '../types';

export const useCart = () => {
  const [items, setItems] = useState<CartItem[]>(() => CartService.getCart());

  useEffect(() => {
    setItems(CartService.getCart());
  }, []);

  const addItem = (
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
    const updated = CartService.addItem(product, quantity, options);
    setItems([...updated]);
  };

  const updateQuantity = (productId: string, quantity: number) => {
    const updated = CartService.updateQuantity(productId, quantity);
    setItems([...updated]);
  };

  const removeItem = (productId: string) => {
    const updated = CartService.removeItem(productId);
    setItems([...updated]);
  };

  const clearCart = () => {
    CartService.clearCart();
    setItems([]);
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
    addItem,
    updateQuantity,
    removeItem,
    clearCart,
  };
};
