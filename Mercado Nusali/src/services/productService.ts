import { ApiResponse } from '../api/apiClient';
import { ProductsApi } from '../api/clients/ProductsApi';
import { CategoriesApi } from '../api/clients/CategoriesApi';
import { Product, Category, FilterState } from '../types';

export const ProductService = {
  async getProducts(filters?: Partial<FilterState>): Promise<ApiResponse<Product[]>> {
    const res = await ProductsApi.list(filters as any);
    return {
      success: res.success,
      data: res.data?.items || (Array.isArray(res.data) ? res.data : []),
      message: res.message,
    };
  },

  async getProductById(id: string): Promise<ApiResponse<Product | null>> {
    return ProductsApi.getById(id);
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

