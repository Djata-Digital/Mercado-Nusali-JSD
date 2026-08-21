import React, { useState } from 'react';
import { Shield, Key, Lock, CheckCircle2 } from 'lucide-react';

interface AdminSecurityCenterProps {
  showToast: (msg: string) => void;
}

export const AdminSecurityCenter: React.FC<AdminSecurityCenterProps> = ({ showToast }) => {
  return (
    <div className="space-y-6">
      <div className="bg-white rounded-2xl p-6 border border-gray-200 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-gray-900 flex items-center gap-2">
            <Shield className="w-6 h-6 text-purple-600" />
            Central de Segurança, Criptografia & 2FA
          </h1>
          <p className="text-xs text-gray-500 mt-1">
            Políticas de autenticação multifator obrigatória (2FA) para equipe interna e proteção de sessões.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-white rounded-2xl border border-gray-200 shadow-xs p-5 space-y-3">
          <h3 className="font-extrabold text-sm text-gray-900">Autenticação 2FA Obrigatória</h3>
          <p className="text-xs text-gray-500">Exigir código OTP via SMS/App de Autenticação em todos os logins de administradores e representantes.</p>
          <button onClick={() => showToast('Política 2FA ativada para toda a equipe.')} className="px-3 py-1.5 bg-purple-600 text-white font-bold text-xs rounded-xl">
            Ativar 2FA Global
          </button>
        </div>
      </div>
    </div>
  );
};
