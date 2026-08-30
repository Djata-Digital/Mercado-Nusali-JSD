import React, { useState, useEffect } from 'react';
import { Settings, Save, ToggleRight, ToggleLeft, Check, Loader2 } from 'lucide-react';
import { AdminService } from '../../services/adminService';

interface AdminPlatformSettingsProps {
  showToast: (msg: string) => void;
}

export const AdminPlatformSettings: React.FC<AdminPlatformSettingsProps> = ({ showToast }) => {
  const [platformName, setPlatformName] = useState('Mercado Nusali CPLP');
  const [escrowHours, setEscrowHours] = useState(48);
  // Correção crítica (comissão default do Admin — Fase 1 operacional):
  // string vazia = genuinamente não configurado ainda. Nunca mais um "5.0%"
  // fingido só pra preencher o campo — o admin precisa digitar
  // conscientemente antes de qualquer coisa ser salva (nunca configuramos
  // um valor automaticamente).
  const [commissionRate, setCommissionRate] = useState('');
  const [commissionConfigured, setCommissionConfigured] = useState(false);
  const [supportEmail, setSupportEmail] = useState('suporte@nusali.com');
  const [maintenanceMode, setMaintenanceMode] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    const fetchSettings = async () => {
      setIsLoading(true);
      try {
        const res = await AdminService.getSettings();
        if (res.success && res.data) {
          setPlatformName(res.data.platformName || 'Mercado Nusali CPLP');
          setEscrowHours(res.data.escrowHoldingHours || 48);
          const real = res.data.defaultSellerCommissionPercent;
          setCommissionConfigured(real !== null && real !== undefined);
          setCommissionRate(real !== null && real !== undefined ? `${real}%` : '');
          setMaintenanceMode(!!res.data.maintenanceMode);
        }
      } catch {
        // fallback
      } finally {
        setIsLoading(false);
      }
    };

    fetchSettings();
  }, []);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    const parsedCommission = parseFloat(commissionRate);
    if (commissionRate.trim() !== '' && (isNaN(parsedCommission) || parsedCommission < 0)) {
      showToast('Informe um percentual de comissão default válido (ex.: 8) antes de salvar.');
      return;
    }
    setIsSaving(true);
    try {
      const payload: Record<string, any> = {
        platformName,
        escrowHoldingHours: escrowHours,
        maintenanceMode,
      };
      // Só envia a comissão default se o admin realmente digitou algo —
      // nunca escreve um valor "adivinhado" no lugar de um campo vazio.
      if (commissionRate.trim() !== '') {
        payload.defaultSellerCommissionPercent = parsedCommission;
      }
      const res = await AdminService.updateSettings(payload);
      if (res.success) {
        setCommissionConfigured(commissionRate.trim() !== '');
        showToast(res.message || 'Configurações globais atualizadas com sucesso!');
      } else {
        showToast(res.error?.message || 'Erro ao atualizar configurações.');
      }
    } catch {
      showToast('Erro ao salvar configurações.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-2xl p-6 border border-gray-200 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-gray-900 flex items-center gap-2">
            <Settings className="w-6 h-6 text-purple-600" />
            Configurações Globais da Plataforma Mercado Nusali
          </h1>
          <p className="text-xs text-gray-500 mt-1">
            Definição de parâmetros globais da marca, prazos padrão de Escrow e taxas universais.
          </p>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-gray-200 shadow-xs p-6 space-y-4 max-w-2xl">
        <h3 className="font-extrabold text-sm text-gray-900">Parâmetros Globais de Operação</h3>

        {isLoading ? (
          <div className="p-8 text-center text-gray-400">
            <Loader2 className="w-6 h-6 animate-spin mx-auto text-purple-600 mb-2" />
            Carregando configurações...
          </div>
        ) : (
          <form onSubmit={handleSave} className="space-y-4 text-xs">
            <div>
              <label className="font-bold text-gray-700 block mb-1">Nome Oficial da Plataforma:</label>
              <input
                type="text"
                value={platformName}
                onChange={e => setPlatformName(e.target.value)}
                className="w-full p-2.5 bg-white border border-gray-300 rounded-xl font-bold focus:ring-2 focus:ring-purple-500 outline-hidden"
              />
            </div>

            <div>
              <label className="font-bold text-gray-700 block mb-1">
                Prazo Padrão de Autoliberação Escrow (Horas sem Reclamação):
              </label>
              <input
                type="number"
                value={escrowHours}
                onChange={e => setEscrowHours(parseInt(e.target.value) || 24)}
                className="w-full p-2.5 border border-gray-300 rounded-xl font-bold focus:ring-2 focus:ring-purple-500 outline-hidden"
              />
            </div>

            <div>
              <label className="font-bold text-gray-700 block mb-1">Taxa Base Universal de Comissão (%):</label>
              <input
                type="text"
                value={commissionRate}
                onChange={e => setCommissionRate(e.target.value)}
                placeholder="Não configurado — obrigatório para vendedores novos"
                className="w-full p-2.5 border border-gray-300 rounded-xl font-bold focus:ring-2 focus:ring-purple-500 outline-hidden"
              />
              {!commissionConfigured && (
                <p className="text-xs text-amber-700 font-semibold mt-1">
                  ⚠ Nenhuma comissão default foi configurada ainda. Vendedores sem comissão própria nem categoria com taxa definida terão o checkout bloqueado (COMMISSION_NOT_CONFIGURED) até que você defina e salve um valor aqui.
                </p>
              )}
            </div>

            <div>
              <label className="font-bold text-gray-700 block mb-1">Email Central de Atendimento:</label>
              <input
                type="email"
                value={supportEmail}
                onChange={e => setSupportEmail(e.target.value)}
                className="w-full p-2.5 border border-gray-300 rounded-xl font-bold focus:ring-2 focus:ring-purple-500 outline-hidden"
              />
            </div>

            <div className="flex items-center justify-between p-3 bg-gray-50 rounded-xl border border-gray-200">
              <div>
                <span className="font-bold text-gray-900 block">Modo de Manutenção CPLP</span>
                <span className="text-gray-500 text-[11px]">Suspende transações públicas para upgrades de infraestrutura.</span>
              </div>
              <button
                type="button"
                onClick={() => setMaintenanceMode(!maintenanceMode)}
                className={`p-1 rounded-lg text-2xl transition ${
                  maintenanceMode ? 'text-amber-600' : 'text-gray-400'
                }`}
              >
                {maintenanceMode ? <ToggleRight className="w-8 h-8" /> : <ToggleLeft className="w-8 h-8" />}
              </button>
            </div>

            <button
              type="submit"
              disabled={isSaving}
              className="w-full bg-purple-600 hover:bg-purple-700 text-white font-extrabold py-3 rounded-xl shadow-xs transition flex items-center justify-center gap-2"
            >
              {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              Salvar Alterações Globais
            </button>
          </form>
        )}
      </div>
    </div>
  );
};
