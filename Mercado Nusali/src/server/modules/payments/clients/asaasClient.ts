import { validateAsaasConfig } from '../config/asaasConfig.js';
import { logger } from '../../../infra/logger.js';

export interface AsaasRequestOptions {
  method?: string;
  data?: any;
  params?: Record<string, string>;
  timeoutMs?: number;
}

export class AsaasClient {
  static async request<T = any>(endpoint: string, options: AsaasRequestOptions = {}): Promise<T> {
    const config = validateAsaasConfig();
    const url = new URL(`${config.baseUrl}${endpoint.startsWith('/') ? '' : '/'}${endpoint}`);

    if (options.params) {
      Object.entries(options.params).forEach(([k, v]) => {
        if (v !== undefined && v !== null) {
          url.searchParams.append(k, String(v));
        }
      });
    }

    const timeout = options.timeoutMs || 10000;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'accept': 'application/json',
      'access_token': config.apiKey,
      'User-Agent': config.userAgent,
    };

    const method = (options.method || 'GET').toUpperCase();

    try {
      const response = await fetch(url.toString(), {
        method,
        headers,
        body: options.data ? JSON.stringify(options.data) : undefined,
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      const status = response.status;
      let responseData: any;
      const contentType = response.headers.get('content-type');

      if (contentType && contentType.includes('application/json')) {
        responseData = await response.json();
      } else {
        responseData = await response.text();
      }

      if (!response.ok) {
        let errorCode = 'ASAAS_PROVIDER_UNAVAILABLE';
        let errorMessage = `Erro na API do Asaas (Status ${status}).`;

        if (status === 401 || status === 403) {
          errorCode = 'ASAAS_AUTHENTICATION_ERROR';
          errorMessage = 'Falha de autenticação com a API do Asaas. Verifique se a ASAAS_API_KEY no arquivo .env é válida.';
        } else if (status === 400 || status === 422) {
          errorCode = 'ASAAS_VALIDATION_ERROR';
          if (typeof responseData === 'object' && Array.isArray(responseData?.errors) && responseData.errors[0]?.description) {
            errorMessage = responseData.errors[0].description;
          } else {
            errorMessage = 'Requisição enviada com parâmetros inválidos ao Asaas.';
          }
        } else if (status === 429) {
          errorCode = 'ASAAS_RATE_LIMITED';
          errorMessage = 'Limite de requisições excedido na API do Asaas (Rate Limited).';
        } else if (status >= 500) {
          errorCode = 'ASAAS_PROVIDER_UNAVAILABLE';
          errorMessage = 'Serviço da API do Asaas temporariamente indisponível.';
        }

        logger.warn({
          endpoint,
          method,
          status,
          errorCode,
        }, `[AsaasClient Error] ${errorMessage}`);

        const err: any = new Error(errorMessage);
        err.code = errorCode;
        err.status = status;
        err.details = typeof responseData === 'object' ? responseData : { body: responseData };
        throw err;
      }

      return responseData as T;
    } catch (err: any) {
      clearTimeout(timeoutId);

      if (err.name === 'AbortError') {
        const timeoutErr: any = new Error(`Tempo limite de requisição excedido ao conectar com o Asaas (${timeout}ms).`);
        timeoutErr.code = 'ASAAS_NETWORK_ERROR';
        logger.error({ endpoint, method, timeout }, '[AsaasClient Timeout] ASAAS_NETWORK_ERROR');
        throw timeoutErr;
      }

      if (err.code && err.code.startsWith('ASAAS_')) {
        throw err;
      }

      const networkErr: any = new Error(`Falha de rede ao conectar com o Asaas: ${err.message}`);
      networkErr.code = 'ASAAS_NETWORK_ERROR';
      logger.error({ endpoint, method, message: err.message }, '[AsaasClient Network Error] ASAAS_NETWORK_ERROR');
      throw networkErr;
    }
  }
}
