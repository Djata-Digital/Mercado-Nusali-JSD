import { storageService } from './storage/storageService';

export class TokenService {
  static getToken(): string | null {
    return storageService.getToken();
  }

  static setToken(token: string): void {
    storageService.setToken(token);
  }

  static removeToken(): void {
    storageService.removeToken();
  }
}

export class AuthStorage {
  static getUser(): any {
    return storageService.getUser();
  }

  static setUser(user: any): void {
    storageService.setUser(user);
  }

  static removeUser(): void {
    storageService.removeUser();
  }

  static isAuthenticated(): boolean {
    return !!storageService.getToken();
  }

  static clear(): void {
    storageService.clearAll();
  }
}

export class RefreshTokenStorage {
  static getRefreshToken(): string | null {
    return storageService.getRefreshToken();
  }

  static setRefreshToken(token: string): void {
    storageService.setRefreshToken(token);
  }

  static removeRefreshToken(): void {
    storageService.removeRefreshToken();
  }
}
