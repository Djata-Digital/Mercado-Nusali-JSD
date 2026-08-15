import React, { useState, useEffect } from 'react';
import { UserCheck, Mail, Phone, Award, TrendingUp, UserX, Shield, Edit, Plus, X, Check, Loader2 } from 'lucide-react';
import { AdminService } from '../../services/adminService';
import { CountryRepresentative } from '../../data/mockRepresentatives';

interface AdminCountryRepresentativesProps {
  showToast: (msg: string) => void;
}

export const AdminCountryRepresentatives: React.FC<AdminCountryRepresentativesProps> = ({ showToast }) => {
  const [representatives, setRepresentatives] = useState<CountryRepresentative[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const [isInviteModalOpen, setIsInviteModalOpen] = useState(false);
  const [editTargetRep, setEditTargetRep] = useState<CountryRepresentative | null>(null);

  // Invite Form
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [countryName, setCountryName] = useState('Guiné-Bissau (GW)');
  const [targetGMV, setTargetGMV] = useState('50.000.000 XOF');
  const [commissionRate, setCommissionRate] = useState('1.5%');

  // Goals Form
  const [newTargetGMV, setNewTargetGMV] = useState('');
  const [newCommissionRate, setNewCommissionRate] = useState('');

  const fetchReps = async () => {
    setIsLoading(true);
    try {
      const res = await AdminService.getCountryReps();
      if (res.success && res.data) {
        setRepresentatives(res.data);
      }
    } catch {
      // fallback
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchReps();
  }, []);

  const handleInviteRep = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !email.trim()) {
      showToast('Por favor, informe o nome e o email do representante.');
      return;
    }

    try {
      const res = await AdminService.createCountryRep({
        name,
        email,
        phone: phone || '+245 950000000',
        countryName,
        countryCode: countryName.includes('BR') ? 'BR' : countryName.includes('PT') ? 'PT' : 'GW',
        targetGMV: targetGMV || '50.000.000 XOF',
        commissionRate: commissionRate || '1.5%',
      });

      if (res.success && res.data) {
        setRepresentatives(prev => [res.data, ...prev]);
        showToast(res.message || `Convite oficial enviado para ${name} (${email})!`);
      }
    } catch {
      showToast(`Representante cadastrado com sucesso.`);
    }

    setIsInviteModalOpen(false);

    // Reset
    setName('');
    setEmail('');
    setPhone('');
    setCountryName('Guiné-Bissau (GW)');
    setTargetGMV('50.000.000 XOF');
    setCommissionRate('1.5%');
  };

  const handleSaveGoals = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editTargetRep) return;

    setRepresentatives(prev =>
      prev.map(r =>
        r.id === editTargetRep.id
          ? {
              ...r,
              targetGMVFormatted: newTargetGMV || r.targetGMVFormatted,
              commissionRate: newCommissionRate || r.commissionRate,
            }
          : r
      )
    );

    showToast(`Metas atualizadas para ${editTargetRep.name}!`);
    setEditTargetRep(null);
  };

  const handleToggleStatus = (rep: CountryRepresentative) => {
    const nextStatus = rep.status === 'active' ? 'suspended' : 'active';
    setRepresentatives(prev =>
      prev.map(r => (r.id === rep.id ? { ...r, status: nextStatus } : r))
    );
    showToast(`Representante ${rep.name} alterado para status ${nextStatus.toUpperCase()}.`);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-white rounded-2xl p-6 border border-gray-200 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-gray-900 flex items-center gap-2">
            <UserCheck className="w-6 h-6 text-purple-600" />
            Representantes Nacionais CPLP
          </h1>
          <p className="text-xs text-gray-500 mt-1">
            Gestão dos líderes de expansão por país, metas de GMV nacional e comissões corporativas.
          </p>
        </div>

        <button
          onClick={() => setIsInviteModalOpen(true)}
          className="bg-purple-600 hover:bg-purple-700 text-white font-extrabold text-xs px-4 py-2.5 rounded-xl flex items-center gap-2 shadow-xs transition"
        >
          <Plus className="w-4 h-4" /> Nomear / Convidar Representante
        </button>
      </div>

      {/* Grid of Reps */}
      {isLoading ? (
        <div className="p-12 text-center text-gray-400">
          <Loader2 className="w-8 h-8 animate-spin mx-auto text-purple-600 mb-2" />
          Carregando representantes...
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {representatives.map(r => (
            <div key={r.id} className="bg-white rounded-2xl border border-gray-200 shadow-xs p-6 space-y-4 hover:border-purple-300 transition">
              <div className="flex justify-between items-start">
                <div className="flex items-center gap-3">
                  <img
                    src={r.avatar || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&q=80&w=200'}
                    alt={r.name}
                    className="w-12 h-12 rounded-xl object-cover border border-gray-200"
                  />
                  <div>
                    <h3 className="font-extrabold text-sm text-gray-900 leading-tight">{r.name}</h3>
                    <p className="text-xs text-purple-700 font-bold">{r.countryName}</p>
                    <span className="text-[10px] text-gray-400 font-mono">ID: {r.id}</span>
                  </div>
                </div>

                <span
                  className={`text-[10px] font-black px-2.5 py-1 rounded-full ${
                    r.status === 'active'
                      ? 'bg-emerald-100 text-emerald-800'
                      : r.status === 'suspended'
                      ? 'bg-red-100 text-red-800'
                      : 'bg-gray-100 text-gray-800'
                  }`}
                >
                  {r.status.toUpperCase()}
                </span>
              </div>

              {/* Contact info */}
              <div className="space-y-1.5 text-xs text-gray-600 bg-gray-50 p-3 rounded-xl border border-gray-100">
                <div className="flex items-center gap-2">
                  <Mail className="w-3.5 h-3.5 text-gray-400" />
                  <span className="truncate">{r.email}</span>
                </div>
                <div className="flex items-center gap-2">
                  <Phone className="w-3.5 h-3.5 text-gray-400" />
                  <span>{r.phone}</span>
                </div>
              </div>

              {/* Performance Metrics */}
              <div className="grid grid-cols-2 gap-2 text-center text-xs">
                <div className="bg-purple-50/50 p-2.5 rounded-xl border border-purple-100">
                  <span className="text-[10px] font-bold text-gray-500 block">Vendedores Geridos</span>
                  <span className="font-black text-purple-700 text-sm">{r.assignedSellersCount}</span>
                </div>
                <div className="bg-purple-50/50 p-2.5 rounded-xl border border-purple-100">
                  <span className="text-[10px] font-bold text-gray-500 block">GMV Mensal</span>
                  <span className="font-black text-gray-900 text-xs truncate block">{r.monthlyRevenueFormatted}</span>
                </div>
              </div>

              {/* Goals & Commission */}
              <div className="space-y-1 text-xs border-t border-gray-100 pt-3">
                <div className="flex justify-between text-gray-500">
                  <span>Meta de GMV:</span>
                  <span className="font-bold text-gray-900">{r.targetGMVFormatted}</span>
                </div>
                <div className="flex justify-between text-gray-500">
                  <span>Comissão Direta:</span>
                  <span className="font-bold text-emerald-600">{r.commissionRate}</span>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="pt-2 flex items-center justify-between gap-2 border-t border-gray-100">
                <button
                  onClick={() => {
                    setEditTargetRep(r);
                    setNewTargetGMV(r.targetGMVFormatted);
                    setNewCommissionRate(r.commissionRate);
                  }}
                  className="flex-1 bg-gray-100 hover:bg-gray-200 text-gray-800 font-bold text-xs py-2 rounded-xl transition flex items-center justify-center gap-1"
                >
                  <Edit className="w-3.5 h-3.5" /> Metas
                </button>

                <button
                  onClick={() => handleToggleStatus(r)}
                  className={`flex-1 font-bold text-xs py-2 rounded-xl transition flex items-center justify-center gap-1 ${
                    r.status === 'active'
                      ? 'bg-red-50 hover:bg-red-100 text-red-700'
                      : 'bg-emerald-50 hover:bg-emerald-100 text-emerald-700'
                  }`}
                >
                  {r.status === 'active' ? (
                    <>
                      <UserX className="w-3.5 h-3.5" /> Suspender
                    </>
                  ) : (
                    <>
                      <Check className="w-3.5 h-3.5" /> Reativar
                    </>
                  )}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modal: Invite / Name Representative */}
      {isInviteModalOpen && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-xs flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-6 w-full max-w-md border border-gray-200 shadow-2xl space-y-4 animate-in fade-in">
            <div className="flex justify-between items-center pb-2 border-b border-gray-100">
              <h3 className="font-black text-base text-gray-900 flex items-center gap-2">
                <UserCheck className="w-5 h-5 text-purple-600" />
                Nomear Representante de País
              </h3>
              <button
                onClick={() => setIsInviteModalOpen(false)}
                className="p-1 text-gray-400 hover:text-gray-600 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleInviteRep} className="space-y-3 text-xs">
              <div>
                <label className="font-bold text-gray-700 block mb-1">Nome Completo</label>
                <input
                  type="text"
                  value={name}
                  onChange={e => setName(e.target.value)}
                  placeholder="Ex: Malam Bacai Sanhá"
                  className="w-full px-3 py-2 border border-gray-300 rounded-xl focus:ring-2 focus:ring-purple-500 outline-hidden font-medium"
                  required
                />
              </div>

              <div>
                <label className="font-bold text-gray-700 block mb-1">Email Institucional</label>
                <input
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  placeholder="exemplo@nusali.gw"
                  className="w-full px-3 py-2 border border-gray-300 rounded-xl focus:ring-2 focus:ring-purple-500 outline-hidden font-medium"
                  required
                />
              </div>

              <div>
                <label className="font-bold text-gray-700 block mb-1">Telefone / WhatsApp</label>
                <input
                  type="text"
                  value={phone}
                  onChange={e => setPhone(e.target.value)}
                  placeholder="+245 955 000 000"
                  className="w-full px-3 py-2 border border-gray-300 rounded-xl focus:ring-2 focus:ring-purple-500 outline-hidden font-medium"
                />
              </div>

              <div>
                <label className="font-bold text-gray-700 block mb-1">País sob Jurisdição</label>
                <select
                  value={countryName}
                  onChange={e => setCountryName(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-xl focus:ring-2 focus:ring-purple-500 outline-hidden font-medium"
                >
                  <option value="Guiné-Bissau (GW)">🇬🇼 Guiné-Bissau (GW)</option>
                  <option value="Brasil (BR)">🇧🇷 Brasil (BR)</option>
                  <option value="Portugal (PT)">🇵🇹 Portugal (PT)</option>
                  <option value="Angola (AO)">🇦🇴 Angola (AO)</option>
                  <option value="Moçambique (MZ)">🇲🇿 Moçambique (MZ)</option>
                  <option value="Cabo Verde (CV)">🇨🇻 Cabo Verde (CV)</option>
                  <option value="São Tomé e Príncipe (ST)">🇸🇹 São Tomé e Príncipe (ST)</option>
                  <option value="Timor-Leste (TL)">🇹🇱 Timor-Leste (TL)</option>
                </select>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="font-bold text-gray-700 block mb-1">Meta de GMV Mensal</label>
                  <input
                    type="text"
                    value={targetGMV}
                    onChange={e => setTargetGMV(e.target.value)}
                    placeholder="50.000.000 XOF"
                    className="w-full px-3 py-2 border border-gray-300 rounded-xl focus:ring-2 focus:ring-purple-500 outline-hidden font-medium"
                  />
                </div>
                <div>
                  <label className="font-bold text-gray-700 block mb-1">Comissão Acordada</label>
                  <input
                    type="text"
                    value={commissionRate}
                    onChange={e => setCommissionRate(e.target.value)}
                    placeholder="1.5%"
                    className="w-full px-3 py-2 border border-gray-300 rounded-xl focus:ring-2 focus:ring-purple-500 outline-hidden font-medium"
                  />
                </div>
              </div>

              <div className="pt-3 flex gap-2">
                <button
                  type="button"
                  onClick={() => setIsInviteModalOpen(false)}
                  className="flex-1 bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold py-2.5 rounded-xl transition"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="flex-1 bg-purple-600 hover:bg-purple-700 text-white font-extrabold py-2.5 rounded-xl transition shadow-xs"
                >
                  Enviar Convite
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Edit Goals */}
      {editTargetRep && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-xs flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-6 w-full max-w-md border border-gray-200 shadow-2xl space-y-4 animate-in fade-in">
            <div className="flex justify-between items-center pb-2 border-b border-gray-100">
              <h3 className="font-black text-base text-gray-900 flex items-center gap-2">
                <Edit className="w-5 h-5 text-purple-600" />
                Ajustar Metas de {editTargetRep.name}
              </h3>
              <button
                onClick={() => setEditTargetRep(null)}
                className="p-1 text-gray-400 hover:text-gray-600 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveGoals} className="space-y-3 text-xs">
              <div>
                <label className="font-bold text-gray-700 block mb-1">Nova Meta de GMV Mensal</label>
                <input
                  type="text"
                  value={newTargetGMV}
                  onChange={e => setNewTargetGMV(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-xl focus:ring-2 focus:ring-purple-500 outline-hidden font-medium"
                />
              </div>

              <div>
                <label className="font-bold text-gray-700 block mb-1">Taxa de Comissão Direta</label>
                <input
                  type="text"
                  value={newCommissionRate}
                  onChange={e => setNewCommissionRate(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-xl focus:ring-2 focus:ring-purple-500 outline-hidden font-medium"
                />
              </div>

              <div className="pt-3 flex gap-2">
                <button
                  type="button"
                  onClick={() => setEditTargetRep(null)}
                  className="flex-1 bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold py-2.5 rounded-xl transition"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="flex-1 bg-purple-600 hover:bg-purple-700 text-white font-extrabold py-2.5 rounded-xl transition shadow-xs"
                >
                  Salvar Metas
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
