import React, { useState } from 'react';
import { Tag, Plus, CheckCircle, ShieldCheck, Edit2, Trash2, X, Check } from 'lucide-react';

interface AdminBrandsManagerProps {
  showToast: (msg: string) => void;
}

interface BrandItem {
  id: string;
  name: string;
  category: string;
  status: string;
  prods: number;
}

export const AdminBrandsManager: React.FC<AdminBrandsManagerProps> = ({ showToast }) => {
  const [brands, setBrands] = useState<BrandItem[]>([
    { id: 'BRD-1', name: 'Nusali Agro', category: 'Maquinaria Agrícola', status: 'Oficial Verificada', prods: 120 },
    { id: 'BRD-2', name: 'Nusali Solar Tech', category: 'Energia Solar', status: 'Oficial Verificada', prods: 85 },
    { id: 'BRD-3', name: 'Bissau Mobile', category: 'Smartphones', status: 'Marca Registrada', prods: 42 },
  ]);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingBrand, setEditingBrand] = useState<BrandItem | null>(null);

  const [formName, setFormName] = useState('');
  const [formCategory, setFormCategory] = useState('');
  const [formStatus, setFormStatus] = useState('Marca Registrada');

  const handleOpenCreate = () => {
    setEditingBrand(null);
    setFormName('');
    setFormCategory('');
    setFormStatus('Marca Registrada');
    setIsModalOpen(true);
  };

  const handleOpenEdit = (b: BrandItem) => {
    setEditingBrand(b);
    setFormName(b.name);
    setFormCategory(b.category);
    setFormStatus(b.status);
    setIsModalOpen(true);
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formName.trim() || !formCategory.trim()) {
      showToast('Por favor, preencha todos os campos da marca.');
      return;
    }

    if (editingBrand) {
      setBrands(prev =>
        prev.map(b =>
          b.id === editingBrand.id
            ? { ...b, name: formName, category: formCategory, status: formStatus }
            : b
        )
      );
      showToast(`Marca "${formName}" atualizada com sucesso!`);
    } else {
      const newBrand: BrandItem = {
        id: `BRD-${Date.now().toString().slice(-4)}`,
        name: formName,
        category: formCategory,
        status: formStatus,
        prods: 0
      };
      setBrands(prev => [...prev, newBrand]);
      showToast(`Nova marca "${formName}" registrada com sucesso!`);
    }

    setIsModalOpen(false);
  };

  const handleDelete = (id: string, name: string) => {
    if (confirm(`Deseja realmente remover a marca "${name}"?`)) {
      setBrands(prev => prev.filter(b => b.id !== id));
      showToast(`Marca "${name}" removida com sucesso.`);
    }
  };

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-2xl p-6 border border-gray-200 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-gray-900 flex items-center gap-2">
            <Tag className="w-6 h-6 text-purple-600" />
            Gestão de Marcas & Registro Oficial
          </h1>
          <p className="text-xs text-gray-500 mt-1">
            Cadastro e verificação de marcas autorizadas no marketplace.
          </p>
        </div>

        <button
          onClick={handleOpenCreate}
          className="bg-purple-600 hover:bg-purple-700 text-white font-extrabold text-xs px-4 py-2.5 rounded-xl transition flex items-center gap-1.5 shadow-md cursor-pointer"
        >
          <Plus className="w-4 h-4" /> Registrar Nova Marca
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {brands.map(b => (
          <div key={b.id} className="bg-white rounded-2xl border border-gray-200 shadow-xs p-5 space-y-3 relative group">
            <div className="flex justify-between items-start">
              <div>
                <h3 className="font-extrabold text-sm text-gray-900">{b.name}</h3>
                <span className="text-xs text-gray-500">{b.category}</span>
              </div>
              <span className="bg-purple-50 text-purple-700 text-[10px] font-black px-2 py-0.5 rounded">
                {b.status}
              </span>
            </div>
            <div className="flex items-center justify-between pt-2 border-t border-gray-100">
              <span className="text-xs font-bold text-gray-700">{b.prods} produtos vinculados</span>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => handleOpenEdit(b)}
                  className="p-1.5 text-purple-600 hover:bg-purple-50 rounded-lg cursor-pointer"
                  title="Editar Marca"
                >
                  <Edit2 className="w-4 h-4" />
                </button>
                <button
                  onClick={() => handleDelete(b.id, b.name)}
                  className="p-1.5 text-red-600 hover:bg-red-50 rounded-lg cursor-pointer"
                  title="Excluir Marca"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Modal Cadastrar / Editar Marca */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-gray-100 space-y-4 animate-fadeIn">
            <div className="flex items-center justify-between border-b border-gray-100 pb-3">
              <h3 className="font-black text-base text-gray-900 flex items-center gap-2">
                <Tag className="w-5 h-5 text-purple-600" />
                {editingBrand ? 'Editar Marca' : 'Registrar Nova Marca'}
              </h3>
              <button
                onClick={() => setIsModalOpen(false)}
                className="p-1 text-gray-400 hover:text-gray-600 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSave} className="space-y-4 text-xs">
              <div>
                <label className="block font-bold text-gray-700 mb-1">Nome da Marca:</label>
                <input
                  type="text"
                  required
                  placeholder="Ex: Bissau Tech"
                  value={formName}
                  onChange={e => setFormName(e.target.value)}
                  className="w-full p-2.5 border border-gray-300 rounded-xl focus:ring-2 focus:ring-purple-500 font-bold"
                />
              </div>

              <div>
                <label className="block font-bold text-gray-700 mb-1">Categoria Principal:</label>
                <input
                  type="text"
                  required
                  placeholder="Ex: Eletrônicos & Telefonia"
                  value={formCategory}
                  onChange={e => setFormCategory(e.target.value)}
                  className="w-full p-2.5 border border-gray-300 rounded-xl focus:ring-2 focus:ring-purple-500 font-bold"
                />
              </div>

              <div>
                <label className="block font-bold text-gray-700 mb-1">Status do Registro:</label>
                <select
                  value={formStatus}
                  onChange={e => setFormStatus(e.target.value)}
                  className="w-full p-2.5 border border-gray-300 rounded-xl focus:ring-2 focus:ring-purple-500 font-bold"
                >
                  <option value="Oficial Verificada">Oficial Verificada</option>
                  <option value="Marca Registrada">Marca Registrada</option>
                  <option value="Em Análise">Em Análise</option>
                </select>
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
                  <Check className="w-4 h-4" /> Salvar Marca
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
