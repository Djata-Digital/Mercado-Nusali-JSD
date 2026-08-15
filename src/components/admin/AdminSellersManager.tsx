import React, { useState } from 'react';
import { Store, ShieldCheck, AlertTriangle, CheckCircle, XCircle, Search, Filter, Eye, DollarSign, Award } from 'lucide-react';
import { mockAdminSellersList, AdminSellerRecord } from '../../data/mockAdminSellers';

interface AdminSellersManagerProps {
  showToast: (msg: string) => void;
}

export const AdminSellersManager: React.FC<AdminSellersManagerProps> = ({ showToast }) => {
  const [sellers, setSellers] = useState<AdminSellerRecord[]>(mockAdminSellersList);
  const [activeTab, setActiveTab] = useState<'all' | 'verified' | 'under_review' | 'rejected' | 'high_risk'>('all');
  const [searchTerm, setSearchTerm] = useState('');

  const filtered = sellers.filter(s => {
    if (activeTab === 'verified' && s.kycStatus !== 'verified') return false;
    if (activeTab === 'under_review' && s.kycStatus !== 'under_review') return false;
    if (activeTab === 'rejected' && s.kycStatus !== 'rejected') return false;
    if (activeTab === 'high_risk' && s.riskScore !== 'alto') return false;
    if (searchTerm) {
      const match = s.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                    s.companyName.toLowerCase().includes(searchTerm.toLowerCase()) ||
                    s.nifTaxId.toLowerCase().includes(searchTerm.toLowerCase());
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
              { id: 'verified', label: 'Verificados / Selo Ouro' },
              { id: 'under_review', label: 'Em Análise' },
              { id: 'rejected', label: 'Rejeitados / Reprovados' },
              { id: 'high_risk', label: 'Alto Risco' },
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

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200 text-gray-500 uppercase font-black text-[10px]">
                <th className="p-3">Vendedor / Empresa</th>
                <th className="p-3">País</th>
                <th className="p-3">NIF / CNPJ</th>
                <th className="p-3">Lojas / Produtos</th>
                <th className="p-3">Vendas Totais</th>
                <th className="p-3">Reputação</th>
                <th className="p-3">KYC</th>
                <th className="p-3 text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filtered.map(s => (
                <tr key={s.id} className="hover:bg-gray-50/50">
                  <td className="p-3">
                    <div className="font-extrabold text-gray-900">{s.name}</div>
                    <div className="text-[10px] text-gray-400">{s.companyName}</div>
                  </td>
                  <td className="p-3 font-bold text-gray-800">
                    {s.country === 'GW' ? '🇬🇼 GW' : s.country === 'BR' ? '🇧🇷 BR' : s.country}
                  </td>
                  <td className="p-3 font-mono text-[11px] text-gray-600">{s.nifTaxId}</td>
                  <td className="p-3 font-bold text-gray-700">{s.storesCount} Lojas ({s.productsCount} prods)</td>
                  <td className="p-3 font-black text-emerald-700">{s.totalSalesFormatted}</td>
                  <td className="p-3">
                    <span className="font-bold text-purple-700 flex items-center gap-1">
                      <Award className="w-3.5 h-3.5 text-amber-500" /> {s.reputationLevel}
                    </span>
                  </td>
                  <td className="p-3">
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-black ${
                      s.kycStatus === 'verified' ? 'bg-emerald-100 text-emerald-800' :
                      s.kycStatus === 'rejected' ? 'bg-red-100 text-red-800' : 'bg-amber-100 text-amber-800'
                    }`}>
                      {s.kycStatus.toUpperCase()}
                    </span>
                  </td>
                  <td className="p-3 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <button
                        onClick={() => showToast(`Aprovado status do vendedor ${s.name}`)}
                        className="p-1.5 hover:bg-emerald-50 text-emerald-600 rounded-lg"
                        title="Aprovar"
                      >
                        <CheckCircle className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => showToast(`Suspensa conta do vendedor ${s.name}`)}
                        className="p-1.5 hover:bg-red-50 text-red-600 rounded-lg"
                        title="Suspender"
                      >
                        <XCircle className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
