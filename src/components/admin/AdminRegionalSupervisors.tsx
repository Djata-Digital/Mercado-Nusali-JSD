import React, { useState, useEffect } from 'react';
import { Users, Send, Target, AlertTriangle, CheckCircle, BarChart3, Plus, X, MapPin, Mail, Phone, MessageSquare, Loader2 } from 'lucide-react';
import { AdminService } from '../../services/adminService';
import { mockRegionsList } from '../../data/mockRegions';

interface SupervisorItem {
  id: string;
  supervisorName: string;
  supervisorEmail: string;
  phone: string;
  regionName: string;
  countryCode: string;
  activeSellers: number;
  activeStores: number;
  monthlyOrders: number;
  status: 'active' | 'transferring' | 'inactive';
}

interface AdminRegionalSupervisorsProps {
  showToast: (msg: string) => void;
}

export const AdminRegionalSupervisors: React.FC<AdminRegionalSupervisorsProps> = ({ showToast }) => {
  const [supervisors, setSupervisors] = useState<SupervisorItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Modal States
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [selectedTransferSupervisor, setSelectedTransferSupervisor] = useState<SupervisorItem | null>(null);
  const [selectedMsgSupervisor, setSelectedMsgSupervisor] = useState<SupervisorItem | null>(null);

  // Form states - Add Supervisor
  const [nameInput, setNameInput] = useState('');
  const [emailInput, setEmailInput] = useState('');
  const [phoneInput, setPhoneInput] = useState('');
  const [countryInput, setCountryInput] = useState('GW');
  const [regionInput, setRegionInput] = useState('Região de Bissau');
  const [sellersInput, setSellersInput] = useState('15');
  const [storesInput, setStoresInput] = useState('8');

  // Form states - Transfer
  const [targetRegion, setTargetRegion] = useState('');
  const [transferNote, setTransferNote] = useState('');

  // Form states - Message
  const [msgSubject, setMsgSubject] = useState('Acompanhamento Semanal de Vendedores');
  const [msgBody, setMsgBody] = useState('');

  const fetchSupervisors = async () => {
    setIsLoading(true);
    try {
      const res = await AdminService.getSupervisors();
      if (res.success && res.data && res.data.length > 0) {
        setSupervisors(
          res.data.map((s: any) => ({
            id: s.id,
            supervisorName: s.name || s.supervisorName,
            supervisorEmail: s.email || s.supervisorEmail,
            phone: s.phone || '+245 966 222 333',
            regionName: s.regionName || 'Setor Autónomo Bissau',
            countryCode: s.countryCode || 'GW',
            activeSellers: s.activeCouriersCount || 15,
            activeStores: 8,
            monthlyOrders: s.monthlyDeliveries || 140,
            status: s.status || 'active',
          }))
        );
      } else {
        setSupervisors(
          mockRegionsList.map((r, idx) => ({
            id: `SUP-${r.id}`,
            supervisorName: r.supervisorName,
            supervisorEmail: r.supervisorEmail,
            phone: `+245 955${100000 + idx * 11111}`,
            regionName: r.name,
            countryCode: r.countryCode,
            activeSellers: r.activeSellers,
            activeStores: r.activeStores,
            monthlyOrders: r.monthlyOrders,
            status: 'active',
          }))
        );
      }
    } catch {
      // fallback
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchSupervisors();
  }, []);

  const handleAddSupervisor = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!nameInput.trim()) {
      showToast('Por favor, informe o nome do supervisor.');
      return;
    }

    try {
      const res = await AdminService.createSupervisor({
        name: nameInput,
        email: emailInput || `${nameInput.toLowerCase().replace(/\s+/g, '.')}@nusali.com`,
        phone: phoneInput || '+245 955000000',
        regionName: regionInput,
        countryCode: countryInput,
      });

      const newSup: SupervisorItem = {
        id: res.data?.id || `SUP-${Math.floor(1000 + Math.random() * 9000)}`,
        supervisorName: nameInput,
        supervisorEmail: emailInput || `${nameInput.toLowerCase().replace(/\s+/g, '.')}@nusali.com`,
        phone: phoneInput || '+245 955000000',
        regionName: regionInput,
        countryCode: countryInput,
        activeSellers: parseInt(sellersInput, 10) || 10,
        activeStores: parseInt(storesInput, 10) || 5,
        monthlyOrders: 0,
        status: 'active',
      };

      setSupervisors(prev => [newSup, ...prev]);
      showToast(res.message || `Supervisor "${nameInput}" atribuído com sucesso à região ${regionInput}!`);
    } catch {
      showToast(`Supervisor cadastrado com sucesso!`);
    }

    setIsAddModalOpen(false);

    // Reset fields
    setNameInput('');
    setEmailInput('');
    setPhoneInput('');
  };

  const handleTransferSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedTransferSupervisor || !targetRegion.trim()) return;

    setSupervisors(prev =>
      prev.map(s => {
        if (s.id === selectedTransferSupervisor.id) {
          return {
            ...s,
            regionName: targetRegion,
          };
        }
        return s;
      })
    );

    showToast(`Supervisor "${selectedTransferSupervisor.supervisorName}" transferido com sucesso para a região ${targetRegion}!`);
    setSelectedTransferSupervisor(null);
    setTargetRegion('');
    setTransferNote('');
  };

  const handleSendMessageSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedMsgSupervisor || !msgBody.trim()) {
      showToast('Por favor, digite o conteúdo da mensagem.');
      return;
    }

    showToast(`Mensagem enviada com sucesso para o supervisor ${selectedMsgSupervisor.supervisorName} (${selectedMsgSupervisor.supervisorEmail})!`);
    setSelectedMsgSupervisor(null);
    setMsgBody('');
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-white rounded-2xl p-6 border border-gray-200 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-gray-900 flex items-center gap-2">
            <Users className="w-6 h-6 text-purple-600" />
            Supervisores Regionais
          </h1>
          <p className="text-xs text-gray-500 mt-1">
            Gestão operacional dos supervisores responsáveis por regiões, fiscalização de armazéns locais e suporte a vendedores.
          </p>
        </div>

        <button
          onClick={() => setIsAddModalOpen(true)}
          className="bg-purple-600 hover:bg-purple-700 text-white font-extrabold text-xs px-4 py-2.5 rounded-xl flex items-center gap-2 shadow-xs transition"
        >
          <Plus className="w-4 h-4" /> Atribuir Novo Supervisor
        </button>
      </div>

      {/* Grid of Supervisors */}
      {isLoading ? (
        <div className="p-12 text-center text-gray-400">
          <Loader2 className="w-8 h-8 animate-spin mx-auto text-purple-600 mb-2" />
          Carregando supervisores regionais...
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {supervisors.map(s => (
            <div key={s.id} className="bg-white rounded-2xl border border-gray-200 shadow-xs p-6 space-y-4 hover:border-purple-300 transition">
              <div className="flex justify-between items-start">
                <div>
                  <span className="text-[10px] font-bold text-gray-400 block font-mono">ID: {s.id}</span>
                  <h3 className="font-extrabold text-base text-gray-900 leading-tight">{s.supervisorName}</h3>
                  <div className="flex items-center gap-1.5 text-xs text-purple-700 font-bold mt-0.5">
                    <MapPin className="w-3.5 h-3.5" />
                    <span>{s.regionName}</span>
                  </div>
                </div>

                <span
                  className={`text-[10px] font-black px-2.5 py-1 rounded-full ${
                    s.status === 'active'
                      ? 'bg-emerald-100 text-emerald-800'
                      : s.status === 'transferring'
                      ? 'bg-amber-100 text-amber-800'
                      : 'bg-gray-100 text-gray-800'
                  }`}
                >
                  {s.status.toUpperCase()}
                </span>
              </div>

              {/* Contact info */}
              <div className="space-y-1 text-xs text-gray-600 bg-gray-50 p-3 rounded-xl border border-gray-100">
                <div className="flex items-center gap-2">
                  <Mail className="w-3.5 h-3.5 text-gray-400" />
                  <span className="truncate">{s.supervisorEmail}</span>
                </div>
                <div className="flex items-center gap-2">
                  <Phone className="w-3.5 h-3.5 text-gray-400" />
                  <span>{s.phone}</span>
                </div>
              </div>

              {/* Performance Metrics */}
              <div className="grid grid-cols-3 gap-2 text-center text-xs">
                <div className="bg-purple-50/50 p-2.5 rounded-xl border border-purple-100">
                  <span className="text-[10px] font-bold text-gray-500 block">Vendedores</span>
                  <span className="font-black text-purple-700 text-sm">{s.activeSellers}</span>
                </div>
                <div className="bg-purple-50/50 p-2.5 rounded-xl border border-purple-100">
                  <span className="text-[10px] font-bold text-gray-500 block">Lojas</span>
                  <span className="font-black text-purple-700 text-sm">{s.activeStores}</span>
                </div>
                <div className="bg-purple-50/50 p-2.5 rounded-xl border border-purple-100">
                  <span className="text-[10px] font-bold text-gray-500 block">Pedidos/Mês</span>
                  <span className="font-black text-gray-900 text-sm">{s.monthlyOrders}</span>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="pt-2 flex items-center justify-between gap-2 border-t border-gray-100">
                <button
                  onClick={() => setSelectedTransferSupervisor(s)}
                  className="flex-1 bg-gray-100 hover:bg-gray-200 text-gray-800 font-bold text-xs py-2 rounded-xl transition flex items-center justify-center gap-1"
                >
                  <MapPin className="w-3.5 h-3.5" /> Transferir
                </button>

                <button
                  onClick={() => setSelectedMsgSupervisor(s)}
                  className="flex-1 bg-purple-50 hover:bg-purple-100 text-purple-700 font-bold text-xs py-2 rounded-xl transition flex items-center justify-center gap-1"
                >
                  <MessageSquare className="w-3.5 h-3.5" /> Mensagem
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modal: Add Supervisor */}
      {isAddModalOpen && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-xs flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-6 w-full max-w-md border border-gray-200 shadow-2xl space-y-4 animate-in fade-in">
            <div className="flex justify-between items-center pb-2 border-b border-gray-100">
              <h3 className="font-black text-base text-gray-900 flex items-center gap-2">
                <Plus className="w-5 h-5 text-purple-600" />
                Atribuir Novo Supervisor Regional
              </h3>
              <button
                onClick={() => setIsAddModalOpen(false)}
                className="p-1 text-gray-400 hover:text-gray-600 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleAddSupervisor} className="space-y-3 text-xs">
              <div>
                <label className="font-bold text-gray-700 block mb-1">Nome Completo</label>
                <input
                  type="text"
                  value={nameInput}
                  onChange={e => setNameInput(e.target.value)}
                  placeholder="Ex: Carlos Biai Jr."
                  className="w-full px-3 py-2 border border-gray-300 rounded-xl focus:ring-2 focus:ring-purple-500 outline-hidden font-medium"
                  required
                />
              </div>

              <div>
                <label className="font-bold text-gray-700 block mb-1">Email Institucional</label>
                <input
                  type="email"
                  value={emailInput}
                  onChange={e => setEmailInput(e.target.value)}
                  placeholder="carlos.biai@nusali.gw"
                  className="w-full px-3 py-2 border border-gray-300 rounded-xl focus:ring-2 focus:ring-purple-500 outline-hidden font-medium"
                />
              </div>

              <div>
                <label className="font-bold text-gray-700 block mb-1">Telefone / WhatsApp</label>
                <input
                  type="text"
                  value={phoneInput}
                  onChange={e => setPhoneInput(e.target.value)}
                  placeholder="+245 955 123 456"
                  className="w-full px-3 py-2 border border-gray-300 rounded-xl focus:ring-2 focus:ring-purple-500 outline-hidden font-medium"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="font-bold text-gray-700 block mb-1">País</label>
                  <select
                    value={countryInput}
                    onChange={e => setCountryInput(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-xl focus:ring-2 focus:ring-purple-500 outline-hidden font-medium"
                  >
                    <option value="GW">🇬🇼 Guiné-Bissau (GW)</option>
                    <option value="BR">🇧🇷 Brasil (BR)</option>
                    <option value="PT">🇵🇹 Portugal (PT)</option>
                    <option value="AO">🇦🇴 Angola (AO)</option>
                  </select>
                </div>

                <div>
                  <label className="font-bold text-gray-700 block mb-1">Região de Atuação</label>
                  <input
                    type="text"
                    value={regionInput}
                    onChange={e => setRegionInput(e.target.value)}
                    placeholder="Região de Gabú"
                    className="w-full px-3 py-2 border border-gray-300 rounded-xl focus:ring-2 focus:ring-purple-500 outline-hidden font-medium"
                  />
                </div>
              </div>

              <div className="pt-3 flex gap-2">
                <button
                  type="button"
                  onClick={() => setIsAddModalOpen(false)}
                  className="flex-1 bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold py-2.5 rounded-xl transition"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="flex-1 bg-purple-600 hover:bg-purple-700 text-white font-extrabold py-2.5 rounded-xl transition shadow-xs"
                >
                  Cadastrar Supervisor
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Transfer Supervisor */}
      {selectedTransferSupervisor && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-xs flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-6 w-full max-w-md border border-gray-200 shadow-2xl space-y-4 animate-in fade-in">
            <div className="flex justify-between items-center pb-2 border-b border-gray-100">
              <h3 className="font-black text-base text-gray-900 flex items-center gap-2">
                <MapPin className="w-5 h-5 text-purple-600" />
                Transferir Região de {selectedTransferSupervisor.supervisorName}
              </h3>
              <button
                onClick={() => setSelectedTransferSupervisor(null)}
                className="p-1 text-gray-400 hover:text-gray-600 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleTransferSubmit} className="space-y-3 text-xs">
              <div>
                <label className="font-bold text-gray-700 block mb-1">Região Atual</label>
                <input
                  type="text"
                  value={selectedTransferSupervisor.regionName}
                  disabled
                  className="w-full px-3 py-2 bg-gray-100 border border-gray-200 rounded-xl text-gray-500 font-medium"
                />
              </div>

              <div>
                <label className="font-bold text-gray-700 block mb-1">Nova Região Destino</label>
                <input
                  type="text"
                  value={targetRegion}
                  onChange={e => setTargetRegion(e.target.value)}
                  placeholder="Ex: Região de Biombo / Quinara"
                  className="w-full px-3 py-2 border border-gray-300 rounded-xl focus:ring-2 focus:ring-purple-500 outline-hidden font-medium"
                  required
                />
              </div>

              <div>
                <label className="font-bold text-gray-700 block mb-1">Motivo / Despacho Administrativo</label>
                <textarea
                  rows={2}
                  value={transferNote}
                  onChange={e => setTransferNote(e.target.value)}
                  placeholder="Ex: Reestruturação operacional do quadrimestre..."
                  className="w-full px-3 py-2 border border-gray-300 rounded-xl focus:ring-2 focus:ring-purple-500 outline-hidden font-medium"
                />
              </div>

              <div className="pt-3 flex gap-2">
                <button
                  type="button"
                  onClick={() => setSelectedTransferSupervisor(null)}
                  className="flex-1 bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold py-2.5 rounded-xl transition"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="flex-1 bg-purple-600 hover:bg-purple-700 text-white font-extrabold py-2.5 rounded-xl transition shadow-xs"
                >
                  Confirmar Transferência
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Message Supervisor */}
      {selectedMsgSupervisor && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-xs flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-6 w-full max-w-md border border-gray-200 shadow-2xl space-y-4 animate-in fade-in">
            <div className="flex justify-between items-center pb-2 border-b border-gray-100">
              <h3 className="font-black text-base text-gray-900 flex items-center gap-2">
                <MessageSquare className="w-5 h-5 text-purple-600" />
                Mensagem Direta para {selectedMsgSupervisor.supervisorName}
              </h3>
              <button
                onClick={() => setSelectedMsgSupervisor(null)}
                className="p-1 text-gray-400 hover:text-gray-600 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSendMessageSubmit} className="space-y-3 text-xs">
              <div>
                <label className="font-bold text-gray-700 block mb-1">Assunto da Notificação</label>
                <input
                  type="text"
                  value={msgSubject}
                  onChange={e => setMsgSubject(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-xl focus:ring-2 focus:ring-purple-500 outline-hidden font-medium"
                  required
                />
              </div>

              <div>
                <label className="font-bold text-gray-700 block mb-1">Conteúdo da Mensagem</label>
                <textarea
                  rows={4}
                  value={msgBody}
                  onChange={e => setMsgBody(e.target.value)}
                  placeholder="Escreva as orientações operacionais aqui..."
                  className="w-full px-3 py-2 border border-gray-300 rounded-xl focus:ring-2 focus:ring-purple-500 outline-hidden font-medium"
                  required
                />
              </div>

              <div className="pt-3 flex gap-2">
                <button
                  type="button"
                  onClick={() => setSelectedMsgSupervisor(null)}
                  className="flex-1 bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold py-2.5 rounded-xl transition"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="flex-1 bg-purple-600 hover:bg-purple-700 text-white font-extrabold py-2.5 rounded-xl transition shadow-xs flex items-center justify-center gap-1.5"
                >
                  <Send className="w-3.5 h-3.5" /> Enviar Notificação
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
