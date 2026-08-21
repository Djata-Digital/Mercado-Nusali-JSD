export type ApiErrorCode = 401 | 403 | 404 | 409 | 422 | 500 | 'OFFLINE' | 'TIMEOUT' | 'UNKNOWN';

export class ApiError extends Error {
  public status: ApiErrorCode;
  public errors?: string[];
  public isOffline: boolean;
  public isTimeout: boolean;

  constructor(
    message: string,
    status: ApiErrorCode = 'UNKNOWN',
    errors?: string[]
  ) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.errors = errors;
    this.isOffline = status === 'OFFLINE';
    this.isTimeout = status === 'TIMEOUT';
    Object.setPrototypeOf(this, ApiError.prototype);
  }

  static fromAxiosError(error: any): ApiError {
    if (error.code === 'ECONNABORTED' || error.message?.includes('timeout')) {
      return new ApiError('A requisição excedeu o tempo limite. Tente novamente.', 'TIMEOUT');
    }
    if (!navigator.onLine || error.message === 'Network Error') {
      return new ApiError('Sem conexão com a internet. Verifique sua rede.', 'OFFLINE');
    }

    const status = (error.response?.status as ApiErrorCode) || 500;
    const message = error.response?.data?.message || error.message || 'Erro inesperado na API NestJS';
    const errors = error.response?.data?.errors;

    return new ApiError(message, status, errors);
  }
}
