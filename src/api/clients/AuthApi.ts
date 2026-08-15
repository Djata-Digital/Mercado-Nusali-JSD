import { apiClient, ApiResponse } from '../apiClient';
import {
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
  User,
} from '../../types';

export class AuthApi {
  static async login(credentials: LoginRequest): Promise<ApiResponse<LoginResponse>> {
    return apiClient.post('/auth/login', credentials);
  }

  static async register(data: RegisterRequest): Promise<ApiResponse<RegisterResponse>> {
    return apiClient.post('/auth/register', data);
  }

  static async logout(): Promise<ApiResponse<{ message: string }>> {
    return apiClient.post('/auth/logout');
  }

  static async refreshToken(refreshToken: string): Promise<ApiResponse<{ token: string; refreshToken: string }>> {
    return apiClient.post('/auth/refresh', { refreshToken });
  }

  static async getProfile(): Promise<ApiResponse<User>> {
    return apiClient.get('/auth/me');
  }

  static async updateProfile(data: Partial<User>): Promise<ApiResponse<User>> {
    return apiClient.patch('/auth/me', data);
  }

  static async forgotPassword(data: ForgotPasswordRequest): Promise<ApiResponse<{ message: string; methodSent: string }>> {
    return apiClient.post('/auth/forgot-password', data);
  }

  static async resetPassword(data: ResetPasswordRequest): Promise<ApiResponse<{ message: string }>> {
    return apiClient.post('/auth/reset-password', data);
  }

  static async verifyEmail(data: VerifyEmailRequest): Promise<ApiResponse<{ user: User; message: string }>> {
    return apiClient.post('/auth/verify-email', data);
  }

  static async verifyPhone(data: VerifyPhoneRequest): Promise<ApiResponse<{ user: User; message: string }>> {
    return apiClient.post('/auth/verify-phone', data);
  }

  static async resendVerification(type: 'email' | 'phone', email?: string): Promise<ApiResponse<{ message: string }>> {
    return apiClient.post('/auth/resend-verification', { type, email });
  }

  static async changePassword(data: ChangePasswordRequest): Promise<ApiResponse<{ message: string }>> {
    return apiClient.post('/auth/change-password', data);
  }

  static async getSessions(): Promise<ApiResponse<AuthSession[]>> {
    return apiClient.get('/auth/sessions');
  }

  static async revokeSession(id: string): Promise<ApiResponse<{ message: string }>> {
    return apiClient.delete(`/auth/sessions/${id}`);
  }

  static async revokeAllOtherSessions(): Promise<ApiResponse<{ message: string }>> {
    return apiClient.delete('/auth/sessions/revoke-others');
  }
}

