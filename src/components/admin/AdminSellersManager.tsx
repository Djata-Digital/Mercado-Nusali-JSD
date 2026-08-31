import React, { useState, useEffect } from 'react';
import { Store, CheckCircle, XCircle, Search, Award, Loader2, Percent, X } from 'lucide-react';
import { AdminService } from '../../services/adminService';

interface AdminSellersManagerProps {
  showToast: (msg: string) => void;
}

export const AdminSellersManager: React.FC<AdminSellersManagerProps> = ({ showToast }) => {
  const [sellers, setSellers] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'all' | 'verified' | 'under_review' | 'rejected' | 'high_risk'>('all');
  const [searchTerm, setSearchTerm] = useState('');

  // Correção crítica (Fase 1 Operacional — item 8: "por que a venda recebeu
  // 8%"): visibilidade da cadeia real de comissão (categoria > override do
  // vendedor > default da plataforma) para um vendedor específico, e
  // possibilidade do GLOBAL_ADMIN remover conscientemente um override
  // específico (nunca automático, nunca um novo 8% sozinho).
  const [commissionModalSeller, setCommissionModalSeller] = useState<any | null>(null);
  const [commissionData, setCommissionData] = useState<any | null>(null);
  const [isLoadingCommission, setIsLoadingCommission] = useState(false);
  const [isSavingCommission, setIsSavingCommission] = useState(false);
  const [overrideInput, setOverrideInput] = useState('');

  const openCommissionModal = async (seller: any) => {
    setCommissionModalSeller(seller);
    setCommissionData(null);
    setIsLoadingCommission(true);
    try {
      const res = await AdminService.getSellerCommission(seller.id);
      if (res.success && res.data) {
        setCommissionData(res.data);
        setOverrideInput(res.data.sellerOverride !== null ? String(res.data.sellerOverride) : '');
      } else {
        showToast(res.message || 'Erro ao carregar comissão do vendedor.');
      }
    } catch (err: any) {
      showToast(err?.message || 'Erro ao carregar comissão do vendedor.');
    } finally {
      setIsLoadingCommission(false);
    }
  };

  const handleSaveOverride = async () => {
    if (!commissionModalSeller) return;
    const trimmed = overrideInput.trim();
    const value = trimmed === '' ? null : Number(trimmed);
    if (value !== null && (isNaN(value) || value < 0)) {
      showToast('Informe um percentual válido (ex.: 8) ou deixe vazio para remover o override.');
      return;
    }
    setIsSavingCommission(true);
    try {
      const res = await AdminService.updateSellerCommission(commissionModalSeller.id, value);
      if (res.success) {
        showToast(res.message || 'Comissão do vendedor atualizada.');
        await openCommissionModal(commissionModalSeller);
        fetchSellers();
      } else {
        showToast(res.message || 'Erro ao atualizar comissão do vendedor.');
      }
    } catch (err: any) {
      showToast(err?.message || 'Erro ao atualizar comissão do vendedor.');
    } finally {
      setIsSavingCommission(false);
    }
  };

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
                  <th className="p-3">Comissão</th>
                  <th className="p-3">Reputação</th>
                  <th className="p-3">Status</th>
                  <th className="p-3 text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filtered.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="p-8 text-center text-gray-500 font-bold">
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
                        <button
                          onClick={() => openCommissionModal(s)}
                          className="flex items-center gap-1 text-[11px] font-bold px-2 py-1 rounded-lg border cursor-pointer transition"
                          style={s.commissionRate
                            ? { color: '#92400e', backgroundColor: '#fffbeb', borderColor: '#fde68a' }
                            : { color: '#6b7280', backgroundColor: '#f9fafb', borderColor: '#e5e7eb' }}
                          title="Ver/editar comissão efetiva deste vendedor"
                        >
                          <Percent className="w-3 h-3" />
                          {s.commissionRate ? `${s.commissionRate}% (override)` : 'Herda default'}
                        </button>
                      </td>
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

      {/* Modal "Comissão Efetiva" (Fase 1 Operacional — item 8) */}
      {commissionModalSeller && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl space-y-5 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-gray-100 pb-3">
              <div>
                <h3 className="font-black text-base text-gray-900 flex items-center gap-2">
                  <Percent className="w-5 h-5 text-purple-600" /> Comissão Efetiva
                </h3>
                <span className="text-xs text-gray-500">{commissionModalSeller.sellerName}</span>
              </div>
              <button onClick={() => setCommissionModalSeller(null)} className="p-1 text-gray-400 hover:text-gray-600 cursor-pointer">
                <X className="w-5 h-5" />
              </button>
            </div>

            {isLoadingCommission ? (
              <div className="p-8 text-center text-gray-400">
                <Loader2 className="w-6 h-6 animate-spin mx-auto mb-2" /> Carregando...
              </div>
            ) : commissionData ? (
              <div className="space-y-4 text-xs">
                <div className="grid grid-cols-2 gap-3">
                  <div className="p-3 bg-gray-50 rounded-xl border border-gray-200">
                    <span className="text-[10px] font-bold text-gray-400 uppercase block">Override deste vendedor</span>
                    <span className="text-lg font-black text-gray-900 block mt-0.5">
                      {commissionData.sellerOverride !== null ? `${commissionData.sellerOverride}%` : '— (nenhum)'}
                    </span>
                  </div>
                  <div className="p-3 bg-gray-50 rounded-xl border border-gray-200">
                    <span className="text-[10px] font-bold text-gray-400 uppercase block">Default global da plataforma</span>
                    <span className="text-lg font-black text-gray-900 block mt-0.5">
                      {commissionData.platformDefault !== null ? `${commissionData.platformDefault}%` : 'Não configurado'}
                    </span>
                  </div>
                </div>

                <div>
                  <h4 className="font-extrabold text-gray-900 mb-2">Comissão efetiva por categoria vendida</h4>
                  {commissionData.categories.length === 0 ? (
                    <p className="text-gray-400 font-medium p-3 bg-gray-50 rounded-xl border border-gray-200">
                      Este vendedor ainda não tem produtos cadastrados em nenhuma categoria.
                    </p>
                  ) : (
                    <div className="space-y-2">
                      {commissionData.categories.map((c: any) => (
                        <div key={c.categoryId} className="p-3 bg-white border border-gray-200 rounded-xl flex items-center justify-between">
                          <div>
                            <span className="font-bold text-gray-900 block">{c.categoryName}</span>
                            <span className="text-[10px] text-gray-400">
                              Categoria: {c.categoryRate !== null ? `${c.categoryRate}%` : '—'}
                            </span>
                          </div>
                          <div className="text-right">
                            <span className={`font-black text-sm block ${c.effectiveRate === null ? 'text-red-600' : 'text-emerald-700'}`}>
                              {c.effectiveRate !== null ? `${c.effectiveRate}%` : 'NÃO CONFIGURADO'}
                            </span>
                            <span className="text-[10px] text-gray-500">
                              Fonte: {
                                c.source === 'category' ? 'Categoria' :
                                c.source === 'seller_override' ? 'Override do vendedor' :
                                c.source === 'platform_default' ? 'Default global' : 'Nenhuma — checkout bloqueado'
                              }
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="pt-3 border-t border-gray-100 space-y-2">
                  <h4 className="font-extrabold text-gray-900">Alterar override deste vendedor</h4>
                  <p className="text-[10px] text-gray-500">
                    Vale só para vendas futuras — pedidos já criados mantêm seu commissionRateSnapshot histórico, nunca alterado.
                  </p>
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      value={overrideInput}
                      onChange={(e) => setOverrideInput(e.target.value)}
                      placeholder="Vazio = remover override (herdar default)"
                      className="flex-1 p-2.5 border border-gray-300 rounded-xl font-bold text-xs"
                    />
                    <button
                      onClick={handleSaveOverride}
                      disabled={isSavingCommission}
                      className="px-4 py-2.5 bg-purple-600 hover:bg-purple-700 text-white font-bold rounded-xl text-xs disabled:opacity-50 cursor-pointer"
                    >
                      {isSavingCommission ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Salvar'}
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              <p className="text-xs text-gray-400 p-8 text-center">Não foi possível carregar os dados de comissão.</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
