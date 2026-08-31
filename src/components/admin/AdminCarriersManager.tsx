import React, { useState, useEffect } from 'react';
import { Truck, Plus, Edit2, Trash2, X, Check, Loader2, Globe, Wifi, WifiOff } from 'lucide-react';
import { AdminService } from '../../services/adminService';

interface AdminCarriersManagerProps {
  showToast: (msg: string) => void;
}

interface Carrier {
  id: string;
  name: string;
  slug: string;
  countryCode: string;
  status: 'ACTIVE' | 'INACTIVE';
  integrationMode: 'MANUAL' | 'API_INTEGRATED';
  contactName: string | null;
  contactPhone: string | null;
  contactEmail: string | null;
  website: string | null;
  createdAt: string;
}

const EMPTY_FORM = {
  name: '',
  countryCode: 'GW',
  status: 'ACTIVE' as 'ACTIVE' | 'INACTIVE',
  integrationMode: 'MANUAL' as 'MANUAL' | 'API_INTEGRATED',
  contactName: '',
  contactPhone: '',
  contactEmail: '',
  website: '',
};

// Fase "Transportadoras Persistentes": substitui a tela mock/in-memory
// (estado React perdido a cada F5) por uma entidade real em PostgreSQL —
// GET/POST/PATCH/DELETE /admin/carriers. Nenhum estado local é fonte de
// verdade; toda ação recarrega do banco.
export const AdminCarriersManager: React.FC<AdminCarriersManagerProps> = ({ showToast }) => {
  const [carriers, setCarriers] = useState<Carrier[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingCarrier, setEditingCarrier] = useState<Carrier | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);

  const fetchCarriers = async () => {
    setIsLoading(true);
    try {
      const res = await AdminService.getCarriers();
      if (res.success && Array.isArray(res.data)) {
        setCarriers(res.data);
      } else if (res.message) {
        showToast(res.message);
      }
    } catch (err: any) {
      showToast(err?.message || 'Erro ao carregar transportadoras.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchCarriers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleOpenCreate = () => {
    setEditingCarrier(null);
    setForm(EMPTY_FORM);
    setIsModalOpen(true);
  };

  const handleOpenEdit = (c: Carrier) => {
    setEditingCarrier(c);
    setForm({
      name: c.name,
      countryCode: c.countryCode,
      status: c.status,
      integrationMode: c.integrationMode,
      contactName: c.contactName || '',
      contactPhone: c.contactPhone || '',
      contactEmail: c.contactEmail || '',
      website: c.website || '',
    });
    setIsModalOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) {
      showToast('Informe o nome da transportadora.');
      return;
    }
    setIsSaving(true);
    try {
      const payload = {
        name: form.name.trim(),
        countryCode: form.countryCode,
        status: form.status,
        integrationMode: form.integrationMode,
        contactName: form.contactName.trim() || null,
        contactPhone: form.contactPhone.trim() || null,
        contactEmail: form.contactEmail.trim() || null,
        website: form.website.trim() || null,
      };
      const res = editingCarrier
        ? await AdminService.updateCarrier(editingCarrier.id, payload)
        : await AdminService.createCarrier(payload);

      if (res.success) {
        showToast(res.message || 'Transportadora salva com sucesso!');
        setIsModalOpen(false);
        await fetchCarriers();
      } else {
        showToast(res.message || 'Erro ao salvar transportadora.');
      }
    } catch (err: any) {
      showToast(err?.response?.data?.error?.message || err?.message || 'Erro ao salvar transportadora.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleToggleStatus = async (c: Carrier) => {
    const newStatus = c.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE';
    try {
      const res = await AdminService.updateCarrier(c.id, { status: newStatus });
      if (res.success) {
        showToast(`Transportadora "${c.name}" ${newStatus === 'ACTIVE' ? 'ativada' : 'desativada'}.`);
        await fetchCarriers();
      } else {
        showToast(res.message || 'Erro ao atualizar status.');
      }
    } catch (err: any) {
      showToast(err?.message || 'Erro ao atualizar status.');
    }
  };

  const handleDelete = async (c: Carrier) => {
    if (!confirm(`Remover transportadora "${c.name}"? Se ela já foi usada em algum envio, será apenas desativada (histórico preservado).`)) return;
    try {
      const res = await AdminService.deleteCarrier(c.id);
      if (res.success) {
        showToast(res.message || 'Transportadora removida.');
        await fetchCarriers();
      } else {
        showToast(res.message || 'Erro ao remover transportadora.');
      }
    } catch (err: any) {
      showToast(err?.message || 'Erro ao remover transportadora.');
    }
  };

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-2xl p-6 border border-gray-200 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-gray-900 flex items-center gap-2">
            <Truck className="w-6 h-6 text-purple-600" />
            Gestão de Transportadoras
          </h1>
          <p className="text-xs text-gray-500 mt-1">
            Cadastro real e persistente de transportadoras — usadas na atribuição de envios pelo painel de logística.
          </p>
        </div>

        <button
          onClick={handleOpenCreate}
          className="bg-purple-600 hover:bg-purple-700 text-white font-extrabold text-xs px-4 py-2.5 rounded-xl transition flex items-center gap-1.5 shadow-md cursor-pointer"
        >
          <Plus className="w-4 h-4" /> Cadastrar Transportadora
        </button>
      </div>

      {isLoading ? (
        <div className="bg-white rounded-2xl border border-gray-200 p-12 text-center text-gray-400">
          <Loader2 className="w-8 h-8 animate-spin mx-auto mb-2 text-purple-600" />
          Carregando transportadoras...
        </div>
      ) : carriers.length === 0 ? (
        <div className="bg-white rounded-2xl border border-gray-200 p-12 text-center text-gray-400">
          <Truck className="w-12 h-12 mx-auto mb-3 text-gray-300 stroke-1" />
          <p className="font-bold text-sm text-gray-600">Nenhuma transportadora cadastrada.</p>
          <p className="text-xs text-gray-400 mt-1">Clique no botão acima para cadastrar a primeira.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {carriers.map((c) => (
            <div key={c.id} className="bg-white rounded-2xl border border-gray-200 shadow-xs p-5 space-y-3">
              <div className="flex justify-between items-start">
                <div>
                  <h3 className="font-extrabold text-sm text-gray-900">{c.name}</h3>
                  <span className="text-xs text-gray-500 flex items-center gap-1 mt-0.5">
                    <Globe className="w-3 h-3" /> {c.countryCode}
                  </span>
                </div>
                <button
                  onClick={() => handleToggleStatus(c)}
                  className={`text-[10px] font-black px-2 py-0.5 rounded-full cursor-pointer transition ${
                    c.status === 'ACTIVE' ? 'bg-emerald-100 text-emerald-800 hover:bg-emerald-200' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }`}
                  title="Clique para alternar status"
                >
                  {c.status}
                </button>
              </div>

              <div className="text-xs font-bold text-purple-700 flex items-center gap-1.5">
                {c.integrationMode === 'API_INTEGRATED' ? <Wifi className="w-3.5 h-3.5" /> : <WifiOff className="w-3.5 h-3.5 text-gray-400" />}
                {c.integrationMode === 'API_INTEGRATED' ? 'Integração via API' : 'Rastreio Manual'}
              </div>

              {(c.contactName || c.contactPhone) && (
                <div className="text-[11px] text-gray-500">
                  {c.contactName && <p>{c.contactName}</p>}
                  {c.contactPhone && <p className="font-mono">{c.contactPhone}</p>}
                </div>
              )}

              <div className="pt-2 flex items-center justify-end gap-1 border-t border-gray-100">
                <button
                  onClick={() => handleOpenEdit(c)}
                  className="p-1.5 text-purple-600 hover:bg-purple-50 rounded-lg cursor-pointer"
                  title="Editar"
                >
                  <Edit2 className="w-4 h-4" />
                </button>
                <button
                  onClick={() => handleDelete(c)}
                  className="p-1.5 text-red-600 hover:bg-red-50 rounded-lg cursor-pointer"
                  title="Remover / Desativar"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modal Cadastrar / Editar */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-gray-100 space-y-4 animate-fadeIn max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-gray-100 pb-3">
              <h3 className="font-black text-base text-gray-900 flex items-center gap-2">
                <Truck className="w-5 h-5 text-purple-600" />
                {editingCarrier ? 'Editar Transportadora' : 'Cadastrar Transportadora'}
              </h3>
              <button onClick={() => setIsModalOpen(false)} className="p-1 text-gray-400 hover:text-gray-600 rounded-lg cursor-pointer">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSave} className="space-y-3 text-xs">
              <div>
                <label className="block font-bold text-gray-700 mb-1">Nome da Transportadora:</label>
                <input
                  type="text"
                  required
                  placeholder="Ex: Guiné Logistics Express"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  className="w-full p-2.5 border border-gray-300 rounded-xl font-bold"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-gray-700 mb-1">País:</label>
                  <select
                    value={form.countryCode}
                    onChange={(e) => setForm({ ...form, countryCode: e.target.value })}
                    className="w-full p-2.5 border border-gray-300 rounded-xl font-bold bg-white"
                  >
                    <option value="GW">🇬🇼 Guiné-Bissau</option>
                    <option value="BR">🇧🇷 Brasil</option>
                    <option value="PT">🇵🇹 Portugal</option>
                    <option value="AO">🇦🇴 Angola</option>
                    <option value="CV">🇨🇻 Cabo Verde</option>
                    <option value="MZ">🇲🇿 Moçambique</option>
                    <option value="ST">🇸🇹 São Tomé e Príncipe</option>
                    <option value="TL">🇹🇱 Timor-Leste</option>
                    <option value="GQ">🇬🇶 Guiné Equatorial</option>
                  </select>
                </div>
                <div>
                  <label className="block font-bold text-gray-700 mb-1">Status:</label>
                  <select
                    value={form.status}
                    onChange={(e) => setForm({ ...form, status: e.target.value as 'ACTIVE' | 'INACTIVE' })}
                    className="w-full p-2.5 border border-gray-300 rounded-xl font-bold bg-white"
                  >
                    <option value="ACTIVE">Ativo</option>
                    <option value="INACTIVE">Inativo</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block font-bold text-gray-700 mb-1">Modo de Integração:</label>
                <select
                  value={form.integrationMode}
                  onChange={(e) => setForm({ ...form, integrationMode: e.target.value as 'MANUAL' | 'API_INTEGRATED' })}
                  className="w-full p-2.5 border border-gray-300 rounded-xl font-bold bg-white"
                >
                  <option value="MANUAL">Manual (logística registra o rastreio à mão)</option>
                  <option value="API_INTEGRATED">Integrado via API (em breve — nenhum provedor conectado ainda)</option>
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-gray-700 mb-1">Contato (nome):</label>
                  <input
                    type="text"
                    value={form.contactName}
                    onChange={(e) => setForm({ ...form, contactName: e.target.value })}
                    className="w-full p-2.5 border border-gray-300 rounded-xl font-bold"
                  />
                </div>
                <div>
                  <label className="block font-bold text-gray-700 mb-1">Telefone:</label>
                  <input
                    type="text"
                    value={form.contactPhone}
                    onChange={(e) => setForm({ ...form, contactPhone: e.target.value })}
                    className="w-full p-2.5 border border-gray-300 rounded-xl font-bold"
                  />
                </div>
              </div>

              <div>
                <label className="block font-bold text-gray-700 mb-1">E-mail de contato:</label>
                <input
                  type="email"
                  value={form.contactEmail}
                  onChange={(e) => setForm({ ...form, contactEmail: e.target.value })}
                  className="w-full p-2.5 border border-gray-300 rounded-xl font-bold"
                />
              </div>

              <div className="pt-3 border-t border-gray-100 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 border border-gray-300 font-bold text-gray-700 rounded-xl hover:bg-gray-50 cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isSaving}
                  className="px-5 py-2 bg-purple-600 hover:bg-purple-700 text-white font-extrabold rounded-xl shadow-md flex items-center gap-1.5 disabled:opacity-50 cursor-pointer"
                >
                  {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />} Salvar
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
