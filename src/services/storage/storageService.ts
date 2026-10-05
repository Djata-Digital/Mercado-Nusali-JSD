const TOKEN_KEY = 'nusali_auth_token';
const REFRESH_TOKEN_KEY = 'nusali_refresh_token';
const USER_KEY = 'nusali_user_session';
const CART_KEY = 'nusali_cart_items';
const FAVORITES_KEY = 'nusali_favorites';
const COUNTRY_KEY = 'nusali_selected_country';
// Verificação de e-mail em andamento (só o e-mail e o instante do último envio do código). sessionStorage: sobrevive a
// reload e a voltar/avançar na MESMA aba e some ao fechar a aba. Nunca guarda senha nem código.
const PENDING_EMAIL_KEY = 'nusali_pending_email_verification';
const PENDING_EMAIL_TTL_MS = 6 * 60 * 60 * 1000;
const PENDING_EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export interface PendingEmailVerification {
  email: string;
  /** Instante (ms) em que o último código foi enviado; null = nenhum envio conhecido (ex.: chegou pelo login). */
  codeSentAt: number | null;
}

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
      return localStorage.getItem(TOKEN_KEY);
    } catch {
      return null;
    }
  },

  setToken(token: string): void {
    try {
      localStorage.setItem(TOKEN_KEY, token);
      localStorage.removeItem('token');
      localStorage.removeItem('auth_token');
      localStorage.removeItem('access_token');
    } catch (e) {
      console.error('Failed to set token in storage', e);
    }
  },

  removeToken(): void {
    try {
      localStorage.removeItem(TOKEN_KEY);
      localStorage.removeItem(REFRESH_TOKEN_KEY);
      localStorage.removeItem('token');
      localStorage.removeItem('auth_token');
      localStorage.removeItem('access_token');
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

  getPendingEmailVerification(): PendingEmailVerification | null {
    try {
      const raw = sessionStorage.getItem(PENDING_EMAIL_KEY);
      if (!raw) return null;
      const data = JSON.parse(raw);
      const email = typeof data?.email === 'string' ? data.email.trim().toLowerCase() : '';
      const savedAt = Number(data?.savedAt);
      if (!PENDING_EMAIL_PATTERN.test(email) || !Number.isFinite(savedAt) || Date.now() - savedAt > PENDING_EMAIL_TTL_MS) {
        sessionStorage.removeItem(PENDING_EMAIL_KEY);
        return null;
      }
      const sent = Number(data?.codeSentAt);
      return { email, codeSentAt: data?.codeSentAt != null && Number.isFinite(sent) ? sent : null };
    } catch {
      return null;
    }
  },

  setPendingEmailVerification(email: string, codeSentAt: number | null): void {
    try {
      const clean = String(email || '').trim().toLowerCase();
      if (!PENDING_EMAIL_PATTERN.test(clean)) return;
      sessionStorage.setItem(PENDING_EMAIL_KEY, JSON.stringify({ email: clean, codeSentAt, savedAt: Date.now() }));
    } catch (e) {
      console.error('Failed to set pending email verification', e);
    }
  },

  clearPendingEmailVerification(): void {
    try {
      sessionStorage.removeItem(PENDING_EMAIL_KEY);
    } catch (e) {
      console.error('Failed to clear pending email verification', e);
    }
  },

  clearAll(): void {
    try {
      sessionStorage.removeItem(PENDING_EMAIL_KEY);
      localStorage.removeItem(TOKEN_KEY);
      localStorage.removeItem(REFRESH_TOKEN_KEY);
      localStorage.removeItem(USER_KEY);
      localStorage.removeItem(CART_KEY);
      localStorage.removeItem('token');
      localStorage.removeItem('auth_token');
      localStorage.removeItem('access_token');
    } catch (e) {
      console.error('Failed to clear storage', e);
    }
  }
};
