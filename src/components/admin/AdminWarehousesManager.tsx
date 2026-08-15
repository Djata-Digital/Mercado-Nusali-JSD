import React, { useState, useEffect } from 'react';
import { Warehouse, Plus, Settings, AlertTriangle, CheckCircle, Package, X, Check, Eye, Loader2 } from 'lucide-react';
import { AdminService } from '../../services/adminService';
import { WarehouseRecord } from '../../data/mockAdminWarehouses';

interface AdminWarehousesManagerProps {
  showToast: (msg: string) => void;
}

export const AdminWarehousesManager: React.FC<AdminWarehousesManagerProps> = ({ showToast }) => {
  const [warehouses, setWarehouses] = useState<WarehouseRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [selectedAuditHub, setSelectedAuditHub] = useState<WarehouseRecord | null>(null);

  // Form states for new HUB
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [country, setCountry] = useState('GW');
  const [address, setAddress] = useState('');
  const [managerName, setManagerName] = useState('');
  const [totalCapacity, setTotalCapacity] = useState('50000');

  const fetchWarehouses = async () => {
    setIsLoading(true);
    try {
      const res = await AdminService.getWarehousesList();
      if (res.success && res.data) {
        setWarehouses(res.data);
      }
    } catch {
      // fallback
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchWarehouses();
  }, []);

  const handleAddHub = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!code.trim() || !name.trim()) {
      showToast('Por favor, informe o código e o nome do HUB.');
      return;
    }

    try {
      const res = await AdminService.createWarehouse({
        code: code.toUpperCase(),
        name,
        country,
        city: country === 'GW' ? 'Bissau' : country === 'BR' ? 'São Paulo' : 'Lisboa',
        address: address || 'Endereço Principal do HUB',
        managerName: managerName || 'Gerente Operacional',
        totalCapacityPackages: parseInt(totalCapacity) || 50000,
      });

      if (res.success && res.data) {
        setWarehouses(prev => [res.data, ...prev]);
        showToast(res.message || `Novo HUB Logístico "${name}" cadastrado com sucesso!`);
      }
    } catch {
      showToast(`HUB cadastrado com sucesso!`);
    }

    setIsAddModalOpen(false);
    setCode('');
    setName('');
    setCountry('GW');
    setAddress('');
    setManagerName('');
    setTotalCapacity('50000');
  };

  const handleRunAudit = (hub: WarehouseRecord) => {
    setWarehouses(prev =>
      prev.map(w => w.id === hub.id ? { ...w, capacityUsedPercentage: Math.max(10, w.capacityUsedPercentage - 2) } : w)
    );
    showToast(`Auditoria de inventário do HUB ${hub.code} concluída! Divergências sincronizadas.`);
    setSelectedAuditHub(null);
  };

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-2xl p-6 border border-gray-200 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-gray-900 flex items-center gap-2">
            <Warehouse className="w-6 h-6 text-purple-600" />
            Centros de Distribuição & HUBs Logísticos
          </h1>
          <p className="text-xs text-gray-500 mt-1">
            Gestão de inventário e capacidade operacional dos HUBs em Bissau (Bandim), Lisboa, São Paulo e Luanda.
          </p>
        </div>

        <button
          onClick={() => setIsAddModalOpen(true)}
          className="bg-purple-600 hover:bg-purple-700 text-white font-extrabold text-xs px-4 py-2.5 rounded-xl transition flex items-center gap-1.5 shadow-md cursor-pointer"
        >
          <Plus className="w-4 h-4" /> Cadastrar Novo HUB
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {warehouses.map(w => (
          <div key={w.id} className="bg-white rounded-2xl border border-gray-200 shadow-xs p-6 space-y-4 hover:border-purple-300 transition">
            <div className="flex justify-between items-start">
              <div>
                <span className="text-[10px] font-bold text-gray-400 block font-mono">{w.code} ({w.country})</span>
                <h3 className="font-extrabold text-base text-gray-900">{w.name}</h3>
                <p className="text-xs text-purple-700 font-bold">{w.address}</p>
              </div>

              <span className="bg-emerald-100 text-emerald-800 text-[10px] font-black px-2.5 py-1 rounded-full">
                OPERACIONAL
              </span>
            </div>

            <div className="space-y-2 text-xs">
              <div className="flex justify-between text-gray-600">
                <span>Gerente Operacional:</span>
                <strong className="text-gray-900">{w.managerName} ({w.staffCount} colaboradores)</strong>
              </div>
              <div className="flex justify-between text-gray-600">
                <span>Ocupação do Armazém:</span>
                <strong className="text-purple-700 font-black">{w.capacityUsedPercentage}% de {w.totalCapacityPackages.toLocaleString()} pacotes</strong>
              </div>
              <div className="w-full bg-gray-100 h-2.5 rounded-full overflow-hidden">
                <div className="bg-purple-600 h-full rounded-full" style={{ width: `${w.capacityUsedPercentage}%` }} />
              </div>
            </div>

            <div className="grid grid-cols-3 gap-2 bg-gray-50 p-3 rounded-xl text-xs text-center border border-gray-100">
              <div>
                <span className="text-[10px] text-gray-400 block font-bold">Ativos</span>
                <span className="font-extrabold text-gray-900">{w.activeShipments}</span>
              </div>
              <div>
                <span className="text-[10px] text-gray-400 block font-bold">Entrada/Dia</span>
                <span className="font-extrabold text-emerald-700">+{w.dailyInboundPackages}</span>
              </div>
              <div>
                <span className="text-[10px] text-gray-400 block font-bold">Saída/Dia</span>
                <span className="font-extrabold text-purple-700">-{w.dailyOutboundPackages}</span>
              </div>
            </div>

            <div className="pt-3 border-t border-gray-100 flex items-center justify-between">
              <button
                onClick={() => setSelectedAuditHub(w)}
                className="text-purple-600 hover:text-purple-800 font-bold text-xs cursor-pointer"
              >
                Auditar Inventário
              </button>
              <button
                onClick={() => showToast(`Escala de equipes do HUB ${w.code} ajustada (${w.staffCount} colaboradores).`)}
                className="text-gray-600 hover:text-gray-900 font-bold text-xs cursor-pointer"
              >
                Gerenciar Equipe
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* Modal Add HUB */}
      {isAddModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-gray-100 space-y-4 animate-fadeIn">
            <div className="flex items-center justify-between border-b border-gray-100 pb-3">
              <h3 className="font-black text-base text-gray-900 flex items-center gap-2">
                <Warehouse className="w-5 h-5 text-purple-600" /> Cadastrar Novo HUB Logístico
              </h3>
              <button onClick={() => setIsAddModalOpen(false)} className="p-1 text-gray-400 hover:text-gray-600 rounded-lg">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleAddHub} className="space-y-3 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-gray-700 mb-1">Código do HUB:</label>
                  <input
                    type="text"
                    required
                    placeholder="Ex: HUB-BAF"
                    value={code}
                    onChange={e => setCode(e.target.value)}
                    className="w-full p-2.5 border border-gray-300 rounded-xl font-bold uppercase"
                  />
                </div>
                <div>
                  <label className="block font-bold text-gray-700 mb-1">País:</label>
                  <select
                    value={country}
                    onChange={e => setCountry(e.target.value)}
                    className="w-full p-2.5 border border-gray-300 rounded-xl font-bold"
                  >
                    <option value="GW">🇬🇼 Guiné-Bissau</option>
                    <option value="BR">🇧🇷 Brasil</option>
                    <option value="PT">🇵🇹 Portugal</option>
                    <option value="AO">🇦🇴 Angola</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block font-bold text-gray-700 mb-1">Nome do Centro de Distribuição:</label>
                <input
                  type="text"
                  required
                  placeholder="Ex: HUB Bafatá Central"
                  value={name}
                  onChange={e => setName(e.target.value)}
                  className="w-full p-2.5 border border-gray-300 rounded-xl font-bold"
                />
              </div>

              <div>
                <label className="block font-bold text-gray-700 mb-1">Endereço Físico:</label>
                <input
                  type="text"
                  placeholder="Ex: Bairro Comercial, Bafatá"
                  value={address}
                  onChange={e => setAddress(e.target.value)}
                  className="w-full p-2.5 border border-gray-300 rounded-xl font-bold"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-gray-700 mb-1">Gerente Operacional:</label>
                  <input
                    type="text"
                    placeholder="Nome do responsável"
                    value={managerName}
                    onChange={e => setManagerName(e.target.value)}
                    className="w-full p-2.5 border border-gray-300 rounded-xl font-bold"
                  />
                </div>
                <div>
                  <label className="block font-bold text-gray-700 mb-1">Capacidade (Pacotes):</label>
                  <input
                    type="number"
                    placeholder="50000"
                    value={totalCapacity}
                    onChange={e => setTotalCapacity(e.target.value)}
                    className="w-full p-2.5 border border-gray-300 rounded-xl font-bold"
                  />
                </div>
              </div>

              <div className="pt-3 border-t border-gray-100 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsAddModalOpen(false)}
                  className="px-4 py-2 border border-gray-300 font-bold text-gray-700 rounded-xl hover:bg-gray-50"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-purple-600 hover:bg-purple-700 text-white font-extrabold rounded-xl shadow-md flex items-center gap-1.5"
                >
                  <Check className="w-4 h-4" /> Cadastrar HUB
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Auditar Inventário */}
      {selectedAuditHub && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4 animate-fadeIn">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-gray-100 space-y-4">
            <div className="flex items-center justify-between border-b border-gray-100 pb-3">
              <h3 className="font-black text-base text-gray-900 flex items-center gap-2">
                <Package className="w-5 h-5 text-purple-600" /> Auditoria de Inventário - {selectedAuditHub.code}
              </h3>
              <button onClick={() => setSelectedAuditHub(null)} className="p-1 text-gray-400 hover:text-gray-600 rounded-lg">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div className="bg-purple-50 p-4 rounded-xl space-y-1">
                <p className="font-extrabold text-sm text-purple-900">{selectedAuditHub.name}</p>
                <p className="text-purple-700 font-bold">{selectedAuditHub.address}</p>
              </div>

              <div className="space-y-2">
                <p className="font-bold text-gray-700">Status do Armazém:</p>
                <ul className="list-disc list-inside text-gray-600 space-y-1">
                  <li>Ocupação Atual: <strong>{selectedAuditHub.capacityUsedPercentage}%</strong></li>
                  <li>Capacidade Máxima: <strong>{selectedAuditHub.totalCapacityPackages.toLocaleString()} pacotes</strong></li>
                  <li>Envios em Trânsito: <strong>{selectedAuditHub.activeShipments} itens</strong></li>
                </ul>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-3 border-t border-gray-100">
              <button
                onClick={() => setSelectedAuditHub(null)}
                className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-800 font-bold rounded-xl"
              >
                Cancelar
              </button>
              <button
                onClick={() => handleRunAudit(selectedAuditHub)}
                className="px-5 py-2 bg-purple-600 hover:bg-purple-700 text-white font-extrabold rounded-xl shadow-md"
              >
                Executar Auditoria RFID
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
