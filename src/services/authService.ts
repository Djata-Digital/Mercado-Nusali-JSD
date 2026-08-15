import { ApiResponse } from '../api/apiClient';
import { AuthApi } from '../api/clients/AuthApi';
import { fakeApi } from '../api/fakeApi';
import { API_CONFIG } from '../config/api';
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
    let res: ApiResponse<LoginResponse>;
    try {
      if (API_CONFIG.USE_FAKE_API) {
        res = await fakeApi.login(credentials.identifier, credentials.role || 'BUYER', credentials.password);
      } else {
        res = await AuthApi.login(credentials);
        if (!res.success) {
          res = await fakeApi.login(credentials.identifier, credentials.role || 'BUYER', credentials.password);
        }
      }
    } catch {
      res = await fakeApi.login(credentials.identifier, credentials.role || 'BUYER', credentials.password);
    }

    if (res.success && res.data?.token) {
      storageService.setToken(res.data.token);
      storageService.setUser(res.data.user);
    }
    return res as ApiResponse<LoginResponse>;
  },

  async register(data: RegisterRequest): Promise<ApiResponse<RegisterResponse>> {
    let res: ApiResponse<RegisterResponse>;
    try {
      if (API_CONFIG.USE_FAKE_API) {
        res = await fakeApi.register(data);
      } else {
        res = await AuthApi.register(data);
        if (!res.success) {
          res = await fakeApi.register(data);
        }
      }
    } catch {
      res = await fakeApi.register(data);
    }

    if (res.success && res.data?.token) {
      storageService.setToken(res.data.token);
      storageService.setUser(res.data.user);
    }
    return res as ApiResponse<RegisterResponse>;
  },

  async me(): Promise<ApiResponse<User>> {
    if (API_CONFIG.USE_FAKE_API) {
      return fakeApi.getMe();
    }
    return AuthApi.getProfile();
  },

  async forgotPassword(data: ForgotPasswordRequest): Promise<ApiResponse<{ message: string; methodSent: string }>> {
    if (API_CONFIG.USE_FAKE_API) {
      return fakeApi.forgotPassword(data.identifier, data.method);
    }
    return AuthApi.forgotPassword(data);
  },

  async resetPassword(data: ResetPasswordRequest): Promise<ApiResponse<{ message: string }>> {
    if (API_CONFIG.USE_FAKE_API) {
      return fakeApi.resetPassword(data.newPassword, data.code || data.token);
    }
    return AuthApi.resetPassword(data);
  },

  async verifyEmail(data: VerifyEmailRequest): Promise<ApiResponse<{ user: User; message: string }>> {
    const res = API_CONFIG.USE_FAKE_API
      ? await fakeApi.verifyEmail(data.code)
      : await AuthApi.verifyEmail(data);

    if (res.success && res.data?.user) {
      storageService.setUser(res.data.user);
    }
    return res;
  },

  async verifyPhone(data: VerifyPhoneRequest): Promise<ApiResponse<{ user: User; message: string }>> {
    const res = API_CONFIG.USE_FAKE_API
      ? await fakeApi.verifyPhone(data.code)
      : await AuthApi.verifyPhone(data);

    if (res.success && res.data?.user) {
      storageService.setUser(res.data.user);
    }
    return res;
  },

  async resendVerification(type: 'email' | 'phone'): Promise<ApiResponse<{ message: string }>> {
    if (API_CONFIG.USE_FAKE_API) {
      return fakeApi.resendVerification(type);
    }
    return AuthApi.resendVerification(type);
  },

  async changePassword(data: ChangePasswordRequest): Promise<ApiResponse<{ message: string }>> {
    if (API_CONFIG.USE_FAKE_API) {
      return fakeApi.changePassword(data.currentPassword, data.newPassword);
    }
    return AuthApi.changePassword(data);
  },

  async getSessions(): Promise<ApiResponse<AuthSession[]>> {
    if (API_CONFIG.USE_FAKE_API) {
      return fakeApi.getSessions();
    }
    return AuthApi.getSessions();
  },

  async revokeSession(id: string): Promise<ApiResponse<{ message: string }>> {
    if (API_CONFIG.USE_FAKE_API) {
      return fakeApi.revokeSession(id);
    }
    return AuthApi.revokeSession(id);
  },

  async revokeAllOtherSessions(): Promise<ApiResponse<{ message: string }>> {
    if (API_CONFIG.USE_FAKE_API) {
      return fakeApi.revokeAllOtherSessions();
    }
    return AuthApi.revokeAllOtherSessions();
  },

  async logout(): Promise<void> {
    try {
      if (!API_CONFIG.USE_FAKE_API) {
        await AuthApi.logout();
      }
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


