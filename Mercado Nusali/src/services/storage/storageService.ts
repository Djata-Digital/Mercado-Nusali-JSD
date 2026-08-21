const TOKEN_KEY = 'nusali_auth_token';
const REFRESH_TOKEN_KEY = 'nusali_refresh_token';
const USER_KEY = 'nusali_user_session';
const CART_KEY = 'nusali_cart_items';
const FAVORITES_KEY = 'nusali_favorites';
const COUNTRY_KEY = 'nusali_selected_country';

export interface StorageUser {
  id: string;
  name: string;
  email: string;
  role: string;
  avatar?: string;
  country?: string;
  sellerId?: string;
}

export const storageService = {
  getToken(): string | null {
    try {
      return (
        localStorage.getItem(TOKEN_KEY) ||
        localStorage.getItem('token') ||
        localStorage.getItem('auth_token') ||
        localStorage.getItem('access_token') ||
        null
      );
    } catch {
      return null;
    }
  },

  setToken(token: string): void {
    try {
      localStorage.setItem(TOKEN_KEY, token);
    } catch (e) {
      console.error('Failed to set token in storage', e);
    }
  },

  removeToken(): void {
    try {
      localStorage.removeItem(TOKEN_KEY);
      localStorage.removeItem(REFRESH_TOKEN_KEY);
    } catch (e) {
      console.error('Failed to remove token from storage', e);
    }
  },

  getRefreshToken(): string | null {
    try {
      return localStorage.getItem(REFRESH_TOKEN_KEY);
    } catch {
      return null;
    }
  },

  setRefreshToken(token: string): void {
    try {
      localStorage.setItem(REFRESH_TOKEN_KEY, token);
    } catch (e) {
      console.error('Failed to set refresh token', e);
    }
  },

  removeRefreshToken(): void {
    try {
      localStorage.removeItem(REFRESH_TOKEN_KEY);
    } catch (e) {
      console.error('Failed to remove refresh token', e);
    }
  },

  getUser(): StorageUser | null {
    try {
      const data = localStorage.getItem(USER_KEY);
      return data ? JSON.parse(data) : null;
    } catch {
      return null;
    }
  },

  setUser(user: StorageUser): void {
    try {
      localStorage.setItem(USER_KEY, JSON.stringify(user));
    } catch (e) {
      console.error('Failed to set user session', e);
    }
  },

  removeUser(): void {
    try {
      localStorage.removeItem(USER_KEY);
    } catch (e) {
      console.error('Failed to remove user session', e);
    }
  },

  getCart<T>(): T | null {
    try {
      const data = localStorage.getItem(CART_KEY);
      return data ? JSON.parse(data) : null;
    } catch {
      return null;
    }
  },

  setCart<T>(cart: T): void {
    try {
      localStorage.setItem(CART_KEY, JSON.stringify(cart));
    } catch (e) {
      console.error('Failed to set cart', e);
    }
  },

  getFavorites(): string[] {
    try {
      const data = localStorage.getItem(FAVORITES_KEY);
      return data ? JSON.parse(data) : [];
    } catch {
      return [];
    }
  },

  setFavorites(favorites: string[]): void {
    try {
      localStorage.setItem(FAVORITES_KEY, JSON.stringify(favorites));
    } catch (e) {
      console.error('Failed to set favorites', e);
    }
  },

  getSelectedCountry(): string | null {
    try {
      return localStorage.getItem(COUNTRY_KEY);
    } catch {
      return null;
    }
  },

  setSelectedCountry(country: string): void {
    try {
      localStorage.setItem(COUNTRY_KEY, country);
    } catch (e) {
      console.error('Failed to set country', e);
    }
  },

  clearAll(): void {
    try {
      localStorage.removeItem(TOKEN_KEY);
      localStorage.removeItem(REFRESH_TOKEN_KEY);
      localStorage.removeItem(USER_KEY);
      localStorage.removeItem(CART_KEY);
    } catch (e) {
      console.error('Failed to clear storage', e);
    }
  }
};
