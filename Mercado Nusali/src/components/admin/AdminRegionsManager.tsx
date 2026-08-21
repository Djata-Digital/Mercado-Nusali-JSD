import React, { useState, useEffect } from 'react';
import { MapPin, Plus, UserCheck, Truck, Clock, DollarSign, Settings, Search, X, CheckCircle, Shield, Loader2 } from 'lucide-react';
import { AdminService } from '../../services/adminService';
import { RegionData } from '../../data/mockRegions';

interface AdminRegionsManagerProps {
  showToast: (msg: string) => void;
}

export const AdminRegionsManager: React.FC<AdminRegionsManagerProps> = ({ showToast }) => {
  const [regions, setRegions] = useState<RegionData[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [filterCountry, setFilterCountry] = useState('all');
  const [searchTerm, setSearchTerm] = useState('');

  // Modal States
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [selectedSupervisorRegion, setSelectedSupervisorRegion] = useState<RegionData | null>(null);
  const [selectedCoverageRegion, setSelectedCoverageRegion] = useState<RegionData | null>(null);

  // Form states - Create Region
  const [newCode, setNewCode] = useState('');
  const [newName, setNewName] = useState('');
  const [newCountry, setNewCountry] = useState('GW');
  const [newSupervisorName, setNewSupervisorName] = useState('');
  const [newSupervisorEmail, setNewSupervisorEmail] = useState('');
  const [newCities, setNewCities] = useState('');
  const [newFreightRate, setNewFreightRate] = useState('1.500 XOF');
  const [newCoverageDays, setNewCoverageDays] = useState('24-48h');

  // Form states - Edit Supervisor
  const [editSupervisorName, setEditSupervisorName] = useState('');
  const [editSupervisorEmail, setEditSupervisorEmail] = useState('');

  // Form states - Edit Coverage
  const [editCities, setEditCities] = useState('');
  const [editCoverageDays, setEditCoverageDays] = useState('');
  const [editFreightRate, setEditFreightRate] = useState('');

  const fetchRegions = async () => {
    setIsLoading(true);
    try {
      const res = await AdminService.getRegions();
      if (res.success && res.data) {
        setRegions(res.data.map((r: any) => ({
          id: r.id,
          name: r.name,
          countryCode: r.countryCode || 'GW',
          supervisorName: r.supervisorName || 'A definir',
          supervisorEmail: r.supervisorEmail || 'supervisor@nusali.com',
          cities: [r.name],
          activeSellers: 0,
          activeStores: 0,
          monthlyOrders: 0,
          deliveryCoverageDays: r.deliveryCoverageDays || '24-48h',
          freightBaseRate: r.freightBaseRate || '1.500 XOF',
          status: r.status || 'active',
        })));
      } else {
        setRegions([]);
      }
    } catch {
      setRegions([]);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchRegions();
  }, []);

  const filtered = regions.filter(r => {
    const matchesCountry = filterCountry === 'all' || r.countryCode === filterCountry;
    const matchesSearch = r.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                          r.supervisorName.toLowerCase().includes(searchTerm.toLowerCase());
    return matchesCountry && matchesSearch;
  });

  const handleCreateRegion = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim()) {
      showToast('Por favor, informe o nome da região.');
      return;
    }

    try {
      const res = await AdminService.createRegion({
        name: newName,
        countryCode: newCountry,
        supervisorName: newSupervisorName || undefined,
        supervisorEmail: newSupervisorEmail || undefined,
        deliveryCoverageDays: newCoverageDays || undefined,
        freightBaseRate: newFreightRate || undefined,
      });

      if (res.success) {
        showToast(res.message || `Região "${newName}" criada com sucesso!`);
        fetchRegions();
      } else {
        showToast(res.error?.message || 'Erro ao cadastrar região.');
      }
    } catch {
      showToast('Erro ao cadastrar região.');
    }

    setIsCreateModalOpen(false);
    setNewCode('');
    setNewName('');
    setNewSupervisorName('');
    setNewSupervisorEmail('');
    setNewCities('');
  };

  const handleAssignSupervisorSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedSupervisorRegion) return;

    setRegions(prev => prev.map(r => {
      if (r.id === selectedSupervisorRegion.id) {
        return {
          ...r,
          supervisorName: editSupervisorName || r.supervisorName,
          supervisorEmail: editSupervisorEmail || r.supervisorEmail
        };
      }
      return r;
    }));

    showToast(`Supervisor "${editSupervisorName || selectedSupervisorRegion.supervisorName}" atribuído à região ${selectedSupervisorRegion.name}!`);
    setSelectedSupervisorRegion(null);
  };

  const handleCoverageSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCoverageRegion) return;

    const citiesArray = editCities.split(',').map(c => c.trim()).filter(Boolean);

    setRegions(prev => prev.map(r => {
      if (r.id === selectedCoverageRegion.id) {
        return {
          ...r,
          cities: citiesArray.length > 0 ? citiesArray : r.cities,
          deliveryCoverageDays: editCoverageDays || r.deliveryCoverageDays,
          freightBaseRate: editFreightRate || r.freightBaseRate
        };
      }
      return r;
    }));

    showToast(`Configurações de cobertura da região ${selectedCoverageRegion.name} salvas!`);
    setSelectedCoverageRegion(null);
  };

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-2xl p-6 border border-gray-200 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-gray-900 flex items-center gap-2">
            <MapPin className="w-6 h-6 text-emerald-600" />
            Gestão de Regiões, Províncias e Setores
          </h1>
          <p className="text-xs text-gray-500 mt-1">
            Supervisão regional de Bissau, Biombo, Cacheu, Oio, Bafatá, Gabú, Quinara, Tombali, Bolama/Bijagós e regiões CPLP.
          </p>
        </div>

        <button
          onClick={() => setIsCreateModalOpen(true)}
          className="bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-xs px-4 py-2.5 rounded-xl transition flex items-center gap-1.5 shadow-md cursor-pointer"
        >
          <Plus className="w-4 h-4" /> Criar Nova Região
        </button>
      </div>

      <div className="bg-white rounded-2xl border border-gray-200 shadow-xs p-4 flex flex-col md:flex-row items-center justify-between gap-4">
        <div className="flex items-center gap-2 w-full md:w-auto overflow-x-auto pb-1 md:pb-0">
          {[
            { id: 'all', label: 'Todas Regiões' },
            { id: 'GW', label: '🇬🇼 Guiné-Bissau (9 Regiões)' },
            { id: 'BR', label: '🇧🇷 Brasil' },
            { id: 'PT', label: '🇵🇹 Portugal' },
            { id: 'AO', label: '🇦🇴 Angola' },
          ].map(f => (
            <button
              key={f.id}
              onClick={() => setFilterCountry(f.id)}
              className={`px-3 py-1.5 text-xs font-bold rounded-xl whitespace-nowrap transition cursor-pointer ${
                filterCountry === f.id ? 'bg-emerald-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>

        <div className="relative w-full md:w-64">
          <Search className="w-4 h-4 text-gray-400 absolute left-3 top-2.5" />
          <input
            type="text"
            placeholder="Buscar região ou supervisor..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-9 pr-3 py-2 text-xs border border-gray-300 rounded-xl focus:ring-2 focus:ring-emerald-500"
          />
        </div>
      </div>

      {isLoading ? (
        <div className="p-12 text-center text-gray-400">
          <Loader2 className="w-8 h-8 animate-spin mx-auto text-purple-600 mb-2" />
          Carregando regiões...
        </div>
      ) : filtered.length === 0 ? (
        <div className="p-12 text-center text-gray-500 font-bold bg-white rounded-2xl border border-gray-200">
          Nenhuma região encontrada
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {filtered.map(r => (
          <div key={r.id} className="bg-white rounded-2xl border border-gray-200 shadow-xs p-5 space-y-4 hover:border-emerald-300 transition">
            <div className="flex justify-between items-start">
              <div>
                <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded font-mono">
                  {r.id}
                </span>
                <h3 className="font-extrabold text-sm text-gray-900 mt-1">{r.name}</h3>
              </div>
              <span className={`text-[10px] font-extrabold px-2 py-0.5 rounded-full ${
                r.status === 'active' ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'
              }`}>
                {r.status.toUpperCase()}
              </span>
            </div>

            <div className="bg-gray-50 p-3 rounded-xl space-y-1.5 text-xs">
              <div className="flex justify-between">
                <span className="text-gray-500 font-bold">Supervisor Regional:</span>
                <span className="font-extrabold text-gray-900">{r.supervisorName}</span>
              </div>
              <p className="text-[10px] text-gray-400">{r.supervisorEmail}</p>
            </div>

            <div className="space-y-1 text-xs">
              <span className="text-[10px] font-bold text-gray-400 uppercase block">Cidades & Setores Atendidos ({r.cities.length}):</span>
              <div className="flex flex-wrap gap-1 max-h-16 overflow-y-auto">
                {r.cities.map((city, idx) => (
                  <span key={idx} className="bg-gray-100 text-gray-700 font-medium px-2 py-0.5 rounded text-[10px]">
                    {city}
                  </span>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2 text-xs border-t border-gray-100 pt-3">
              <div>
                <span className="text-gray-400 text-[10px] block">Vendedores / Lojas</span>
                <span className="font-bold text-gray-800">{r.activeSellers} Vendedores / {r.activeStores} Lojas</span>
              </div>
              <div>
                <span className="text-gray-400 text-[10px] block">Pedidos Mensais</span>
                <span className="font-bold text-emerald-700">{r.monthlyOrders} pedidos</span>
              </div>
              <div>
                <span className="text-gray-400 text-[10px] block">Prazo Médio Frete</span>
                <span className="font-bold text-gray-800">{r.deliveryCoverageDays}</span>
              </div>
              <div>
                <span className="text-gray-400 text-[10px] block">Tarifa Base Frete</span>
                <span className="font-bold text-emerald-700">{r.freightBaseRate}</span>
              </div>
            </div>

            <div className="pt-2 flex items-center justify-between text-xs border-t border-gray-100">
              <button
                onClick={() => {
                  setSelectedSupervisorRegion(r);
                  setEditSupervisorName(r.supervisorName);
                  setEditSupervisorEmail(r.supervisorEmail);
                }}
                className="text-emerald-600 hover:text-emerald-800 font-bold cursor-pointer"
              >
                Atribuir Supervisor
              </button>
              <button
                onClick={() => {
                  setSelectedCoverageRegion(r);
                  setEditCities(r.cities.join(', '));
                  setEditCoverageDays(r.deliveryCoverageDays);
                  setEditFreightRate(r.freightBaseRate);
                }}
                className="text-gray-600 hover:text-gray-900 font-bold cursor-pointer"
              >
                Configurar Cobertura
              </button>
            </div>
          </div>
        ))}
      </div>
      )}

      {/* MODAL 1: Criar Nova Região */}
      {isCreateModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl p-6 max-w-lg w-full space-y-4 shadow-2xl border border-gray-200">
            <div className="flex justify-between items-center border-b border-gray-100 pb-3">
              <div className="flex items-center gap-2">
                <MapPin className="w-5 h-5 text-emerald-600" />
                <h3 className="font-extrabold text-base text-gray-900">Cadastrar Nova Região / Setor</h3>
              </div>
              <button onClick={() => setIsCreateModalOpen(false)} className="text-gray-400 hover:text-gray-600 cursor-pointer">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateRegion} className="space-y-3 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-gray-700 mb-1">Código da Região</label>
                  <input
                    type="text"
                    placeholder="Ex: REG-GW-09"
                    value={newCode}
                    onChange={(e) => setNewCode(e.target.value)}
                    className="w-full p-2.5 border border-gray-300 rounded-xl font-bold focus:ring-2 focus:ring-emerald-500"
                  />
                </div>
                <div>
                  <label className="block font-bold text-gray-700 mb-1">País</label>
                  <select
                    value={newCountry}
                    onChange={(e) => setNewCountry(e.target.value)}
                    className="w-full p-2.5 border border-gray-300 rounded-xl font-bold bg-white"
                  >
                    <option value="GW">🇬🇼 Guiné-Bissau</option>
                    <option value="BR">🇧🇷 Brasil</option>
                    <option value="PT">🇵🇹 Portugal</option>
                    <option value="AO">🇦🇴 Angola</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block font-bold text-gray-700 mb-1">Nome da Região / Província *</label>
                <input
                  type="text"
                  required
                  placeholder="Ex: Região de Bafatá"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  className="w-full p-2.5 border border-gray-300 rounded-xl font-bold focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-gray-700 mb-1">Supervisor Responsável</label>
                  <input
                    type="text"
                    placeholder="Nome do supervisor"
                    value={newSupervisorName}
                    onChange={(e) => setNewSupervisorName(e.target.value)}
                    className="w-full p-2.5 border border-gray-300 rounded-xl font-bold focus:ring-2 focus:ring-emerald-500"
                  />
                </div>
                <div>
                  <label className="block font-bold text-gray-700 mb-1">E-mail do Supervisor</label>
                  <input
                    type="email"
                    placeholder="supervisor@nusali.com"
                    value={newSupervisorEmail}
                    onChange={(e) => setNewSupervisorEmail(e.target.value)}
                    className="w-full p-2.5 border border-gray-300 rounded-xl font-bold focus:ring-2 focus:ring-emerald-500"
                  />
                </div>
              </div>

              <div>
                <label className="block font-bold text-gray-700 mb-1">Cidades & Setores Atendidos (separados por vírgula)</label>
                <textarea
                  rows={2}
                  placeholder="Ex: Bafatá Central, Contuboel, Galomaro, Bambadinca"
                  value={newCities}
                  onChange={(e) => setNewCities(e.target.value)}
                  className="w-full p-2.5 border border-gray-300 rounded-xl font-bold focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-gray-700 mb-1">Tarifa Base Frete</label>
                  <input
                    type="text"
                    placeholder="1.500 XOF"
                    value={newFreightRate}
                    onChange={(e) => setNewFreightRate(e.target.value)}
                    className="w-full p-2.5 border border-gray-300 rounded-xl font-bold focus:ring-2 focus:ring-emerald-500"
                  />
                </div>
                <div>
                  <label className="block font-bold text-gray-700 mb-1">Prazo de Entrega</label>
                  <input
                    type="text"
                    placeholder="24-48h"
                    value={newCoverageDays}
                    onChange={(e) => setNewCoverageDays(e.target.value)}
                    className="w-full p-2.5 border border-gray-300 rounded-xl font-bold focus:ring-2 focus:ring-emerald-500"
                  />
                </div>
              </div>

              <div className="pt-3 flex justify-end gap-2 border-t border-gray-100">
                <button
                  type="button"
                  onClick={() => setIsCreateModalOpen(false)}
                  className="px-4 py-2 border border-gray-300 rounded-xl font-bold text-gray-700 hover:bg-gray-50 cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold rounded-xl shadow-md cursor-pointer flex items-center gap-1.5"
                >
                  <Plus className="w-4 h-4" /> Criar Região
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 2: Atribuir Supervisor */}
      {selectedSupervisorRegion && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl p-6 max-w-md w-full space-y-4 shadow-2xl border border-gray-200">
            <div className="flex justify-between items-center border-b border-gray-100 pb-3">
              <div className="flex items-center gap-2">
                <UserCheck className="w-5 h-5 text-emerald-600" />
                <h3 className="font-extrabold text-base text-gray-900">Atribuir Supervisor Regional</h3>
              </div>
              <button onClick={() => setSelectedSupervisorRegion(null)} className="text-gray-400 hover:text-gray-600 cursor-pointer">
                <X className="w-5 h-5" />
              </button>
            </div>

            <p className="text-xs text-gray-500">
              Atualizar supervisor responsável pela supervisão comercial e logística de <strong>{selectedSupervisorRegion.name}</strong>.
            </p>

            <form onSubmit={handleAssignSupervisorSubmit} className="space-y-3 text-xs">
              <div>
                <label className="block font-bold text-gray-700 mb-1">Nome Completo do Supervisor</label>
                <input
                  type="text"
                  required
                  placeholder="Ex: Malam Sanhá"
                  value={editSupervisorName}
                  onChange={(e) => setEditSupervisorName(e.target.value)}
                  className="w-full p-2.5 border border-gray-300 rounded-xl font-bold focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              <div>
                <label className="block font-bold text-gray-700 mb-1">E-mail Institucional</label>
                <input
                  type="email"
                  required
                  placeholder="Ex: malam.sanha@nusali.com"
                  value={editSupervisorEmail}
                  onChange={(e) => setEditSupervisorEmail(e.target.value)}
                  className="w-full p-2.5 border border-gray-300 rounded-xl font-bold focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              <div className="pt-3 flex justify-end gap-2 border-t border-gray-100">
                <button
                  type="button"
                  onClick={() => setSelectedSupervisorRegion(null)}
                  className="px-4 py-2 border border-gray-300 rounded-xl font-bold text-gray-700 hover:bg-gray-50 cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold rounded-xl shadow-md cursor-pointer"
                >
                  Salvar Atribuição
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 3: Configurar Cobertura */}
      {selectedCoverageRegion && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl p-6 max-w-lg w-full space-y-4 shadow-2xl border border-gray-200">
            <div className="flex justify-between items-center border-b border-gray-100 pb-3">
              <div className="flex items-center gap-2">
                <Truck className="w-5 h-5 text-emerald-600" />
                <h3 className="font-extrabold text-base text-gray-900">Configurar Cobertura & Frete - {selectedCoverageRegion.name}</h3>
              </div>
              <button onClick={() => setSelectedCoverageRegion(null)} className="text-gray-400 hover:text-gray-600 cursor-pointer">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCoverageSubmit} className="space-y-3 text-xs">
              <div>
                <label className="block font-bold text-gray-700 mb-1">Cidades e Setores Cobertos (separados por vírgula)</label>
                <textarea
                  rows={3}
                  value={editCities}
                  onChange={(e) => setEditCities(e.target.value)}
                  className="w-full p-2.5 border border-gray-300 rounded-xl font-bold focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-gray-700 mb-1">Prazo de Entrega</label>
                  <input
                    type="text"
                    value={editCoverageDays}
                    onChange={(e) => setEditCoverageDays(e.target.value)}
                    className="w-full p-2.5 border border-gray-300 rounded-xl font-bold focus:ring-2 focus:ring-emerald-500"
                  />
                </div>
                <div>
                  <label className="block font-bold text-gray-700 mb-1">Tarifa Base de Frete</label>
                  <input
                    type="text"
                    value={editFreightRate}
                    onChange={(e) => setEditFreightRate(e.target.value)}
                    className="w-full p-2.5 border border-gray-300 rounded-xl font-bold focus:ring-2 focus:ring-emerald-500"
                  />
                </div>
              </div>

              <div className="pt-3 flex justify-end gap-2 border-t border-gray-100">
                <button
                  type="button"
                  onClick={() => setSelectedCoverageRegion(null)}
                  className="px-4 py-2 border border-gray-300 rounded-xl font-bold text-gray-700 hover:bg-gray-50 cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold rounded-xl shadow-md cursor-pointer"
                >
                  Atualizar Cobertura
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
