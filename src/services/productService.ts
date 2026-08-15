import { ApiResponse } from '../api/apiClient';
import { ProductsApi } from '../api/clients/ProductsApi';
import { CategoriesApi } from '../api/clients/CategoriesApi';
import { fakeApi } from '../api/fakeApi';
import { API_CONFIG } from '../config/api';
import { Product, Category, FilterState } from '../types';

export const ProductService = {
  async getProducts(filters?: Partial<FilterState>): Promise<ApiResponse<Product[]>> {
    if (API_CONFIG.USE_FAKE_API) {
      return fakeApi.getProducts(filters);
    }
    const res = await ProductsApi.list(filters as any);
    return {
      success: res.success,
      data: res.data?.items || (res.data as any) || [],
      message: res.message,
    };
  },

  async getProductById(id: string): Promise<ApiResponse<Product | null>> {
    if (API_CONFIG.USE_FAKE_API) {
      return fakeApi.getProductById(id);
    }
    return ProductsApi.getById(id);
  },

  async getCategories(): Promise<ApiResponse<Category[]>> {
    if (API_CONFIG.USE_FAKE_API) {
      return fakeApi.getCategories();
    }
    return CategoriesApi.list();
  },

  async getBrands(): Promise<ApiResponse<string[]>> {
    if (API_CONFIG.USE_FAKE_API) {
      return fakeApi.getBrands();
    }
    return ProductsApi.filters().then(res => ({
      success: res.success,
      data: res.data?.brands || ['Nusali', 'Apple', 'Samsung'],
    }));
  },

  async createProduct(productData: Partial<Product>): Promise<ApiResponse<Product>> {
    if (API_CONFIG.USE_FAKE_API) {
      return {
        success: true,
        data: {
          id: 'prod_' + Date.now(),
          title: productData.title || 'Novo Produto',
          price: productData.price || 1000,
          currency: 'XOF',
          installmentsMax: 6,
          installmentsInterestFree: true,
          image: productData.image || 'https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=500',
          galleryImages: [productData.image || 'https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=500'],
          category: productData.category || 'Eletrônicos',
          categorySlug: 'eletronicos',
          condition: 'novo',
          brand: productData.brand || 'Nusali',
          model: '2026',
          rating: 5.0,
          reviewsCount: 1,
          seller: {
            id: 'seller_001',
            name: 'Vendedor Oficial Bissau',
            reputationLevel: 'platinum',
            reputationScore: 5.0,
            salesCount: 150,
            location: { city: 'Bissau', state: 'Setor Autónomo' },
            goodService: true,
            onTimeDelivery: true,
          },
          shipping: { freeShipping: true, arrivesTomorrow: true, shippingPrice: 0, fullFulfilled: true, originCountry: 'GW' },
          stock: productData.stock || 50,
          salesCount: 0,
          description: productData.description || 'Descrição do produto',
          specs: {},
          questions: [],
          reviews: [],
        },
        message: 'Produto cadastrado com sucesso no catálogo CPLP!',
      };
    }
    return ProductsApi.create(productData);
  }
};

