import React, { useState } from 'react';
import { useNavigate, useLocation, Link } from 'react-router-dom';
import {
  Eye,
  EyeOff,
  ShieldCheck,
  AlertCircle,
  CheckCircle2,
  Lock,
  Mail,
  Phone,
  ArrowRight,
  Globe,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { NusaliLogo } from '../components/NusaliLogo';
import { UserRole } from '../types';

const COUNTRY_CODES = [
  { code: '+245', country: 'GW', flag: '🇬🇼', label: 'Guiné-Bissau (+245)' },
  { code: '+55', country: 'BR', flag: '🇧🇷', label: 'Brasil (+55)' },
  { code: '+351', country: 'PT', flag: '🇵🇹', label: 'Portugal (+351)' },
  { code: '+244', country: 'AO', flag: '🇦🇴', label: 'Angola (+244)' },
  { code: '+238', country: 'CV', flag: '🇨🇻', label: 'Cabo Verde (+238)' },
  { code: '+221', country: 'SN', flag: '🇸🇳', label: 'Senegal (+221)' },
  { code: '+1', country: 'US', flag: '🇺🇸', label: 'EUA (+1)' },
];

export const LoginPage: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { login } = useAuth();

  const [inputMode, setInputMode] = useState<'email' | 'phone'>('email');
  const [phoneCode, setPhoneCode] = useState('+245');
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(true);
  const [role, setRole] = useState<UserRole>('BUYER');

  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [errorCode, setErrorCode] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const from = (location.state as any)?.from?.pathname || '/';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    setErrorCode(null);
    setSuccessMessage(null);

    const cleanId = identifier.trim();
    if (!cleanId) {
      setErrorMessage('Por favor, informe seu e-mail ou número de telefone.');
      return;
    }
    if (!password) {
      setErrorMessage('Por favor, digite sua senha de acesso.');
      return;
    }

    const fullIdentifier =
      inputMode === 'phone' && !cleanId.startsWith('+')
        ? `${phoneCode} ${cleanId}`
        : cleanId;

    setLoading(true);

    try {
      const loggedUser = await login({
        identifier: fullIdentifier,
        password,
        role,
        rememberMe,
      });

      if (!loggedUser.isEmailVerified) {
        setSuccessMessage('Redirecionando para confirmação de e-mail...');
        setTimeout(() => navigate('/verify-email'), 1200);
        return;
      }

      setSuccessMessage('Autenticado com sucesso no Mercado Nusali!');
      setTimeout(() => {
        const userRole = String(loggedUser.role || '').toUpperCase();
        const targetPath = from && from !== '/login' && from !== '/' ? from : null;

        if (userRole === 'SELLER') {
          navigate(targetPath || '/seller/dashboard', { replace: true });
        } else if (
          userRole === 'ADMIN' ||
          userRole === 'GLOBAL_ADMIN' ||
          userRole === 'COUNTRY_REPRESENTATIVE' ||
          userRole === 'REGIONAL_SUPERVISOR'
        ) {
          navigate(targetPath || '/admin/dashboard', { replace: true });
        } else {
          navigate(targetPath || '/', { replace: true });
        }
      }, 400);
    } catch (err: any) {
      const msg = err.message || 'Erro ao realizar login. Tente novamente.';
      if (msg.includes('EMAIL_VERIFICATION_REQUIRED') || msg.includes('E-mail não verificado')) {
        setErrorMessage('Confirmação de e-mail pendente. Redirecionando...');
        setTimeout(() => navigate('/verify-email'), 1200);
        return;
      }
      setErrorMessage(msg);
      if (msg.includes('suspensa')) setErrorCode('SUSPENDED');
      else if (msg.includes('bloqueada')) setErrorCode('BLOCKED');
      else if (msg.includes('tentativas')) setErrorCode('TOO_MANY_ATTEMPTS');
    } finally {
      setLoading(false);
    }
  };

  // Quick fill helper for demonstration (DEV mode only)
  const handleQuickFill = (type: string) => {
    const isDev = Boolean((import.meta as any).env?.DEV);
    if (!isDev) return;
    setErrorMessage(null);
    setErrorCode(null);
    if (type === 'buyer' || type === 'user') {
      setInputMode('email');
      setIdentifier('djatadigital7@gmail.com');
      setRole('BUYER');
    } else if (type === 'seller') {
      setInputMode('email');
      setIdentifier('vendedor@nusali.com');
      setRole('SELLER');
    } else if (type === 'admin') {
      setInputMode('email');
      setIdentifier('admin@nusali.com');
      setRole('ADMIN');
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-blue-950 via-slate-900 to-gray-900 flex flex-col justify-center py-10 sm:py-14 px-4 sm:px-6 lg:px-8 animate-fadeIn">
      <div className="sm:mx-auto sm:w-full sm:max-w-md text-center">
        <Link to="/" className="inline-block hover:opacity-90 transition">
          <NusaliLogo variant="full" size="lg" />
        </Link>
        <h2 className="mt-6 text-2xl font-black text-white tracking-tight">
          Entre na sua conta
        </h2>
        <p className="mt-1 text-xs text-blue-200">
          Acesse suas compras, vendas e pagamentos com segurança
        </p>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
        <div className="bg-white py-8 px-6 sm:px-10 shadow-2xl rounded-2xl border border-gray-100">
          {/* Success Message */}
          {successMessage && (
            <div className="mb-6 p-4 rounded-xl bg-emerald-50 border border-emerald-200 flex items-start gap-3 text-emerald-900 text-xs font-medium animate-fadeIn">
              <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
              <div>{successMessage}</div>
            </div>
          )}

          {/* Error Message */}
          {errorMessage && (
            <div className="mb-6 p-4 rounded-xl bg-red-50 border border-red-200 flex items-start gap-3 text-red-900 text-xs font-medium animate-fadeIn">
              <AlertCircle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
              <div className="space-y-2">
                <p>{errorMessage}</p>
                {errorCode === 'SUSPENDED' && (
                  <Link
                    to="/help-center"
                    className="inline-block text-red-700 underline font-bold hover:text-red-900"
                  >
                    Falar com a Ouvidoria Mercado Nusali
                  </Link>
                )}
                {errorCode === 'BLOCKED' && (
                  <Link
                    to="/forgot-password"
                    className="inline-block text-red-700 underline font-bold hover:text-red-900"
                  >
                    Redefinir senha para desbloquear
                  </Link>
                )}
              </div>
            </div>
          )}

          {/* Input Mode Selector */}
          <div className="flex bg-gray-100 p-1 rounded-xl mb-6">
            <button
              type="button"
              onClick={() => {
                setInputMode('email');
                setIdentifier('');
              }}
              className={`flex-1 py-2 text-xs font-bold rounded-lg transition flex items-center justify-center gap-1.5 cursor-pointer ${
                inputMode === 'email'
                  ? 'bg-white text-blue-900 shadow-xs'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              <Mail className="w-3.5 h-3.5" />
              E-mail
            </button>
            <button
              type="button"
              onClick={() => {
                setInputMode('phone');
                setIdentifier('');
              }}
              className={`flex-1 py-2 text-xs font-bold rounded-lg transition flex items-center justify-center gap-1.5 cursor-pointer ${
                inputMode === 'phone'
                  ? 'bg-white text-blue-900 shadow-xs'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              <Phone className="w-3.5 h-3.5" />
              Telefone Internacional
            </button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-5 text-xs">
            {/* Email or Phone Input */}
            <div>
              <label className="block font-bold text-gray-700 mb-1.5">
                {inputMode === 'email' ? 'E-mail cadastrado *' : 'Telefone com código de país *'}
              </label>

              {inputMode === 'email' ? (
                <div className="relative rounded-xl shadow-2xs">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-gray-400">
                    <Mail className="w-4 h-4" />
                  </div>
                  <input
                    type="email"
                    required
                    value={identifier}
                    onChange={(e) => setIdentifier(e.target.value)}
                    placeholder="ex: usuario@nusali.cplp"
                    className="w-full pl-10 pr-3 py-2.5 border border-gray-300 rounded-xl focus:border-blue-800 focus:ring-1 focus:ring-blue-800 focus:outline-hidden text-xs text-gray-900"
                  />
                </div>
              ) : (
                <div className="flex gap-2">
                  <select
                    value={phoneCode}
                    onChange={(e) => setPhoneCode(e.target.value)}
                    className="bg-gray-50 border border-gray-300 text-gray-800 text-xs font-bold rounded-xl px-2 py-2.5 focus:border-blue-800 focus:outline-hidden"
                  >
                    {COUNTRY_CODES.map((c) => (
                      <option key={c.code} value={c.code}>
                        {c.flag} {c.code}
                      </option>
                    ))}
                  </select>
                  <div className="relative flex-1">
                    <input
                      type="tel"
                      required
                      value={identifier}
                      onChange={(e) => setIdentifier(e.target.value)}
                      placeholder="955 123 456"
                      className="w-full px-3 py-2.5 border border-gray-300 rounded-xl focus:border-blue-800 focus:ring-1 focus:ring-blue-800 focus:outline-hidden text-xs text-gray-900 font-mono"
                    />
                  </div>
                </div>
              )}
            </div>

            {/* Password Input */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="block font-bold text-gray-700">Senha de acesso *</label>
                <Link
                  to="/forgot-password"
                  className="text-blue-800 hover:text-blue-950 font-bold hover:underline"
                >
                  Esqueci minha senha
                </Link>
              </div>
              <div className="relative rounded-xl shadow-2xs">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-gray-400">
                  <Lock className="w-4 h-4" />
                </div>
                <input
                  type={showPassword ? 'text' : 'password'}
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full pl-10 pr-10 py-2.5 border border-gray-300 rounded-xl focus:border-blue-800 focus:ring-1 focus:ring-blue-800 focus:outline-hidden text-xs text-gray-900"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute inset-y-0 right-0 pr-3 flex items-center text-gray-400 hover:text-gray-600 cursor-pointer"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {/* Remember Me & Role */}
            <div className="flex items-center justify-between pt-1">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={rememberMe}
                  onChange={(e) => setRememberMe(e.target.checked)}
                  className="w-4 h-4 text-blue-900 rounded border-gray-300 focus:ring-blue-800 cursor-pointer"
                />
                <span className="text-gray-700 font-medium">Lembrar de mim</span>
              </label>

              <select
                value={role}
                onChange={(e) => setRole(e.target.value as UserRole)}
                className="text-[11px] font-bold text-gray-600 bg-gray-50 border border-gray-200 rounded-lg px-2 py-1 focus:outline-hidden"
              >
                <option value="BUYER">Perfil Comprador</option>
                <option value="SELLER">Perfil Vendedor</option>
                <option value="ADMIN">Perfil Admin</option>
              </select>
            </div>

            {/* Submit Button */}
            <button
              type="submit"
              disabled={loading}
              className="w-full bg-gradient-to-r from-blue-900 via-indigo-900 to-emerald-900 text-white font-extrabold py-3 px-4 rounded-xl shadow-lg hover:opacity-95 transition flex items-center justify-center gap-2 text-sm disabled:opacity-50 cursor-pointer"
            >
              {loading ? (
                <div className="flex items-center gap-2">
                  <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent" />
                  <span>Entrando...</span>
                </div>
              ) : (
                <>
                  <span>Entrar</span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </form>

          {/* Footer options */}
          <div className="mt-6 pt-5 border-t border-gray-100 text-center text-xs">
            <p className="text-gray-600">
              Ainda não possui uma conta?{' '}
              <Link
                to="/register"
                className="font-bold text-blue-800 hover:text-blue-950 underline ml-1"
              >
                Criar conta no Mercado Nusali
              </Link>
            </p>
          </div>

          {/* Quick Fill Simulation bar (rendered ONLY in development mode) */}
          {Boolean((import.meta as any).env?.DEV) && (
            <div className="mt-6 p-3.5 bg-slate-50 rounded-xl border border-slate-200">
              <span className="text-[11px] font-extrabold uppercase tracking-wider text-slate-700 block mb-2 text-center">
                🔑 Credenciais dos Primeiros Usuários (Modo DEV):
              </span>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                <button
                  type="button"
                  onClick={() => handleQuickFill('buyer')}
                  className="p-2 bg-white border border-blue-200 rounded-lg text-left hover:border-blue-500 hover:bg-blue-50/50 transition cursor-pointer shadow-2xs"
                >
                  <div className="text-[10px] font-black text-blue-900 uppercase">Comprador</div>
                  <div className="text-[11px] font-bold text-gray-800 truncate">djatadigital7@gmail.com</div>
                </button>

                <button
                  type="button"
                  onClick={() => handleQuickFill('seller')}
                  className="p-2 bg-white border border-emerald-200 rounded-lg text-left hover:border-emerald-500 hover:bg-emerald-50/50 transition cursor-pointer shadow-2xs"
                >
                  <div className="text-[10px] font-black text-emerald-800 uppercase">Vendedor</div>
                  <div className="text-[11px] font-bold text-gray-800 truncate">vendedor@nusali.com</div>
                </button>

                <button
                  type="button"
                  onClick={() => handleQuickFill('admin')}
                  className="p-2 bg-white border border-purple-200 rounded-lg text-left hover:border-purple-500 hover:bg-purple-50/50 transition cursor-pointer shadow-2xs"
                >
                  <div className="text-[10px] font-black text-purple-800 uppercase">Admin</div>
                  <div className="text-[11px] font-bold text-gray-800 truncate">admin@nusali.com</div>
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Security assurance footer */}
        <div className="mt-6 flex items-center justify-center gap-2 text-xs text-blue-200/80">
          <ShieldCheck className="w-4 h-4 text-emerald-400" />
          <span>Sessão segura com criptografia SSL e custódia Nusali Escrow</span>
        </div>
      </div>
    </div>
  );
};
