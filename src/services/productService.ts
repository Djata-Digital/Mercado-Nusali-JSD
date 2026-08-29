import { ApiResponse } from '../api/apiClient';
import { ProductsApi } from '../api/clients/ProductsApi';
import { CategoriesApi } from '../api/clients/CategoriesApi';
import { Product, Category, FilterState } from '../types';
import { normalizeProduct } from '../utils/productUtils';

export const ProductService = {
  async getProducts(filters?: Partial<FilterState>): Promise<ApiResponse<Product[]>> {
    const res = await ProductsApi.list(filters as any);
    const rawItems = res.data?.items || (Array.isArray(res.data) ? res.data : []);
    // Correção pré-piloto (condição/preço): GET /products (catálogo/busca/
    // loja) retorna o produto cru do banco — sem normalizar, ProductCard
    // comparava condition==='novo' contra o valor cru 'new' e nunca batia,
    // sempre caindo em "Usado". normalizeProduct é a mesma fonte já usada
    // pelo ProductDetailView, agora aplicada aqui também.
    return {
      success: res.success,
      data: rawItems.map(normalizeProduct),
      message: res.message,
    };
  },

  async getProductById(id: string, destinationCountry?: string): Promise<ApiResponse<Product | null>> {
    return ProductsApi.getById(id, destinationCountry);
  },

  async getCategories(): Promise<ApiResponse<Category[]>> {
    return CategoriesApi.list();
  },

  async getBrands(): Promise<ApiResponse<string[]>> {
    const res = await ProductsApi.filters();
    return {
      success: res.success,
      data: res.data?.brands || [],
    };
  },

  async createProduct(productData: Partial<Product>): Promise<ApiResponse<Product>> {
    return ProductsApi.create(productData);
  }
};

