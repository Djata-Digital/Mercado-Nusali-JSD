import { apiClient, ApiResponse } from '../apiClient';
import type { BannerBgStyle, BannerCtaType, BannerStatus } from '../../utils/bannerRules';

/** Banner público (GET /banners/active): somente campos públicos. */
export interface PublicBanner {
  id: string;
  title: string;
  subtitle: string | null;
  tagText: string | null;
  badgeText: string | null;
  ctaLabel: string | null;
  ctaType: BannerCtaType | null;
  ctaTarget: string | null;
  desktopImageUrl: string | null;
  mobileImageUrl: string | null;
  bgStyle: BannerBgStyle;
}

export type BannerState = 'draft' | 'inactive' | 'scheduled' | 'live' | 'expired';

/** Banner no painel (GLOBAL_ADMIN). */
export interface AdminBanner extends Omit<PublicBanner, 'ctaLabel' | 'ctaType' | 'ctaTarget'> {
  ctaLabel: string | null;
  ctaType: BannerCtaType | null;
  ctaTarget: string | null;
  desktopImageKey: string | null;
  mobileImageKey: string | null;
  sortOrder: number;
  status: BannerStatus;
  startsAt: string | null;
  endsAt: string | null;
  countryCode: string | null;
  isGlobal: boolean;
  state: BannerState;
  createdBy: string | null;
  updatedBy: string | null;
  createdAt: string;
  updatedAt: string;
}

/** Campos editáveis (a URL da imagem nunca é enviada: o servidor a deriva da chave devolvida pelo upload). */
export interface BannerInput {
  title: string;
  subtitle?: string | null;
  tagText?: string | null;
  badgeText?: string | null;
  ctaLabel?: string | null;
  ctaType?: BannerCtaType | null;
  ctaTarget?: string | null;
  desktopImageKey?: string | null;
  mobileImageKey?: string | null;
  bgStyle?: BannerBgStyle;
  sortOrder?: number;
  startsAt?: string | null;
  endsAt?: string | null;
  countryCode?: string | null;
  status?: BannerStatus;
}

export interface BannerImagePolicy {
  recommended: { width: number; height: number };
  minWidth: number; maxWidth: number; minHeight: number; maxHeight: number;
  maxBytes: number;
}
export interface BannerUploadResult {
  kind: 'desktop' | 'mobile';
  url: string;
  objectKey: string;
  width: number;
  height: number;
  size: number;
  mimeType: string;
}

/** Mensagem legível de um erro de API de banners (axios ou ApiResponse). */
export function bannerErrorMessage(error: any, fallback = 'Não foi possível concluir a operação.'): string {
  const fields = error?.response?.data?.error?.fields;
  const msg = error?.response?.data?.error?.message || error?.error?.message || error?.message;
  if (fields && typeof fields === 'object') {
    const first = Object.values(fields)[0];
    if (typeof first === 'string') return first;
  }
  if (typeof msg === 'string' && msg && !/^Request failed with status code/.test(msg)) return msg;
  const status = error?.response?.status;
  if (status === 403) return 'Somente o Administrador Geral pode gerenciar os banners da home.';
  if (status === 401) return 'Sessão expirada. Entre novamente.';
  if (status === 413) return 'A imagem excede o tamanho máximo permitido.';
  return fallback;
}

export class BannersApi {
  /** Público. Timeout curto: a home nunca espera a API (usa os slides embutidos enquanto isso/em falha). */
  static async active(country?: string): Promise<ApiResponse<PublicBanner[]>> {
    return apiClient.get('/banners/active', { params: country ? { country } : undefined, timeout: 5000 });
  }

  // ---- administrativo (GLOBAL_ADMIN) ----
  static async list(params?: { status?: string; country?: string }): Promise<ApiResponse<AdminBanner[]> & { meta?: any }> {
    return apiClient.get('/admin/banners', { params });
  }
  static async create(data: BannerInput): Promise<ApiResponse<AdminBanner>> {
    return apiClient.post('/admin/banners', data);
  }
  static async update(id: string, data: Partial<BannerInput>): Promise<ApiResponse<AdminBanner>> {
    return apiClient.patch(`/admin/banners/${encodeURIComponent(id)}`, data);
  }
  static async setStatus(id: string, status: 'active' | 'inactive'): Promise<ApiResponse<AdminBanner>> {
    return apiClient.patch(`/admin/banners/${encodeURIComponent(id)}/status`, { status });
  }
  static async duplicate(id: string): Promise<ApiResponse<AdminBanner>> {
    return apiClient.post(`/admin/banners/${encodeURIComponent(id)}/duplicate`, {});
  }
  static async reorder(ids: string[]): Promise<ApiResponse<AdminBanner[]>> {
    return apiClient.put('/admin/banners/order', { ids });
  }
  static async remove(id: string): Promise<ApiResponse<{ id: string }>> {
    return apiClient.delete(`/admin/banners/${encodeURIComponent(id)}`);
  }
  static async upload(kind: 'desktop' | 'mobile', file: File): Promise<ApiResponse<BannerUploadResult>> {
    const form = new FormData();
    form.append('file', file);
    return apiClient.post(`/admin/banners/upload?kind=${kind}`, form);
  }
}
