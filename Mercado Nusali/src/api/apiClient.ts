import axios, {
  AxiosInstance,
  AxiosRequestConfig,
  AxiosResponse,
  InternalAxiosRequestConfig,
} from 'axios';

import { CONFIG } from '../config';
import { storageService } from '../services/storage/storageService';

export interface ApiResponse<T = any> {
  success: boolean;

  data?: T;

  message?: string;

  error?: {
    code?: string;
    message?: string;
  };

  errors?: string[];

  meta?: {
    page?: number;
    limit?: number;
    total?: number;
  };
}

class ApiClient {
  private instance: AxiosInstance;

  constructor() {
    this.instance = axios.create({
      baseURL: CONFIG.API_URL,
      timeout: CONFIG.TIMEOUT_MS,

      headers: {
        Accept: 'application/json',
      },
    });

    this.setupInterceptors();
  }

  private setupInterceptors(): void {
    this.instance.interceptors.request.use(
      (config: InternalAxiosRequestConfig) => {
        /**
         * IMPORTANTE:
         *
         * Não definir application/json para FormData.
         *
         * O navegador precisa gerar automaticamente:
         *
         * multipart/form-data;
         * boundary=---------------------------
         *
         * Sem o boundary, o Multer não consegue
         * encontrar req.file.
         */
        if (
          typeof FormData !== 'undefined' &&
          config.data instanceof FormData
        ) {
          if (
            config.headers &&
            typeof config.headers.delete === 'function'
          ) {
            config.headers.delete('Content-Type');
          }
        } else {
          /**
           * Requisições JSON normais.
           */
          if (
            config.headers &&
            typeof config.headers.set === 'function'
          ) {
            config.headers.set(
              'Content-Type',
              'application/json'
            );
          }
        }

        /**
         * JWT
         */
        const token = storageService.getToken();

        if (token && config.headers) {
          if (typeof config.headers.set === 'function') {
            config.headers.set('Authorization', `Bearer ${token}`);
          } else {
            (config.headers as any)['Authorization'] = `Bearer ${token}`;
          }
        }

        /**
         * País selecionado.
         */
        const country =
          storageService.getSelectedCountry() ||
          CONFIG.DEFAULT_COUNTRY;

        if (config.headers) {
          if (typeof config.headers.set === 'function') {
            config.headers.set('X-Country-Code', country);
          } else {
            (config.headers as any)['X-Country-Code'] = country;
          }
        }

        return config;
      },

      (error) => Promise.reject(error)
    );

    this.instance.interceptors.response.use(
      (response: AxiosResponse) => response,

      async (error) => {
        const originalRequest = error.config;

        if (
          error.response?.status === 401 &&
          originalRequest &&
          !originalRequest._retry
        ) {
          originalRequest._retry = true;

          try {
            const refreshToken =
              storageService.getRefreshToken();

            if (refreshToken) {
              const res = await axios.post(
                `${CONFIG.API_URL}/auth/refresh`,
                {
                  refreshToken,
                }
              );

              const newToken =
                res.data?.data?.token;

              if (!newToken) {
                throw new Error(
                  'Refresh token não retornou novo access token.'
                );
              }

              storageService.setToken(newToken);

              originalRequest.headers =
                originalRequest.headers || {};

              originalRequest.headers.Authorization =
                `Bearer ${newToken}`;

              return this.instance(originalRequest);
            }
          } catch (refreshErr) {
            storageService.removeToken();
            storageService.removeUser();
            storageService.removeRefreshToken();
            if (typeof window !== 'undefined') {
              window.dispatchEvent(new CustomEvent('nusali:auth_expired'));
            }
          }
        }

        return Promise.reject(error);
      }
    );
  }

  public async get<T>(
    url: string,
    config?: AxiosRequestConfig
  ): Promise<ApiResponse<T>> {
    const res =
      await this.instance.get<ApiResponse<T>>(
        url,
        config
      );

    return res.data;
  }

  public async post<T>(
    url: string,
    data?: any,
    config?: AxiosRequestConfig
  ): Promise<ApiResponse<T>> {
    const res =
      await this.instance.post<ApiResponse<T>>(
        url,
        data,
        config
      );

    return res.data;
  }

  public async put<T>(
    url: string,
    data?: any,
    config?: AxiosRequestConfig
  ): Promise<ApiResponse<T>> {
    const res =
      await this.instance.put<ApiResponse<T>>(
        url,
        data,
        config
      );

    return res.data;
  }

  public async patch<T>(
    url: string,
    data?: any,
    config?: AxiosRequestConfig
  ): Promise<ApiResponse<T>> {
    const res =
      await this.instance.patch<ApiResponse<T>>(
        url,
        data,
        config
      );

    return res.data;
  }

  public async delete<T>(
    url: string,
    config?: AxiosRequestConfig
  ): Promise<ApiResponse<T>> {
    const res =
      await this.instance.delete<ApiResponse<T>>(
        url,
        config
      );

    return res.data;
  }

  public getAxiosInstance(): AxiosInstance {
    return this.instance;
  }
}

export const apiClient = new ApiClient();