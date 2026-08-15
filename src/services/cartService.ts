import { storageService } from './storage/storageService';
import { CartItem, Product } from '../types';
import { normalizeProduct } from '../utils/productUtils';

export const CartService = {
  getCart(): CartItem[] {
    const raw = storageService.getCart<CartItem[]>() || [];
    if (!Array.isArray(raw)) return [];
    return raw.map(item => ({
      ...item,
      product: normalizeProduct(item?.product),
    }));
  },

  setCart(items: CartItem[]): void {
    storageService.setCart(items);
  },

  addItem(
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
  ): CartItem[] {
    const normalizedProd = normalizeProduct(product);
    const current = this.getCart();
    const existingIndex = current.findIndex(
      item =>
        item.product.id === normalizedProd.id &&
        item.selectedColor === options?.color &&
        item.selectedSize === options?.size &&
        item.selectedStorage === options?.storage &&
        item.selectedKit?.id === options?.kit?.id &&
        item.selectedVariantSku === options?.selectedVariantSku
    );

    if (existingIndex >= 0) {
      current[existingIndex].quantity += quantity;
    } else {
      current.push({
        product: normalizedProd,
        quantity,
        selectedColor: options?.color,
        selectedSize: options?.size,
        selectedStorage: options?.storage,
        selectedKit: options?.kit,
        unitPriceOverride: options?.unitPriceOverride,
        selectedVariantSku: options?.selectedVariantSku,
        selectedVariantImage: options?.selectedVariantImage,
      });
    }

    this.setCart(current);
    return current;
  },

  updateQuantity(productId: string, quantity: number): CartItem[] {
    let current = this.getCart();
    if (quantity <= 0) {
      current = current.filter(item => item.product.id !== productId);
    } else {
      const target = current.find(item => item.product.id === productId);
      if (target) target.quantity = quantity;
    }
    this.setCart(current);
    return current;
  },

  removeItem(productId: string): CartItem[] {
    const filtered = this.getCart().filter(item => item.product.id !== productId);
    this.setCart(filtered);
    return filtered;
  },

  clearCart(): void {
    this.setCart([]);
  }
};
