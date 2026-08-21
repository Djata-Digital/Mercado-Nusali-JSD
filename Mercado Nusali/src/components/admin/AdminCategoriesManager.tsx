import React, { useState, useEffect, useMemo } from 'react';
import {
  Layers,
  Plus,
  Edit2,
  Trash2,
  X,
  Check,
  Loader2,
  FolderTree,
  CornerDownRight,
  ChevronRight,
  Sliders,
  Settings2,
  FileText,
  ListPlus,
  Hash,
  CheckSquare,
} from 'lucide-react';
import { AdminApi } from '../../api/clients/AdminApi';
import {
  Category,
  CategoryNode,
  buildCategoryTree,
  getCategoryPath,
  wouldCreateCycle,
} from '../../utils/categoryUtils';

interface AdminCategoriesManagerProps {
  showToast: (msg: string) => void;
}

interface CategoryAttributeItem {
  id: string;
  categoryId: string;
  name: string;
  code: string;
  type: string;
  isRequired: boolean;
  optionsJson?: string[] | null;
  placeholder?: string | null;
  helpText?: string | null;
  unit?: string | null;
  sortOrder: number;
  isActive: boolean;
}

export const AdminCategoriesManager: React.FC<AdminCategoriesManagerProps> = ({ showToast }) => {
  const [categories, setCategories] = useState<Category[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Category Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingCategory, setEditingCategory] = useState<Category | null>(null);
  const [formName, setFormName] = useState('');
  const [formCommission, setFormCommission] = useState('4.5%');
  const [formStatus, setFormStatus] = useState('Ativa');
  const [formParentId, setFormParentId] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Category Attributes Management State
  const [attributesCategory, setAttributesCategory] = useState<Category | null>(null);
  const [categoryAttributesList, setCategoryAttributesList] = useState<CategoryAttributeItem[]>([]);
  const [isLoadingAttributes, setIsLoadingAttributes] = useState(false);

  // Category Attribute Create/Edit Form State
  const [isAttributeModalOpen, setIsAttributeModalOpen] = useState(false);
  const [editingAttribute, setEditingAttribute] = useState<CategoryAttributeItem | null>(null);
  const [attrName, setAttrName] = useState('');
  const [attrCode, setAttrCode] = useState('');
  const [attrType, setAttrType] = useState('text');
  const [attrIsRequired, setAttrIsRequired] = useState(false);
  const [attrOptionsRaw, setAttrOptionsRaw] = useState('');
  const [attrPlaceholder, setAttrPlaceholder] = useState('');
  const [attrHelpText, setAttrHelpText] = useState('');
  const [attrUnit, setAttrUnit] = useState('');
  const [attrSortOrder, setAttrSortOrder] = useState('0');
  const [isSavingAttribute, setIsSavingAttribute] = useState(false);

  const fetchCategories = async () => {
    setIsLoading(true);
    try {
      const res = await AdminApi.getCategories();
      if (res.success && Array.isArray(res.data)) {
        setCategories(res.data);
      } else {
        setCategories([]);
      }
    } catch (err: any) {
      console.error('Error fetching admin categories:', err);
      showToast('Erro ao carregar categorias do banco de dados.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchCategories();
  }, []);

  const categoryTree = useMemo(() => {
    return buildCategoryTree(categories);
  }, [categories]);

  const handleOpenCreateMain = () => {
    setEditingCategory(null);
    setFormName('');
    setFormCommission('4.5%');
    setFormStatus('Ativa');
    setFormParentId('');
    setIsModalOpen(true);
  };

  const handleOpenAddSubcategory = (parentCategory: Category) => {
    setEditingCategory(null);
    setFormName('');
    setFormCommission('4.5%');
    setFormStatus('Ativa');
    setFormParentId(parentCategory.id);
    setIsModalOpen(true);
  };

  const handleOpenEdit = (c: Category) => {
    setEditingCategory(c);
    setFormName(c.name);
    setFormCommission(c.commission || '4.5%');
    setFormStatus(c.isActive !== false ? 'Ativa' : 'Inativa');
    setFormParentId(c.parentId || '');
    setIsModalOpen(true);
  };

  const handleToggleActive = async (c: Category) => {
    const newActiveState = !(c.isActive !== false);
    try {
      const res = await AdminApi.updateCategory(c.id, { isActive: newActiveState });
      if (res.success) {
        showToast(`Categoria "${c.name}" ${newActiveState ? 'ativada' : 'desativada'} com sucesso!`);
        fetchCategories();
      } else {
        showToast(res.message || 'Erro ao alterar status da categoria.');
      }
    } catch (err) {
      showToast('Erro ao alterar status da categoria.');
    }
  };

  const handleSaveCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formName.trim()) {
      showToast('Por favor, digite o nome da categoria.');
      return;
    }

    const parentIdValue = formParentId.trim() || null;

    if (editingCategory && parentIdValue) {
      if (wouldCreateCycle(editingCategory.id, parentIdValue, categories)) {
        showToast(
          'Operação bloqueada: Uma categoria não pode ser pai dela mesma nem filha de um dos seus descendentes.'
        );
        return;
      }
    }

    setIsSubmitting(true);
    const isActive = formStatus === 'Ativa';

    try {
      if (editingCategory) {
        const res = await AdminApi.updateCategory(editingCategory.id, {
          name: formName.trim(),
          parentId: parentIdValue,
          isActive,
        });
        if (res.success) {
          showToast(`Categoria "${formName}" atualizada com sucesso no Supabase!`);
          fetchCategories();
          setIsModalOpen(false);
        } else {
          showToast(res.message || 'Erro ao atualizar categoria.');
        }
      } else {
        const res = await AdminApi.createCategory({
          name: formName.trim(),
          parentId: parentIdValue,
          isActive,
        });
        if (res.success) {
          showToast(`Nova categoria "${formName}" criada com sucesso no Supabase!`);
          fetchCategories();
          setIsModalOpen(false);
        } else {
          showToast(res.message || 'Erro ao criar categoria.');
        }
      }
    } catch (err: any) {
      showToast('Erro ao salvar categoria no servidor.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteCategory = async (id: string, name: string) => {
    if (confirm(`Tem certeza que deseja excluir a categoria "${name}"?`)) {
      try {
        const res = await AdminApi.deleteCategory(id);
        if (res.success) {
          showToast(`Categoria "${name}" removida com sucesso.`);
          fetchCategories();
        } else {
          showToast(res.message || 'Erro ao remover categoria.');
        }
      } catch (err: any) {
        showToast(err.message || 'Erro ao remover categoria.');
      }
    }
  };

  // Attributes Handlers
  const handleOpenAttributesModal = async (category: Category) => {
    setAttributesCategory(category);
    setIsLoadingAttributes(true);
    try {
      const res = await AdminApi.getCategoryAttributes(category.id);
      if (res.success && Array.isArray(res.data)) {
        setCategoryAttributesList(res.data);
      } else {
        setCategoryAttributesList([]);
      }
    } catch {
      showToast('Erro ao carregar atributos da categoria.');
    } finally {
      setIsLoadingAttributes(false);
    }
  };

  const handleOpenCreateAttribute = () => {
    setEditingAttribute(null);
    setAttrName('');
    setAttrCode('');
    setAttrType('text');
    setAttrIsRequired(false);
    setAttrOptionsRaw('');
    setAttrPlaceholder('');
    setAttrHelpText('');
    setAttrUnit('');
    setAttrSortOrder('0');
    setIsAttributeModalOpen(true);
  };

  const handleOpenEditAttribute = (attr: CategoryAttributeItem) => {
    setEditingAttribute(attr);
    setAttrName(attr.name);
    setAttrCode(attr.code);
    setAttrType(attr.type || 'text');
    setAttrIsRequired(attr.isRequired);
    setAttrOptionsRaw(Array.isArray(attr.optionsJson) ? attr.optionsJson.join('\n') : '');
    setAttrPlaceholder(attr.placeholder || '');
    setAttrHelpText(attr.helpText || '');
    setAttrUnit(attr.unit || '');
    setAttrSortOrder(String(attr.sortOrder || 0));
    setIsAttributeModalOpen(true);
  };

  const handleSaveAttribute = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!attributesCategory) return;
    if (!attrName.trim()) {
      showToast('O nome do atributo é obrigatório.');
      return;
    }

    setIsSavingAttribute(true);

    const generatedCode = attrCode.trim()
      ? attrCode.trim().toLowerCase().replace(/[^a-z0-9_]+/g, '_')
      : attrName.trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9_]+/g, '_');

    const optionsArray = (attrType === 'select' || attrType === 'multiselect')
      ? attrOptionsRaw.split('\n').map((s) => s.trim()).filter(Boolean)
      : null;

    const payload = {
      name: attrName.trim(),
      code: generatedCode,
      type: attrType,
      isRequired: attrIsRequired,
      optionsJson: optionsArray,
      placeholder: attrPlaceholder.trim() || null,
      helpText: attrHelpText.trim() || null,
      unit: attrUnit.trim() || null,
      sortOrder: parseInt(attrSortOrder) || 0,
      isActive: true,
    };

    try {
      if (editingAttribute) {
        const res = await AdminApi.updateCategoryAttribute(editingAttribute.id, payload);
        if (res.success) {
          showToast(`Atributo "${attrName}" atualizado com sucesso!`);
          setIsAttributeModalOpen(false);
          handleOpenAttributesModal(attributesCategory);
        } else {
          showToast(res.message || 'Erro ao atualizar atributo.');
        }
      } else {
        const res = await AdminApi.createCategoryAttribute(attributesCategory.id, payload);
        if (res.success) {
          showToast(`Atributo "${attrName}" criado com sucesso no Supabase!`);
          setIsAttributeModalOpen(false);
          handleOpenAttributesModal(attributesCategory);
        } else {
          showToast(res.message || 'Erro ao criar atributo.');
        }
      }
    } catch (err: any) {
      showToast('Erro ao salvar atributo no servidor.');
    } finally {
      setIsSavingAttribute(false);
    }
  };

  const handleDeleteAttribute = async (attrId: string, name: string) => {
    if (confirm(`Tem certeza que deseja excluir o atributo "${name}"?`)) {
      try {
        const res = await AdminApi.deleteCategoryAttribute(attrId);
        if (res.success) {
          showToast(`Atributo "${name}" removido.`);
          if (attributesCategory) handleOpenAttributesModal(attributesCategory);
        } else {
          showToast(res.message || 'Erro ao remover atributo.');
        }
      } catch {
        showToast('Erro ao remover atributo.');
      }
    }
  };

  const selectedParentPath = useMemo(() => {
    if (!formParentId) return null;
    return getCategoryPath(formParentId, categories);
  }, [formParentId, categories]);

  const validParentOptions = useMemo(() => {
    return categories.filter((cat) => {
      if (!editingCategory) return true;
      if (cat.id === editingCategory.id) return false;
      return !wouldCreateCycle(editingCategory.id, cat.id, categories);
    });
  }, [categories, editingCategory]);

  const renderTreeRows = (nodes: CategoryNode[]) => {
    return nodes.map((node) => {
      const path = getCategoryPath(node.id, categories);

      return (
        <React.Fragment key={node.id}>
          <tr className="hover:bg-purple-50/40 transition border-b border-gray-100">
            <td className="p-3">
              <div
                className="flex items-center gap-2"
                style={{ paddingLeft: `${node.level * 24}px` }}
              >
                {node.level > 0 ? (
                  <CornerDownRight className="w-4 h-4 text-purple-400 shrink-0" />
                ) : (
                  <FolderTree className="w-4 h-4 text-purple-600 shrink-0" />
                )}
                <div>
                  <div className="font-extrabold text-gray-900 text-xs flex items-center gap-1.5">
                    <span>{node.name}</span>
                    {node.level > 0 && (
                      <span className="text-[10px] bg-purple-50 text-purple-700 px-1.5 py-0.5 rounded-md font-bold border border-purple-100">
                        Nível {node.level + 1}
                      </span>
                    )}
                  </div>
                  {node.level > 0 && (
                    <div className="text-[10px] text-gray-400 font-medium flex items-center gap-1 mt-0.5">
                      <span>Caminho:</span>
                      {path.map((p, idx) => (
                        <React.Fragment key={p.id}>
                          {idx > 0 && <ChevronRight className="w-2.5 h-2.5 text-gray-400" />}
                          <span className={idx === path.length - 1 ? 'font-bold text-purple-700' : ''}>
                            {p.name}
                          </span>
                        </React.Fragment>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </td>
            <td className="p-3 font-bold text-gray-700">{node.prods ?? 0} produtos</td>
            <td className="p-3 font-black text-purple-700">{node.commission || '4.5%'}</td>
            <td className="p-3">
              <button
                onClick={() => handleToggleActive(node)}
                className="cursor-pointer"
                title="Clique para alterar o status"
              >
                <span
                  className={`px-2 py-0.5 rounded-full text-[10px] font-black inline-flex items-center gap-1 ${
                    node.isActive !== false
                      ? 'bg-emerald-100 text-emerald-800'
                      : 'bg-gray-100 text-gray-500'
                  }`}
                >
                  {node.isActive !== false ? 'Ativa' : 'Inativa'}
                </span>
              </button>
            </td>
            <td className="p-3 text-right">
              <div className="flex items-center justify-end gap-1.5 flex-wrap">
                <button
                  onClick={() => handleOpenAttributesModal(node)}
                  className="px-2.5 py-1 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 rounded-lg font-extrabold text-[11px] flex items-center gap-1 transition cursor-pointer border border-indigo-200/60"
                  title="Gerenciar atributos específicos desta categoria"
                >
                  <Sliders className="w-3.5 h-3.5" /> Gerenciar Atributos
                </button>

                <button
                  onClick={() => handleOpenAddSubcategory(node)}
                  className="px-2 py-1 bg-purple-50 hover:bg-purple-100 text-purple-700 rounded-lg font-extrabold text-[11px] flex items-center gap-1 transition cursor-pointer"
                  title="Adicionar subcategoria sob esta categoria"
                >
                  <Plus className="w-3.5 h-3.5" /> + Subcategoria
                </button>
                <button
                  onClick={() => handleOpenEdit(node)}
                  className="p-1.5 text-purple-600 hover:bg-purple-50 rounded-lg cursor-pointer"
                  title="Editar Categoria"
                >
                  <Edit2 className="w-4 h-4" />
                </button>
                <button
                  onClick={() => handleDeleteCategory(node.id, node.name)}
                  className="p-1.5 text-red-600 hover:bg-red-50 rounded-lg cursor-pointer"
                  title="Excluir Categoria"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </td>
          </tr>
          {node.children && node.children.length > 0 && renderTreeRows(node.children)}
        </React.Fragment>
      );
    });
  };

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-2xl p-6 border border-gray-200 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-gray-900 flex items-center gap-2">
            <Layers className="w-6 h-6 text-purple-600" />
            Gestão da Árvore de Categorias &amp; Atributos
          </h1>
          <p className="text-xs text-gray-500 mt-1">
            Configure a hierarquia de categorias e gerencie os atributos/ficha técnica específicos persistidos no Supabase.
          </p>
        </div>

        <button
          onClick={handleOpenCreateMain}
          className="bg-purple-600 hover:bg-purple-700 text-white font-extrabold text-xs px-4 py-2.5 rounded-xl transition flex items-center gap-1.5 shadow-md cursor-pointer"
        >
          <Plus className="w-4 h-4" /> Nova Categoria Principal
        </button>
      </div>

      <div className="bg-white rounded-2xl border border-gray-200 shadow-xs p-6 space-y-4">
        {isLoading ? (
          <div className="p-12 text-center text-gray-400 space-y-2">
            <Loader2 className="w-8 h-8 animate-spin mx-auto text-purple-600" />
            <p className="font-bold text-xs text-gray-500">Carregando árvore de categorias do Supabase...</p>
          </div>
        ) : categories.length === 0 ? (
          <div className="p-12 text-center text-gray-400 space-y-2">
            <Layers className="w-10 h-10 mx-auto text-gray-300 stroke-1" />
            <p className="font-bold text-sm text-gray-600">Nenhuma categoria cadastrada</p>
            <p className="text-xs text-gray-400 max-w-sm mx-auto">
              Nenhuma categoria foi criada no catálogo. Clique em "+ Nova Categoria Principal" para adicionar a primeira categoria do sistema.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200 text-gray-500 uppercase font-black text-[10px]">
                  <th className="p-3">Hierarquia de Categorias</th>
                  <th className="p-3">Produtos Ativos</th>
                  <th className="p-3">Comissão Base</th>
                  <th className="p-3">Status</th>
                  <th className="p-3 text-right">Ações</th>
                </tr>
              </thead>
              <tbody>{renderTreeRows(categoryTree)}</tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modal Criar / Editar Categoria */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-gray-100 space-y-4 animate-fadeIn">
            <div className="flex items-center justify-between border-b border-gray-100 pb-3">
              <h3 className="font-black text-base text-gray-900 flex items-center gap-2">
                <FolderTree className="w-5 h-5 text-purple-600" />
                {editingCategory ? 'Editar Categoria' : formParentId ? 'Adicionar Subcategoria' : 'Criar Nova Categoria Principal'}
              </h3>
              <button
                onClick={() => setIsModalOpen(false)}
                className="p-1 text-gray-400 hover:text-gray-600 rounded-lg cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveCategory} className="space-y-4 text-xs">
              {selectedParentPath && selectedParentPath.length > 0 && (
                <div className="p-3 bg-purple-50 border border-purple-100 rounded-xl space-y-1">
                  <div className="text-[10px] font-black text-purple-800 uppercase tracking-wider">
                    Categoria Pai Selecionada:
                  </div>
                  <div className="flex items-center gap-1 font-extrabold text-xs text-purple-950 flex-wrap">
                    {selectedParentPath.map((p, idx) => (
                      <React.Fragment key={p.id}>
                        {idx > 0 && <ChevronRight className="w-3 h-3 text-purple-400" />}
                        <span>{p.name}</span>
                      </React.Fragment>
                    ))}
                  </div>
                </div>
              )}

              <div>
                <label className="block font-bold text-gray-700 mb-1">Nome da Categoria *</label>
                <input
                  type="text"
                  required
                  placeholder="Ex: Smartphones"
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  className="w-full p-2.5 border border-gray-300 rounded-xl focus:ring-2 focus:ring-purple-500 font-bold"
                />
              </div>

              <div>
                <label className="block font-bold text-gray-700 mb-1">Categoria Pai (Nível Superior):</label>
                <select
                  value={formParentId}
                  onChange={(e) => setFormParentId(e.target.value)}
                  className="w-full p-2.5 border border-gray-300 rounded-xl focus:ring-2 focus:ring-purple-500 font-bold bg-white"
                >
                  <option value="">Nenhuma (Categoria Principal / Raiz)</option>
                  {validParentOptions.map((c) => {
                    const path = getCategoryPath(c.id, categories);
                    const label = path.map((p) => p.name).join(' > ');
                    return (
                      <option key={c.id} value={c.id}>
                        {label}
                      </option>
                    );
                  })}
                </select>
              </div>

              <div>
                <label className="block font-bold text-gray-700 mb-1">Comissão Base (%):</label>
                <input
                  type="text"
                  required
                  placeholder="Ex: 4.5%"
                  value={formCommission}
                  onChange={(e) => setFormCommission(e.target.value)}
                  className="w-full p-2.5 border border-gray-300 rounded-xl focus:ring-2 focus:ring-purple-500 font-bold"
                />
              </div>

              <div>
                <label className="block font-bold text-gray-700 mb-1">Status:</label>
                <select
                  value={formStatus}
                  onChange={(e) => setFormStatus(e.target.value)}
                  className="w-full p-2.5 border border-gray-300 rounded-xl focus:ring-2 focus:ring-purple-500 font-bold bg-white"
                >
                  <option value="Ativa">Ativa</option>
                  <option value="Inativa">Inativa</option>
                </select>
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
                  disabled={isSubmitting}
                  className="px-5 py-2 bg-purple-600 hover:bg-purple-700 text-white font-extrabold rounded-xl shadow-md flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                >
                  {isSubmitting ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Check className="w-4 h-4" />
                  )}
                  Salvar Categoria
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Gerenciar Atributos da Categoria */}
      {attributesCategory && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-3xl w-full p-6 shadow-2xl border border-gray-100 space-y-4 max-h-[90vh] overflow-y-auto animate-fadeIn">
            <div className="flex items-center justify-between border-b border-gray-100 pb-3">
              <div>
                <h3 className="font-black text-base text-gray-900 flex items-center gap-2">
                  <Sliders className="w-5 h-5 text-indigo-600" />
                  Atributos Específicos da Categoria
                </h3>
                <div className="text-xs text-indigo-900 font-bold mt-1 flex items-center gap-1 flex-wrap">
                  <span>Categoria:</span>
                  {getCategoryPath(attributesCategory.id, categories).map((p, idx, arr) => (
                    <React.Fragment key={p.id}>
                      {idx > 0 && <ChevronRight className="w-3 h-3 text-indigo-400" />}
                      <span className={idx === arr.length - 1 ? 'font-black text-indigo-700 underline' : ''}>
                        {p.name}
                      </span>
                    </React.Fragment>
                  ))}
                </div>
              </div>

              <button
                onClick={() => setAttributesCategory(null)}
                className="p-1 text-gray-400 hover:text-gray-600 rounded-lg cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex justify-between items-center bg-indigo-50/60 p-3 rounded-xl border border-indigo-100">
              <p className="text-xs text-indigo-900 font-medium">
                Estes atributos serão exibidos dinamicamente para o vendedor ao cadastrar produtos nesta categoria.
              </p>
              <button
                onClick={handleOpenCreateAttribute}
                className="bg-indigo-600 hover:bg-indigo-700 text-white font-extrabold text-xs px-3.5 py-2 rounded-xl transition flex items-center gap-1.5 shadow-sm cursor-pointer shrink-0"
              >
                <Plus className="w-4 h-4" /> + Novo Atributo
              </button>
            </div>

            {isLoadingAttributes ? (
              <div className="p-8 text-center text-gray-400 space-y-2">
                <Loader2 className="w-6 h-6 animate-spin mx-auto text-indigo-600" />
                <p className="font-bold text-xs text-gray-500">Carregando atributos da categoria...</p>
              </div>
            ) : categoryAttributesList.length === 0 ? (
              <div className="p-8 text-center text-gray-400 space-y-2 bg-gray-50 rounded-xl border border-dashed border-gray-200">
                <Sliders className="w-8 h-8 mx-auto text-gray-300" />
                <p className="font-bold text-sm text-gray-600">Nenhum atributo cadastrado nesta categoria</p>
                <p className="text-xs text-gray-400 max-w-sm mx-auto">
                  Clique em "+ Novo Atributo" acima para cadastrar campos específicos (ex: Memória RAM, Tamanho, Origem, Voltagem).
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="bg-gray-50 border-b border-gray-200 text-gray-500 uppercase font-black text-[10px]">
                      <th className="p-2.5">Nome do Atributo</th>
                      <th className="p-2.5">Código (Key)</th>
                      <th className="p-2.5">Tipo</th>
                      <th className="p-2.5">Obrigatório</th>
                      <th className="p-2.5">Opções / Unidade</th>
                      <th className="p-2.5 text-right">Ações</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {categoryAttributesList.map((attr) => (
                      <tr key={attr.id} className="hover:bg-gray-50/60">
                        <td className="p-2.5 font-extrabold text-gray-900">{attr.name}</td>
                        <td className="p-2.5 font-mono text-[11px] text-gray-600">{attr.code}</td>
                        <td className="p-2.5">
                          <span className="px-2 py-0.5 bg-gray-100 text-gray-700 font-bold rounded-md text-[10px]">
                            {attr.type}
                          </span>
                        </td>
                        <td className="p-2.5">
                          {attr.isRequired ? (
                            <span className="px-2 py-0.5 bg-red-100 text-red-800 font-black rounded-md text-[10px]">
                              Sim *
                            </span>
                          ) : (
                            <span className="px-2 py-0.5 bg-gray-100 text-gray-500 font-bold rounded-md text-[10px]">
                              Opcional
                            </span>
                          )}
                        </td>
                        <td className="p-2.5 text-gray-600 text-[11px]">
                          {attr.unit && <span className="font-bold text-indigo-700 mr-2">Unidade: {attr.unit}</span>}
                          {Array.isArray(attr.optionsJson) && attr.optionsJson.length > 0 && (
                            <span className="text-gray-500">
                              [{attr.optionsJson.slice(0, 3).join(', ')}{attr.optionsJson.length > 3 ? '...' : ''}]
                            </span>
                          )}
                        </td>
                        <td className="p-2.5 text-right">
                          <div className="flex items-center justify-end gap-1">
                            <button
                              onClick={() => handleOpenEditAttribute(attr)}
                              className="p-1 text-indigo-600 hover:bg-indigo-50 rounded-lg cursor-pointer"
                              title="Editar Atributo"
                            >
                              <Edit2 className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => handleDeleteAttribute(attr.id, attr.name)}
                              className="p-1 text-red-600 hover:bg-red-50 rounded-lg cursor-pointer"
                              title="Excluir Atributo"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Modal Criar / Editar Atributo Individual */}
      {isAttributeModalOpen && (
        <div className="fixed inset-0 z-60 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-gray-100 space-y-4 animate-fadeIn">
            <div className="flex items-center justify-between border-b border-gray-100 pb-3">
              <h3 className="font-black text-base text-gray-900 flex items-center gap-2">
                <Settings2 className="w-5 h-5 text-indigo-600" />
                {editingAttribute ? 'Editar Atributo da Categoria' : 'Criar Novo Atributo'}
              </h3>
              <button
                onClick={() => setIsAttributeModalOpen(false)}
                className="p-1 text-gray-400 hover:text-gray-600 rounded-lg cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveAttribute} className="space-y-3 text-xs">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-gray-800 mb-1">Nome do Atributo *</label>
                  <input
                    type="text"
                    required
                    placeholder="Ex: Memória RAM"
                    value={attrName}
                    onChange={(e) => setAttrName(e.target.value)}
                    className="w-full p-2.5 border border-gray-300 rounded-xl font-bold"
                  />
                </div>

                <div>
                  <label className="block font-bold text-gray-800 mb-1">Código (Key do Banco)</label>
                  <input
                    type="text"
                    placeholder="Ex: ram"
                    value={attrCode}
                    onChange={(e) => setAttrCode(e.target.value)}
                    className="w-full p-2.5 border border-gray-300 rounded-xl font-mono"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-gray-800 mb-1">Tipo de Campo *</label>
                  <select
                    value={attrType}
                    onChange={(e) => setAttrType(e.target.value)}
                    className="w-full p-2.5 border border-gray-300 rounded-xl font-bold bg-white"
                  >
                    <option value="text">Texto (Input simples)</option>
                    <option value="number">Número</option>
                    <option value="select">Seleção Única (Dropdown)</option>
                    <option value="multiselect">Múltipla Seleção</option>
                    <option value="boolean">Sim / Não (Booleano)</option>
                  </select>
                </div>

                <div>
                  <label className="block font-bold text-gray-800 mb-1">Unidade (opcional)</label>
                  <input
                    type="text"
                    placeholder="Ex: kg, GB, cm, Meses"
                    value={attrUnit}
                    onChange={(e) => setAttrUnit(e.target.value)}
                    className="w-full p-2.5 border border-gray-300 rounded-xl font-bold"
                  />
                </div>
              </div>

              {(attrType === 'select' || attrType === 'multiselect') && (
                <div>
                  <label className="block font-bold text-gray-800 mb-1">
                    Opções de Seleção (uma por linha) *
                  </label>
                  <textarea
                    rows={4}
                    required
                    placeholder="4 GB&#10;8 GB&#10;12 GB&#10;16 GB"
                    value={attrOptionsRaw}
                    onChange={(e) => setAttrOptionsRaw(e.target.value)}
                    className="w-full p-2.5 border border-gray-300 rounded-xl font-mono text-xs"
                  />
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-gray-800 mb-1">Placeholder</label>
                  <input
                    type="text"
                    placeholder="Ex: Digite ou selecione a RAM"
                    value={attrPlaceholder}
                    onChange={(e) => setAttrPlaceholder(e.target.value)}
                    className="w-full p-2.5 border border-gray-300 rounded-xl"
                  />
                </div>

                <div>
                  <label className="block font-bold text-gray-800 mb-1">Ordem de Exibição</label>
                  <input
                    type="number"
                    value={attrSortOrder}
                    onChange={(e) => setAttrSortOrder(e.target.value)}
                    className="w-full p-2.5 border border-gray-300 rounded-xl font-bold"
                  />
                </div>
              </div>

              <div>
                <label className="block font-bold text-gray-800 mb-1">Texto de Ajuda</label>
                <input
                  type="text"
                  placeholder="Ex: Capacidade de memória RAM principal do dispositivo"
                  value={attrHelpText}
                  onChange={(e) => setAttrHelpText(e.target.value)}
                  className="w-full p-2.5 border border-gray-300 rounded-xl"
                />
              </div>

              <div className="pt-2">
                <label className="flex items-center gap-2 font-extrabold text-gray-900 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={attrIsRequired}
                    onChange={(e) => setAttrIsRequired(e.target.checked)}
                    className="w-4 h-4 text-indigo-600 rounded-md focus:ring-indigo-500"
                  />
                  <span>Preenchimento Obrigatório pelo Vendedor</span>
                </label>
              </div>

              <div className="pt-3 border-t border-gray-100 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsAttributeModalOpen(false)}
                  className="px-4 py-2 border border-gray-300 font-bold text-gray-700 rounded-xl hover:bg-gray-50 cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isSavingAttribute}
                  className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-extrabold rounded-xl shadow-md flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                >
                  {isSavingAttribute ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Check className="w-4 h-4" />
                  )}
                  Salvar Atributo
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
