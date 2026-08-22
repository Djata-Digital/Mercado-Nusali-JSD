import { ApiResponse } from '../api/apiClient';
import { AuthApi } from '../api/clients/AuthApi';
import {
  User,
  LoginRequest,
  LoginResponse,
  RegisterRequest,
  RegisterResponse,
  ForgotPasswordRequest,
  ResetPasswordRequest,
  VerifyEmailRequest,
  VerifyPhoneRequest,
  ChangePasswordRequest,
  AuthSession,
} from '../types';
import { storageService } from './storage/storageService';

export const AuthService = {
  async login(credentials: LoginRequest): Promise<ApiResponse<LoginResponse>> {
    const res = await AuthApi.login({
      ...credentials,
      email: credentials.identifier?.trim().toLowerCase(),
    } as any);

    if (res.success && res.data?.token) {
      storageService.setToken(res.data.token);
      storageService.setUser(res.data.user);

      if (res.data.refreshToken) {
        storageService.setRefreshToken(res.data.refreshToken);
      }
    }

    return res as ApiResponse<LoginResponse>;
  },

  async register(data: RegisterRequest): Promise<ApiResponse<RegisterResponse>> {
    const fullName = `${data.firstName || ''} ${data.lastName || ''}`.trim();

    const phone =
      data.phoneCode && data.phone
        ? `${data.phoneCode}${data.phone}`.replace(/\s+/g, '')
        : data.phone || '';

    const payload = {
      email: data.email.trim().toLowerCase(),
      password: data.password,
      fullName,
      phone,
      countryCode: data.country || 'GW',
      role: data.role || 'BUYER',
    };

    const res = await AuthApi.register(payload as any);

    if (res.success && res.data?.token) {
      storageService.setToken(res.data.token);
      storageService.setUser(res.data.user);

      if (res.data.refreshToken) {
        storageService.setRefreshToken(res.data.refreshToken);
      }
    }

    return res as ApiResponse<RegisterResponse>;
  },

  async me(): Promise<ApiResponse<User>> {
    return AuthApi.getProfile();
  },

  async forgotPassword(data: ForgotPasswordRequest): Promise<ApiResponse<{ message: string; methodSent: string }>> {
    return AuthApi.forgotPassword(data);
  },

  async resetPassword(data: ResetPasswordRequest): Promise<ApiResponse<{ message: string }>> {
    return AuthApi.resetPassword(data);
  },

  async verifyEmail(data: VerifyEmailRequest): Promise<ApiResponse<{ user: User; token?: string; refreshToken?: string; message: string }>> {
    const res = await AuthApi.verifyEmail(data);

    if (res.success && res.data?.user) {
      storageService.setUser(res.data.user);
      const token = (res.data as any)?.token;
      if (token) {
        storageService.setToken(token);
      }
    }
    return res;
  },

  async verifyPhone(data: VerifyPhoneRequest): Promise<ApiResponse<{ user: User; message: string }>> {
    const res = await AuthApi.verifyPhone(data);

    if (res.success && res.data?.user) {
      storageService.setUser(res.data.user);
    }
    return res;
  },

  async resendVerification(type: 'email' | 'phone', email?: string): Promise<ApiResponse<{ message: string }>> {
    return AuthApi.resendVerification(type, email);
  },

  async changePassword(data: ChangePasswordRequest): Promise<ApiResponse<{ message: string }>> {
    return AuthApi.changePassword(data);
  },

  async getSessions(): Promise<ApiResponse<AuthSession[]>> {
    return AuthApi.getSessions();
  },

  async revokeSession(id: string): Promise<ApiResponse<{ message: string }>> {
    return AuthApi.revokeSession(id);
  },

  async revokeAllOtherSessions(): Promise<ApiResponse<{ message: string }>> {
    return AuthApi.revokeAllOtherSessions();
  },

  async logout(): Promise<void> {
    try {
      await AuthApi.logout();
    } catch (e) {
      // Ignore network errors on logout to ensure client side cleanup occurs
    } finally {
      storageService.removeToken();
      storageService.removeUser();
    }
  },

  getCurrentUser(): User | null {
    return storageService.getUser() as User | null;
  },
};


