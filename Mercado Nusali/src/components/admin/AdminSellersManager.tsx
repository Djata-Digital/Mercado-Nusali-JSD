import React, { useState, useEffect } from 'react';
import { Store, CheckCircle, XCircle, Search, Award, Loader2 } from 'lucide-react';
import { AdminService } from '../../services/adminService';

interface AdminSellersManagerProps {
  showToast: (msg: string) => void;
}

export const AdminSellersManager: React.FC<AdminSellersManagerProps> = ({ showToast }) => {
  const [sellers, setSellers] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'all' | 'verified' | 'under_review' | 'rejected' | 'high_risk'>('all');
  const [searchTerm, setSearchTerm] = useState('');

  const fetchSellers = async () => {
    setIsLoading(true);
    try {
      const res = await AdminService.getSellers();
      if (res.success && res.data) {
        setSellers(res.data);
      } else if (res.message) {
        showToast(res.message);
      }
    } catch (err: any) {
      if (err?.response?.status === 401) {
        showToast('Sua sessão expirou. Entre novamente.');
      } else if (err?.response?.status === 403) {
        showToast('Você não possui permissão para acessar esta área.');
      } else {
        showToast(err?.response?.data?.message || err?.message || 'Erro ao carregar lista de vendedores.');
      }
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchSellers();
  }, []);

  const filtered = sellers.filter(s => {
    const kycStatus = String(s.status || '').toLowerCase();
    if (activeTab === 'verified' && kycStatus !== 'active' && kycStatus !== 'verified') return false;
    if (activeTab === 'under_review' && kycStatus !== 'pending') return false;
    if (activeTab === 'rejected' && kycStatus !== 'rejected' && kycStatus !== 'blocked') return false;
    if (searchTerm) {
      const match = String(s.sellerName || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
                    String(s.tradingName || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
                    String(s.taxId || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
                    String(s.email || '').toLowerCase().includes(searchTerm.toLowerCase());
      if (!match) return false;
    }
    return true;
  });

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-2xl p-6 border border-gray-200 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-gray-900 flex items-center gap-2">
            <Store className="w-6 h-6 text-purple-600" />
            Gestão de Vendedores & Níveis de Reputação
          </h1>
          <p className="text-xs text-gray-500 mt-1">
            Auditoria de contas de vendedores, selos de verificação Líder Ouro/Prata, KYC e nível de risco.
          </p>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-gray-200 shadow-xs p-6 space-y-4">
        <div className="flex flex-col md:flex-row items-center justify-between gap-4 border-b border-gray-100 pb-4">
          <div className="flex items-center gap-2 overflow-x-auto w-full md:w-auto pb-2 md:pb-0">
            {[
              { id: 'all', label: 'Todos os Vendedores' },
              { id: 'verified', label: 'Verificados / Ativos' },
              { id: 'under_review', label: 'Em Análise' },
              { id: 'rejected', label: 'Rejeitados / Reprovados' },
            ].map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)}
                className={`px-3 py-1.5 text-xs font-bold rounded-xl whitespace-nowrap transition ${
                  activeTab === tab.id ? 'bg-purple-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <div className="relative w-full md:w-64">
            <Search className="w-4 h-4 text-gray-400 absolute left-3 top-2.5" />
            <input
              type="text"
              placeholder="Buscar vendedor, empresa ou NIF..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-9 pr-3 py-2 text-xs border border-gray-300 rounded-xl focus:ring-2 focus:ring-purple-500"
            />
          </div>
        </div>

        {isLoading ? (
          <div className="p-12 text-center text-gray-400">
            <Loader2 className="w-8 h-8 animate-spin mx-auto text-purple-600 mb-2" />
            Carregando vendedores...
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200 text-gray-500 uppercase font-black text-[10px]">
                  <th className="p-3">Vendedor / Empresa</th>
                  <th className="p-3">País</th>
                  <th className="p-3">NIF / CNPJ</th>
                  <th className="p-3">Contato</th>
                  <th className="p-3">Vendas Totais</th>
                  <th className="p-3">Reputação</th>
                  <th className="p-3">Status</th>
                  <th className="p-3 text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filtered.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="p-8 text-center text-gray-500 font-bold">
                      Nenhum vendedor encontrado
                    </td>
                  </tr>
                ) : (
                  filtered.map(s => (
                    <tr key={s.id} className="hover:bg-gray-50/50">
                      <td className="p-3">
                        <div className="font-extrabold text-gray-900">{s.sellerName}</div>
                        <div className="text-[10px] text-gray-400">{s.tradingName ? `${s.tradingName} • ${s.email}` : s.email}</div>
                      </td>
                      <td className="p-3 font-bold text-gray-800">
                        {s.countryCode === 'GW' ? '🇬🇼 GW' : s.countryCode === 'BR' ? '🇧🇷 BR' : (s.countryCode || 'Não informado')}
                      </td>
                      <td className="p-3 font-mono text-[11px] text-gray-600">{s.taxId || 'Não informado'}</td>
                      <td className="p-3 font-bold text-gray-700">{s.phone || 'Não informado'}</td>
                      <td className="p-3 font-black text-emerald-700">{s.totalSales ? `${s.totalSales} XOF` : '0.00 XOF'}</td>
                      <td className="p-3">
                        {s.rating && Number(s.rating) > 0 && s.totalOrders > 0 ? (
                          <span className="font-bold text-purple-700 flex items-center gap-1">
                            <Award className="w-3.5 h-3.5 text-amber-500" /> {Number(s.rating).toFixed(1)}★
                          </span>
                        ) : (
                          <span className="text-gray-400 font-medium text-[11px]">Sem avaliações</span>
                        )}
                      </td>
                      <td className="p-3">
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-black ${
                          s.status === 'active' ? 'bg-emerald-100 text-emerald-800' :
                          s.status === 'blocked' ? 'bg-red-100 text-red-800' : 'bg-amber-100 text-amber-800'
                        }`}>
                          {String(s.status).toUpperCase()}
                        </span>
                      </td>
                      <td className="p-3 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={async () => {
                              const res = await AdminService.toggleUserStatus(s.userId || s.id, 'active');
                              if (res.success) {
                                showToast(`Vendedor ${s.sellerName} ativado!`);
                                fetchSellers();
                              }
                            }}
                            className="p-1.5 hover:bg-emerald-50 text-emerald-600 rounded-lg cursor-pointer"
                            title="Aprovar/Ativar"
                          >
                            <CheckCircle className="w-4 h-4" />
                          </button>
                          <button
                            onClick={async () => {
                              const res = await AdminService.toggleUserStatus(s.userId || s.id, 'blocked');
                              if (res.success) {
                                showToast(`Conta do vendedor ${s.sellerName} suspensa!`);
                                fetchSellers();
                              }
                            }}
                            className="p-1.5 hover:bg-red-50 text-red-600 rounded-lg cursor-pointer"
                            title="Suspender"
                          >
                            <XCircle className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
