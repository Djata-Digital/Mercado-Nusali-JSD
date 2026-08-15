import React, { useState } from 'react';
import { Layers, Plus, Edit2, Trash2, Tag, Percent, X, Check } from 'lucide-react';

interface AdminCategoriesManagerProps {
  showToast: (msg: string) => void;
}

interface CategoryItem {
  id: string;
  name: string;
  prods: number;
  commission: string;
  status: string;
}

export const AdminCategoriesManager: React.FC<AdminCategoriesManagerProps> = ({ showToast }) => {
  const [categories, setCategories] = useState<CategoryItem[]>([
    { id: 'CAT-1', name: 'Eletrônicos & Tecnologia', prods: 4500, commission: '4.5%', status: 'Ativa' },
    { id: 'CAT-2', name: 'Energia Solar & Sustentabilidade', prods: 1200, commission: '4.0%', status: 'Ativa' },
    { id: 'CAT-3', name: 'Agropecuária & Maquinaria', prods: 890, commission: '3.5%', status: 'Ativa' },
    { id: 'CAT-4', name: 'Moda, Artesanato & Cultura CPLP', prods: 6200, commission: '5.0%', status: 'Ativa' },
    { id: 'CAT-5', name: 'Alimentos & Produtos Típicos (Caju, Mel, Pimenta)', prods: 3100, commission: '4.0%', status: 'Ativa' }
  ]);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingCategory, setEditingCategory] = useState<CategoryItem | null>(null);

  const [formName, setFormName] = useState('');
  const [formCommission, setFormCommission] = useState('4.5%');
  const [formStatus, setFormStatus] = useState('Ativa');

  const handleOpenCreate = () => {
    setEditingCategory(null);
    setFormName('');
    setFormCommission('4.5%');
    setFormStatus('Ativa');
    setIsModalOpen(true);
  };

  const handleOpenEdit = (c: CategoryItem) => {
    setEditingCategory(c);
    setFormName(c.name);
    setFormCommission(c.commission);
    setFormStatus(c.status);
    setIsModalOpen(true);
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formName.trim()) {
      showToast('Por favor, digite o nome da categoria.');
      return;
    }

    if (editingCategory) {
      setCategories(prev =>
        prev.map(c =>
          c.id === editingCategory.id
            ? { ...c, name: formName, commission: formCommission, status: formStatus }
            : c
        )
      );
      showToast(`Categoria "${formName}" atualizada com sucesso!`);
    } else {
      const newCat: CategoryItem = {
        id: `CAT-${Date.now().toString().slice(-4)}`,
        name: formName,
        prods: 0,
        commission: formCommission,
        status: formStatus
      };
      setCategories(prev => [...prev, newCat]);
      showToast(`Nova categoria "${formName}" criada com sucesso!`);
    }

    setIsModalOpen(false);
  };

  const handleDelete = (id: string, name: string) => {
    if (confirm(`Tem certeza que deseja excluir a categoria "${name}"?`)) {
      setCategories(prev => prev.filter(c => c.id !== id));
      showToast(`Categoria "${name}" removida com sucesso.`);
    }
  };

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-2xl p-6 border border-gray-200 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-gray-900 flex items-center gap-2">
            <Layers className="w-6 h-6 text-purple-600" />
            Gestão da Árvore de Categorias & Comissões
          </h1>
          <p className="text-xs text-gray-500 mt-1">
            Mapeamento de categorias e comissões da plataforma para o mercado CPLP.
          </p>
        </div>

        <button
          onClick={handleOpenCreate}
          className="bg-purple-600 hover:bg-purple-700 text-white font-extrabold text-xs px-4 py-2.5 rounded-xl transition flex items-center gap-1.5 shadow-md cursor-pointer"
        >
          <Plus className="w-4 h-4" /> Criar Categoria
        </button>
      </div>

      <div className="bg-white rounded-2xl border border-gray-200 shadow-xs p-6 space-y-4">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200 text-gray-500 uppercase font-black text-[10px]">
                <th className="p-3">Categoria</th>
                <th className="p-3">Produtos Ativos</th>
                <th className="p-3">Comissão Base</th>
                <th className="p-3">Status</th>
                <th className="p-3 text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {categories.map(c => (
                <tr key={c.id} className="hover:bg-gray-50/50">
                  <td className="p-3 font-extrabold text-gray-900">{c.name}</td>
                  <td className="p-3 font-bold text-gray-700">{c.prods} produtos</td>
                  <td className="p-3 font-black text-purple-700">{c.commission}</td>
                  <td className="p-3">
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-black ${
                      c.status === 'Ativa' ? 'bg-emerald-100 text-emerald-800' : 'bg-gray-100 text-gray-600'
                    }`}>
                      {c.status}
                    </span>
                  </td>
                  <td className="p-3 text-right">
                    <div className="flex items-center justify-end gap-1">
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
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal Criar / Editar Categoria */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-gray-100 space-y-4 animate-fadeIn">
            <div className="flex items-center justify-between border-b border-gray-100 pb-3">
              <h3 className="font-black text-base text-gray-900 flex items-center gap-2">
                <Layers className="w-5 h-5 text-purple-600" />
                {editingCategory ? 'Editar Categoria' : 'Criar Nova Categoria'}
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
                <label className="block font-bold text-gray-700 mb-1">Nome da Categoria:</label>
                <input
                  type="text"
                  required
                  placeholder="Ex: Alimentos & Frutas Tropicais"
                  value={formName}
                  onChange={e => setFormName(e.target.value)}
                  className="w-full p-2.5 border border-gray-300 rounded-xl focus:ring-2 focus:ring-purple-500 font-bold"
                />
              </div>

              <div>
                <label className="block font-bold text-gray-700 mb-1">Comissão Base (%):</label>
                <input
                  type="text"
                  required
                  placeholder="Ex: 4.5%"
                  value={formCommission}
                  onChange={e => setFormCommission(e.target.value)}
                  className="w-full p-2.5 border border-gray-300 rounded-xl focus:ring-2 focus:ring-purple-500 font-bold"
                />
              </div>

              <div>
                <label className="block font-bold text-gray-700 mb-1">Status:</label>
                <select
                  value={formStatus}
                  onChange={e => setFormStatus(e.target.value)}
                  className="w-full p-2.5 border border-gray-300 rounded-xl focus:ring-2 focus:ring-purple-500 font-bold"
                >
                  <option value="Ativa">Ativa</option>
                  <option value="Inativa">Inativa</option>
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
                  <Check className="w-4 h-4" /> Salvar Categoria
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
