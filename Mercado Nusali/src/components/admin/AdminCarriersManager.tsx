import React, { useState } from 'react';
import { Truck, Plus, CheckCircle2, ShieldCheck, Edit2, Trash2, X, Check } from 'lucide-react';

interface AdminCarriersManagerProps {
  showToast: (msg: string) => void;
}

interface CarrierItem {
  id: string;
  name: string;
  coverage: string;
  SLA: string;
  status: string;
}

export const AdminCarriersManager: React.FC<AdminCarriersManagerProps> = ({ showToast }) => {
  const [carriers, setCarriers] = useState<CarrierItem[]>([]);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingCarrier, setEditingCarrier] = useState<CarrierItem | null>(null);

  const [formName, setFormName] = useState('');
  const [formCoverage, setFormCoverage] = useState('');
  const [formSLA, setFormSLA] = useState('24 horas');
  const [formStatus, setFormStatus] = useState('Ativo');

  const handleOpenCreate = () => {
    setEditingCarrier(null);
    setFormName('');
    setFormCoverage('');
    setFormSLA('24 horas');
    setFormStatus('Ativo');
    setIsModalOpen(true);
  };

  const handleOpenEdit = (c: CarrierItem) => {
    setEditingCarrier(c);
    setFormName(c.name);
    setFormCoverage(c.coverage);
    setFormSLA(c.SLA);
    setFormStatus(c.status);
    setIsModalOpen(true);
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formName.trim() || !formCoverage.trim()) {
      showToast('Por favor, preencha o nome e a área de cobertura da transportadora.');
      return;
    }

    if (editingCarrier) {
      setCarriers(prev =>
        prev.map(c =>
          c.id === editingCarrier.id
            ? { ...c, name: formName, coverage: formCoverage, SLA: formSLA, status: formStatus }
            : c
        )
      );
      showToast(`Transportadora "${formName}" atualizada com sucesso!`);
    } else {
      const newCar: CarrierItem = {
        id: `CAR-${Date.now().toString().slice(-4)}`,
        name: formName,
        coverage: formCoverage,
        SLA: formSLA,
        status: formStatus
      };
      setCarriers(prev => [...prev, newCar]);
      showToast(`Transportadora "${formName}" homologada com sucesso!`);
    }

    setIsModalOpen(false);
  };

  const handleDelete = (id: string, name: string) => {
    if (confirm(`Remover homologação da transportadora "${name}"?`)) {
      setCarriers(prev => prev.filter(c => c.id !== id));
      showToast(`Transportadora "${name}" removida do sistema.`);
    }
  };

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-2xl p-6 border border-gray-200 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-gray-900 flex items-center gap-2">
            <Truck className="w-6 h-6 text-purple-600" />
            Gestão de Transportadoras & Frotas Parceiras
          </h1>
          <p className="text-xs text-gray-500 mt-1">
            Homologação e SLA de parceiros logísticos na África Ocidental e rotas CPLP.
          </p>
        </div>

        <button
          onClick={handleOpenCreate}
          className="bg-purple-600 hover:bg-purple-700 text-white font-extrabold text-xs px-4 py-2.5 rounded-xl transition flex items-center gap-1.5 shadow-md cursor-pointer"
        >
          <Plus className="w-4 h-4" /> Homologar Transportadora
        </button>
      </div>

      {carriers.length === 0 ? (
        <div className="bg-white rounded-2xl border border-gray-200 p-12 text-center text-gray-400">
          <Truck className="w-12 h-12 mx-auto mb-3 text-gray-300 stroke-1" />
          <p className="font-bold text-sm text-gray-600">Nenhuma transportadora homologada cadastrada.</p>
          <p className="text-xs text-gray-400 mt-1">Clique no botão acima para cadastrar a primeira transportadora ou frota parceira.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {carriers.map(c => (
          <div key={c.id} className="bg-white rounded-2xl border border-gray-200 shadow-xs p-5 space-y-3">
            <div className="flex justify-between items-start">
              <div>
                <h3 className="font-extrabold text-sm text-gray-900">{c.name}</h3>
                <span className="text-xs text-gray-500">{c.coverage}</span>
              </div>
              <span className={`text-[10px] font-black px-2 py-0.5 rounded-full ${
                c.status === 'Ativo' ? 'bg-emerald-100 text-emerald-800' : 'bg-gray-100 text-gray-600'
              }`}>
                {c.status}
              </span>
            </div>
            <div className="text-xs font-bold text-purple-700">SLA Médio: {c.SLA}</div>

            <div className="pt-2 flex items-center justify-end gap-1 border-t border-gray-100">
              <button
                onClick={() => handleOpenEdit(c)}
                className="p-1.5 text-purple-600 hover:bg-purple-50 rounded-lg cursor-pointer"
                title="Editar"
              >
                <Edit2 className="w-4 h-4" />
              </button>
              <button
                onClick={() => handleDelete(c.id, c.name)}
                className="p-1.5 text-red-600 hover:bg-red-50 rounded-lg cursor-pointer"
                title="Excluir"
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
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-gray-100 space-y-4 animate-fadeIn">
            <div className="flex items-center justify-between border-b border-gray-100 pb-3">
              <h3 className="font-black text-base text-gray-900 flex items-center gap-2">
                <Truck className="w-5 h-5 text-purple-600" />
                {editingCarrier ? 'Editar Transportadora' : 'Homologar Transportadora'}
              </h3>
              <button onClick={() => setIsModalOpen(false)} className="p-1 text-gray-400 hover:text-gray-600 rounded-lg">
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
                  value={formName}
                  onChange={e => setFormName(e.target.value)}
                  className="w-full p-2.5 border border-gray-300 rounded-xl font-bold"
                />
              </div>

              <div>
                <label className="block font-bold text-gray-700 mb-1">Área de Cobertura:</label>
                <input
                  type="text"
                  required
                  placeholder="Ex: Bissau, Biombo & Oio"
                  value={formCoverage}
                  onChange={e => setFormCoverage(e.target.value)}
                  className="w-full p-2.5 border border-gray-300 rounded-xl font-bold"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-gray-700 mb-1">SLA Estimado:</label>
                  <input
                    type="text"
                    required
                    placeholder="Ex: 24-48 horas"
                    value={formSLA}
                    onChange={e => setFormSLA(e.target.value)}
                    className="w-full p-2.5 border border-gray-300 rounded-xl font-bold"
                  />
                </div>
                <div>
                  <label className="block font-bold text-gray-700 mb-1">Status:</label>
                  <select
                    value={formStatus}
                    onChange={e => setFormStatus(e.target.value)}
                    className="w-full p-2.5 border border-gray-300 rounded-xl font-bold"
                  >
                    <option value="Ativo">Ativo</option>
                    <option value="Inativo">Inativo</option>
                  </select>
                </div>
              </div>

              <div className="pt-3 border-t border-gray-100 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 border border-gray-300 font-bold text-gray-700 rounded-xl hover:bg-gray-50"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-purple-600 hover:bg-purple-700 text-white font-extrabold rounded-xl shadow-md flex items-center gap-1.5"
                >
                  <Check className="w-4 h-4" /> Salvar Homologação
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
