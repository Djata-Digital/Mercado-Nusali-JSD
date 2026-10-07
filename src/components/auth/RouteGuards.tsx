import React from 'react';
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { UserRole, Permission } from '../../types';
import { PHONE_VERIFICATION_ENABLED } from '../../config/constants';

export const ProtectedRoute: React.FC<{ children?: React.ReactNode }> = ({ children }) => {
  const { isAuthenticated, isLoading } = useAuth();
  const location = useLocation();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-900" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  return children ? <>{children}</> : <Outlet />;
};

export const GuestRoute: React.FC<{ children?: React.ReactNode }> = ({ children }) => {
  const { isAuthenticated, isLoading, user } = useAuth();
  const location = useLocation();
  const rawFrom = location.state?.from?.pathname;
  const from = rawFrom && rawFrom !== '/login' ? rawFrom : null;

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-900" />
      </div>
    );
  }

  if (isAuthenticated && user) {
    const role = String(user.role || '').toUpperCase();
    const defaultDest =
      role === 'SELLER'
        ? '/seller/dashboard'
        : role === 'ADMIN' || role === 'GLOBAL_ADMIN' || role === 'COUNTRY_REPRESENTATIVE' || role === 'REGIONAL_SUPERVISOR'
        ? '/admin/dashboard'
        : '/';
    return <Navigate to={from || defaultDest} replace />;
  }

  return children ? <>{children}</> : <Outlet />;
};

/**
 * PHONE-1 — enquanto PHONE_VERIFICATION_ENABLED for false (canal de código por SMS/WhatsApp ainda NÃO integrado), a tela de
 * verificação de telefone não faz parte do fluxo: quem abrir /verify-phone é levado ao início. A página e a API de cliente
 * ficam preservadas; reativar = mudar a constante em src/config/constants.ts.
 */
export const PhoneVerificationGate: React.FC<{ enabled?: boolean; children: React.ReactNode }> = ({ enabled = PHONE_VERIFICATION_ENABLED, children }) => {
  if (!enabled) return <Navigate to="/" replace />;
  return <>{children}</>;
};

export const RoleRoute: React.FC<{ allowedRoles: UserRole[]; children?: React.ReactNode }> = ({ allowedRoles, children }) => {
  const { hasRole, isAuthenticated, isLoading } = useAuth();
  const location = useLocation();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-900" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  if (!hasRole(allowedRoles)) {
    return <Navigate to="/" replace />;
  }

  return children ? <>{children}</> : <Outlet />;
};

export const PermissionRoute: React.FC<{ requiredPermission: Permission; children?: React.ReactNode }> = ({ requiredPermission, children }) => {
  const { hasPermission, isAuthenticated, isLoading } = useAuth();
  const location = useLocation();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-900" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  if (!hasPermission(requiredPermission)) {
    return <Navigate to="/" replace />;
  }

  return children ? <>{children}</> : <Outlet />;
};

