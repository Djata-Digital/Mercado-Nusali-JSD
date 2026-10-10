import { apiClient, ApiResponse } from '../apiClient';
import { ProductFilters, PaginatedResponse } from '../types';

export class ProductsApi {
  static async list(params?: ProductFilters): Promise<ApiResponse<PaginatedResponse<any>>> {
    return apiClient.get('/products', { params });
  }

  // P3 — busca/categoria com filtros por característica, pesquisa em atributos, ordenação e paginação NO SERVIDOR. A resposta traz
  // `pagination` (total, page, limit, totalPages) ao lado de `data`; parâmetros: ver utils/catalogQuery.ts.
  static async search(params: Record<string, string | number>): Promise<ApiResponse<any[]> & { pagination?: { total: number; page: number; limit: number; totalPages: number } }> {
    return apiClient.get('/products', { params }) as any;
  }

  // P3 — opções de filtro (marca, condição, preço e características da categoria) da busca atual.
  static async facets(params: Record<string, string | number>): Promise<ApiResponse<any>> {
    return apiClient.get('/products/facets', { params });
  }

  static async getById(id: string, destinationCountry?: string): Promise<ApiResponse<any>> {
    return apiClient.get(`/products/${id}`, destinationCountry ? { params: { destinationCountry } } : undefined);
  }

  // FASE D17-B2 — produtos relacionados/mesma loja/você também pode gostar.
  // Mesma convenção de destinationCountry/originCountryFilter já usada pelo
  // resto do catálogo (Home/Search/Store/Favorites) — nunca inventa um
  // código de país quando catalogOriginFilter representar "Todos" ('ALL'):
  // o próprio backend já trata 'ALL' como "sem filtro de origem" (mesma
  // semântica de CatalogService.getProducts), então é passado tal como está.
  static async getRecommendations(id: string, params?: { destinationCountry?: string; originCountryFilter?: string }): Promise<ApiResponse<any>> {
    const query: Record<string, string> = {};
    if (params?.destinationCountry) query.destinationCountry = params.destinationCountry;
    if (params?.originCountryFilter) query.originCountryFilter = params.originCountryFilter;
    return apiClient.get(`/products/${id}/recommendations`, Object.keys(query).length > 0 ? { params: query } : undefined);
  }

  // FASE D17-C4 — Perguntas e Respostas reais. GET público (sem token
  // obrigatório); POST exige sessão autenticada no backend (requireAuth) —
  // productId sempre vem da URL, nunca do corpo.
  static async getQuestions(productId: string): Promise<ApiResponse<any[]>> {
    return apiClient.get(`/products/${productId}/questions`);
  }

  static async createQuestion(productId: string, question: string): Promise<ApiResponse<any>> {
    return apiClient.post(`/products/${productId}/questions`, { question });
  }

  static async create(data: any): Promise<ApiResponse<any>> {
    return apiClient.post('/products', data);
  }

  static async update(id: string, data: any): Promise<ApiResponse<any>> {
    return apiClient.patch(`/products/${id}`, data);
  }

  static async delete(id: string): Promise<ApiResponse<any>> {
    return apiClient.delete(`/products/${id}`);
  }

  static async filters(): Promise<ApiResponse<any>> {
    return apiClient.get('/products/filters');
  }

  static async pagination(page: number = 1, limit: number = 20, filters?: ProductFilters): Promise<ApiResponse<PaginatedResponse<any>>> {
    return apiClient.get('/products', { params: { page, limit, ...filters } });
  }
}
