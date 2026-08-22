import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { User, UserRole, LoginRequest, RegisterRequest, Permission } from '../types';
import { AuthService } from '../services/authService';
import { storageService } from '../services/storage/storageService';

interface AuthContextType {
  user: User | null;
  token: string | null;
  activeRole: UserRole;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (credentials: LoginRequest | string, role?: UserRole, password?: string) => Promise<User>;
  register: (data: RegisterRequest | Partial<User>) => Promise<User>;
  logout: () => Promise<void>;
  updateUser: (partial: Partial<User>) => void;
  switchActiveRole: (newRole: UserRole) => void;
  hasRole: (roles: UserRole | UserRole[]) => boolean;
  hasPermission: (permission: Permission) => boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [activeRole, setActiveRole] = useState<UserRole>('BUYER');
  const [isLoading, setIsLoading] = useState<boolean>(true);

  // Initialize Auth state from storage
  useEffect(() => {
    const initAuth = async () => {
      try {
        const storedToken = storageService.getToken();
        const storedUser = storageService.getUser() as User | null;

        if (storedToken) {
          setToken(storedToken);
          if (storedUser) {
            setUser(storedUser);
            setActiveRole(storedUser.role || 'BUYER');
          }

          // Live session verification against GET /api/v1/auth/me
          const meRes = await AuthService.me();
          if (meRes.success && meRes.data) {
            const liveUser = (meRes.data as any).user || meRes.data;
            if (liveUser && liveUser.id) {
              setUser(liveUser);
              setActiveRole(liveUser.role || 'BUYER');
              storageService.setUser(liveUser);
            }
          } else {
            // Token is invalid/expired
            storageService.removeToken();
            storageService.removeUser();
            setUser(null);
            setToken(null);
          }
        }
      } catch (err) {
        console.error('Failed to restore auth session:', err);
        storageService.removeToken();
        storageService.removeUser();
        setUser(null);
        setToken(null);
      } finally {
        setIsLoading(false);
      }
    };

    initAuth();
  }, []);

  // Sync logout across browser tabs & respond to 401 auth_expired events
  useEffect(() => {
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === 'nusali_auth_token' && !e.newValue) {
        setUser(null);
        setToken(null);
      }
    };
    const handleAuthExpired = () => {
      setUser(null);
      setToken(null);
      storageService.removeToken();
      storageService.removeUser();
    };

    window.addEventListener('storage', handleStorageChange);
    window.addEventListener('nusali:auth_expired', handleAuthExpired);
    return () => {
      window.removeEventListener('storage', handleStorageChange);
      window.removeEventListener('nusali:auth_expired', handleAuthExpired);
    };
  }, []);

  const login = useCallback(async (
    credentialsOrIdentifier: LoginRequest | string,
    role?: UserRole,
    password?: string
  ): Promise<User> => {
    setIsLoading(true);
    try {
      let req: LoginRequest;
      if (typeof credentialsOrIdentifier === 'string') {
        req = {
          identifier: credentialsOrIdentifier,
          role: role || 'BUYER',
          password: password || 'password123',
        };
      } else {
        req = credentialsOrIdentifier;
      }

      const res = await AuthService.login(req);

      if (!res.success || !res.data) {
        throw new Error(res.error?.message || 'Falha na autenticação');
      }

      const loggedUser = res.data.user;
      setUser(loggedUser);
      setToken(res.data.token);
      setActiveRole(loggedUser.role || 'BUYER');
      return loggedUser;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const register = useCallback(async (data: RegisterRequest | Partial<User>): Promise<User> => {
    setIsLoading(true);
    try {
      let req: RegisterRequest;
      if ('firstName' in data && 'phoneCode' in data) {
        req = data as RegisterRequest;
      } else {
        req = {
          country: data.country || 'GW',
          role: (data.role as UserRole) || 'BUYER',
          firstName: data.name?.split(' ')[0] || 'Usuário',
          lastName: data.name?.split(' ').slice(1).join(' ') || 'Nusali',
          email: data.email || '',
          phone: data.phone || '955000000',
          phoneCode: '+245',
          password: 'Password123!',
          termsAccepted: true,
          privacyAccepted: true,
        };
      }

      const res = await AuthService.register(req);

      if (!res.success || !res.data) {
        throw new Error(res.error?.message || 'Falha ao registrar conta');
      }

      const registeredUser = res.data.user;
      setUser(registeredUser);
      if (res.data.token) {
        setToken(res.data.token);
      } else {
        setToken(null);
      }
      setActiveRole(registeredUser?.role || 'BUYER');
      return registeredUser;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const logout = useCallback(async () => {
    setIsLoading(true);
    try {
      await AuthService.logout();
    } finally {
      setUser(null);
      setToken(null);
      setIsLoading(false);
    }
  }, []);

  const updateUser = useCallback((partial: Partial<User>) => {
    setUser(prev => {
      if (!prev) return null;
      const updated = { ...prev, ...partial };
      storageService.setUser(updated);
      return updated;
    });
  }, []);

  const switchActiveRole = useCallback((newRole: UserRole) => {
    setActiveRole(newRole);
  }, []);

  const hasRole = useCallback((roles: UserRole | UserRole[]) => {
    if (!user) return false;
    const allowed = Array.isArray(roles) ? roles : [roles];
    return allowed.includes(activeRole) || allowed.includes(user.role);
  }, [user, activeRole]);

  const hasPermission = useCallback((permission: Permission) => {
    if (!user) return false;
    if (user.role === 'ADMIN' || user.role === 'GLOBAL_ADMIN') return true;
    if (user.role === 'SELLER' && (permission === 'manage_products' || permission === 'manage_orders')) return true;
    return false;
  }, [user]);

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        activeRole,
        isAuthenticated: !!token && !!user,
        isLoading,
        login,
        register,
        logout,
        updateUser,
        switchActiveRole,
        hasRole,
        hasPermission,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

