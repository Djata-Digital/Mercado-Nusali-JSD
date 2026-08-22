import { storageService } from './storage/storageService';
import { CartItem, Product } from '../types';
import { normalizeProduct } from '../utils/productUtils';
import { CartApi } from '../api/clients/CartApi';

export const CartService = {
  async fetchServerCart(): Promise<CartItem[]> {
    const token = storageService.getToken();
    if (!token) return [];

    const res = await CartApi.list();
    if (res && res.success && res.data && Array.isArray(res.data.items)) {
      const serverItems = res.data.items.map((item: any) => ({
        id: item.id,
        product: normalizeProduct(item.product),
        quantity: Number(item.quantity) || 1,
        selectedColor: item.selectedAttributes?.color,
        selectedSize: item.selectedAttributes?.size,
        selectedStorage: item.selectedAttributes?.storage,
        unitPriceOverride: Number(item.unitPrice),
        selectedVariantSku: item.variantId || undefined,
      }));
      return serverItems;
    }
    const msg = res?.error?.message || 'Falha ao buscar carrinho do servidor.';
    throw new Error(msg);
  },

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

  async addItem(
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
  ): Promise<CartItem[]> {
    const token = storageService.getToken();
    if (token) {
      const res = await CartApi.create({
        productId: product.id,
        quantity,
        variantId: options?.selectedVariantSku,
        options,
      });
      if (res && res.success) {
        return await this.fetchServerCart();
      }
      const errorMsg = res?.error?.message || 'Erro ao adicionar produto ao carrinho no servidor.';
      throw new Error(errorMsg);
    }

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
        id: `ci_local_${Date.now()}`,
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

  async updateQuantity(productIdOrItemId: string, quantity: number): Promise<CartItem[]> {
    const token = storageService.getToken();
    if (token) {
      const res = await CartApi.update(productIdOrItemId, { quantity });
      if (res && res.success) {
        return await this.fetchServerCart();
      }
      const errorMsg = res?.error?.message || 'Erro ao atualizar quantidade no servidor.';
      throw new Error(errorMsg);
    }

    let current = this.getCart();
    if (quantity <= 0) {
      return this.removeItem(productIdOrItemId);
    } else {
      const target = current.find(item => item.id === productIdOrItemId || item.product.id === productIdOrItemId);
      if (target) target.quantity = quantity;
    }
    this.setCart(current);
    return current;
  },

  async removeItem(productIdOrItemId: string): Promise<CartItem[]> {
    const token = storageService.getToken();
    if (token) {
      const res = await CartApi.delete(productIdOrItemId);
      if (res && res.success) {
        return await this.fetchServerCart();
      }
      const errorMsg = res?.error?.message || 'Erro ao remover item no servidor.';
      throw new Error(errorMsg);
    }

    const filtered = this.getCart().filter(item => item.id !== productIdOrItemId && item.product.id !== productIdOrItemId);
    this.setCart(filtered);
    return filtered;
  },

  async clearCart(): Promise<CartItem[]> {
    const token = storageService.getToken();
    if (token) {
      const res = await CartApi.clear();
      if (res && res.success) {
        return [];
      }
      const errorMsg = res?.error?.message || 'Erro ao limpar carrinho no servidor.';
      throw new Error(errorMsg);
    }

    this.setCart([]);
    return [];
  },
};
