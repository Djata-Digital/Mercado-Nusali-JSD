import React, { useState, useEffect, useMemo, useCallback, useRef, useDeferredValue } from 'react';
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
  Search,
  ChevronsDownUp,
  ChevronsUpDown,
} from 'lucide-react';
import { AdminApi } from '../../api/clients/AdminApi';
import {
  Category,
  CategoryNode,
  buildCategoryTree,
  getCategoryPath,
  wouldCreateCycle,
} from '../../utils/categoryUtils';
import {
  computeTreeView,
  computeCounters,
  allParentIds,
  type ScopeFilter,
  type StatusFilter,
} from '../../utils/categoryTreeView';
import { CategoryRow } from './CategoryTreeRow';
import { CategoryAttributesModal } from './CategoryAttributesModal';

/** Linhas renderizadas por vez: a árvore pode ter centenas/milhares de categorias; o restante vem em "Mostrar mais". */
const ROW_PAGE = 100;
const EXPANDED_STORAGE_KEY = 'nusali_admin_categories_expanded';

function loadExpanded(): Set<string> {
  try {
    const raw = typeof sessionStorage !== 'undefined' ? sessionStorage.getItem(EXPANDED_STORAGE_KEY) : null;
    const arr = raw ? JSON.parse(raw) : [];
    return new Set(Array.isArray(arr) ? arr.filter((x: unknown) => typeof x === 'string') : []);
  } catch {
    return new Set();
  }
}

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

  // Visão em árvore: expansão individual (persistida na sessão), pesquisa instantânea e filtros combináveis.
  const [expanded, setExpanded] = useState<Set<string>>(loadExpanded);
  const [searchInput, setSearchInput] = useState('');
  const [scope, setScope] = useState<ScopeFilter>('all');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [rowLimit, setRowLimit] = useState(ROW_PAGE);
  const deferredQuery = useDeferredValue(searchInput);

  // Category Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingCategory, setEditingCategory] = useState<Category | null>(null);
  const [formName, setFormName] = useState('');
  // Correção crítica (comissão da categoria nunca persistia): formCommission
  // representa SOMENTE o número (ex.: "4.5"), nunca mais um placeholder fixo
  // com "%" embutido — o "%" agora é só decoração visual no input (ver JSX).
  // Vazio = sem taxa própria (cai para sellers.commissionRate, depois o
  // global) — nunca inventamos um default aqui.
  const [formCommission, setFormCommission] = useState('');
  const [formStatus, setFormStatus] = useState('Ativa');
  const [formParentId, setFormParentId] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Gerenciamento de atributos: o modal próprio (CategoryAttributesModal) cuida de lista, herança, formulário e validação.
  const [attributesCategory, setAttributesCategory] = useState<Category | null>(null);

  const fetchCategories = async () => {
    setIsLoading(true);
    try {
      const res = await AdminApi.getCategories();
      if (res.success && Array.isArray(res.data)) {
        setCategories(res.data);
      } else {
        setCategories([]);
        if (res.message) showToast(res.message);
      }
    } catch (err: any) {
      console.error('Error fetching admin categories:', err);
      if (err?.response?.status === 401) {
        showToast('Sua sessão expirou. Entre novamente.');
      } else if (err?.response?.status === 403) {
        showToast('Você não possui permissão para acessar esta área.');
      } else {
        showToast(err?.response?.data?.message || err?.message || 'Erro ao carregar categorias do banco de dados.');
      }
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

  const counters = useMemo(() => computeCounters(categories), [categories]);
  const view = useMemo(
    () => computeTreeView(categoryTree, { expanded, query: deferredQuery, scope, status: statusFilter }),
    [categoryTree, expanded, deferredQuery, scope, statusFilter]
  );
  const visibleRows = useMemo(() => view.rows.slice(0, rowLimit), [view, rowLimit]);
  const hasActiveFilter = searchInput.trim() !== '' || scope !== 'all' || statusFilter !== 'all';

  // volta à primeira página quando a pesquisa/filtro muda
  useEffect(() => {
    setRowLimit(ROW_PAGE);
  }, [deferredQuery, scope, statusFilter]);

  useEffect(() => {
    try {
      sessionStorage.setItem(EXPANDED_STORAGE_KEY, JSON.stringify([...expanded]));
    } catch {
      /* sem storage: a expansão só vale enquanto a página estiver aberta */
    }
  }, [expanded]);

  const toggleExpanded = useCallback((id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);
  const expandAll = () => setExpanded(new Set(allParentIds(categoryTree)));
  const collapseAll = () => setExpanded(new Set());
  const clearFilters = () => {
    setSearchInput('');
    setScope('all');
    setStatusFilter('all');
  };

  const handleOpenCreateMain = () => {
    setEditingCategory(null);
    setFormName('');
    setFormCommission('');
    setFormStatus('Ativa');
    setFormParentId('');
    setIsModalOpen(true);
  };

  const handleOpenAddSubcategory = (parentCategory: Category) => {
    setEditingCategory(null);
    setFormName('');
    setFormCommission('');
    setFormStatus('Ativa');
    setFormParentId(parentCategory.id);
    setIsModalOpen(true);
  };

  const handleOpenEdit = (c: Category) => {
    setEditingCategory(c);
    setFormName(c.name);
    // Correção crítica: nunca mais ler o placeholder "commission" (campo que
    // o backend nunca preencheu) — inicializa a partir do valor real
    // c.commissionRate (numeric do Postgres via Drizzle: string ou null).
    // null/undefined => campo vazio, nunca um "4.5%" inventado.
    setFormCommission(
      c.commissionRate !== null && c.commissionRate !== undefined ? String(c.commissionRate) : ''
    );
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

  // Correção crítica (comissão da categoria nunca persistia): normaliza
  // vírgula decimal ("4,5" -> "4.5") antes de Number() e valida 0-100 aqui
  // também (o backend já valida, mas rejeitar cedo evita um round-trip e dá
  // feedback claro). Retorna null explícito para "sem taxa própria" (campo
  // vazio) e 'invalid' quando o valor não pode ser salvo.
  const parseCommissionInput = (raw: string): number | null | 'invalid' => {
    const trimmed = raw.trim();
    if (trimmed === '') return null;
    const normalized = trimmed.replace(',', '.');
    const num = Number(normalized);
    if (isNaN(num) || num < 0 || num > 100) return 'invalid';
    return num;
  };

  const handleSaveCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formName.trim()) {
      showToast('Por favor, digite o nome da categoria.');
      return;
    }

    const parsedCommission = parseCommissionInput(formCommission);
    if (parsedCommission === 'invalid') {
      showToast('A comissão da categoria deve ser um percentual entre 0 e 100 (ex.: 4.5). Deixe em branco para não definir uma taxa própria.');
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
          commissionRate: parsedCommission,
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
          commissionRate: parsedCommission,
        });
        if (res.success) {
          showToast(`Nova categoria "${formName}" criada com sucesso no Supabase!`);
          if (parentIdValue) setExpanded((prev) => new Set(prev).add(parentIdValue));
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

  // Callbacks estáveis para as linhas memoizadas: sempre chamam a versão mais recente dos handlers (que fecham sobre o estado).
  const actionsRef = useRef({
    toggleActive: handleToggleActive,
    attributes: (c: Category) => setAttributesCategory(c),
    addSub: handleOpenAddSubcategory,
    edit: handleOpenEdit,
    remove: handleDeleteCategory,
  });
  actionsRef.current = {
    toggleActive: handleToggleActive,
    attributes: (c: Category) => setAttributesCategory(c),
    addSub: handleOpenAddSubcategory,
    edit: handleOpenEdit,
    remove: handleDeleteCategory,
  };
  const onRowToggleActive = useCallback((c: Category) => actionsRef.current.toggleActive(c), []);
  const onRowAttributes = useCallback((c: Category) => actionsRef.current.attributes(c), []);
  const onRowAddSub = useCallback((c: Category) => actionsRef.current.addSub(c), []);
  const onRowEdit = useCallback((c: Category) => actionsRef.current.edit(c), []);
  const onRowDelete = useCallback((id: string, name: string) => actionsRef.current.remove(id, name), []);

  const scopeOptions: { value: ScopeFilter; label: string }[] = [
    { value: 'all', label: 'Todas' },
    { value: 'roots', label: 'Categorias principais' },
    { value: 'subs', label: 'Subcategorias' },
  ];
  const statusOptions: { value: StatusFilter; label: string }[] = [
    { value: 'all', label: 'Todas' },
    { value: 'active', label: 'Ativas' },
    { value: 'inactive', label: 'Inativas' },
  ];
  const chip = (selected: boolean) =>
    `px-3 py-1.5 rounded-lg text-[11px] font-extrabold border transition cursor-pointer ${
      selected ? 'bg-purple-600 text-white border-purple-600 shadow-xs' : 'bg-white text-gray-600 border-gray-200 hover:bg-purple-50'
    }`;

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
          <div className="space-y-4">
            {/* Contadores reais (dados carregados do banco) */}
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3" aria-label="Resumo das categorias">
              {[
                { label: 'Categorias principais', value: counters.roots },
                { label: 'Subcategorias', value: counters.subs },
                { label: 'Total de categorias', value: counters.total },
                { label: 'Ativas / inativas', value: `${counters.active} / ${counters.inactive}` },
                { label: 'Produtos ativos', value: counters.activeProducts },
              ].map((k) => (
                <div key={k.label} className="bg-purple-50/50 border border-purple-100 rounded-xl px-3 py-2">
                  <div className="text-[10px] font-black text-purple-800 uppercase tracking-wider">{k.label}</div>
                  <div className="text-lg font-black text-gray-900 tabular-nums">{k.value}</div>
                </div>
              ))}
            </div>

            {/* Pesquisa instantânea + filtros combináveis + expandir/recolher */}
            <div className="space-y-3">
              <div className="flex flex-col md:flex-row gap-3 md:items-center">
                <div className="relative flex-1">
                  <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" aria-hidden="true" />
                  <input
                    type="search"
                    value={searchInput}
                    onChange={(e) => setSearchInput(e.target.value)}
                    placeholder="Pesquisar categoria ou subcategoria (nome ou slug, ex.: moda-feminina-calcas)"
                    aria-label="Pesquisar categorias"
                    className="w-full pl-9 pr-9 py-2.5 border border-gray-300 rounded-xl text-xs font-bold focus:ring-2 focus:ring-purple-500 focus:outline-hidden"
                  />
                  {searchInput && (
                    <button
                      type="button"
                      onClick={() => setSearchInput('')}
                      aria-label="Limpar pesquisa"
                      className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-gray-400 hover:text-gray-600 rounded-full cursor-pointer"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  )}
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={expandAll}
                    className="px-3 py-2 border border-gray-200 hover:bg-purple-50 text-gray-700 rounded-xl text-[11px] font-extrabold flex items-center gap-1.5 cursor-pointer"
                  >
                    <ChevronsUpDown className="w-3.5 h-3.5" /> Expandir todas
                  </button>
                  <button
                    type="button"
                    onClick={collapseAll}
                    className="px-3 py-2 border border-gray-200 hover:bg-purple-50 text-gray-700 rounded-xl text-[11px] font-extrabold flex items-center gap-1.5 cursor-pointer"
                  >
                    <ChevronsDownUp className="w-3.5 h-3.5" /> Recolher todas
                  </button>
                </div>
              </div>

              <div className="flex flex-col sm:flex-row sm:flex-wrap gap-x-6 gap-y-2">
                <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Filtrar por tipo">
                  <span className="text-[10px] font-black text-gray-500 uppercase tracking-wider mr-1">Exibir</span>
                  {scopeOptions.map((o) => (
                    <button key={o.value} type="button" aria-pressed={scope === o.value} onClick={() => setScope(o.value)} className={chip(scope === o.value)}>
                      {o.label}
                    </button>
                  ))}
                </div>
                <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Filtrar por estado">
                  <span className="text-[10px] font-black text-gray-500 uppercase tracking-wider mr-1">Estado</span>
                  {statusOptions.map((o) => (
                    <button key={o.value} type="button" aria-pressed={statusFilter === o.value} onClick={() => setStatusFilter(o.value)} className={chip(statusFilter === o.value)}>
                      {o.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-3 text-[11px] text-gray-500 font-semibold" role="status" aria-live="polite">
                {view.mode === 'filter' ? (
                  <span>
                    {view.matchedCount} {view.matchedCount === 1 ? 'resultado' : 'resultados'} de {counters.total} categorias
                  </span>
                ) : (
                  <span>
                    {counters.roots} categorias principais. Clique numa categoria para ver as subcategorias.
                  </span>
                )}
                {hasActiveFilter && (
                  <button type="button" onClick={clearFilters} className="text-purple-700 font-extrabold hover:underline cursor-pointer">
                    Limpar pesquisa e filtros
                  </button>
                )}
              </div>
            </div>

            {/* Árvore */}
            {view.rows.length === 0 ? (
              <div className="p-10 text-center text-gray-400 space-y-2 border border-dashed border-gray-200 rounded-xl">
                <Search className="w-8 h-8 mx-auto text-gray-300 stroke-1" />
                <p className="font-bold text-sm text-gray-600">Nenhuma categoria encontrada</p>
                <p className="text-xs text-gray-400">Ajuste a pesquisa ou os filtros.</p>
              </div>
            ) : (
              <div className="@container border border-gray-200 rounded-xl overflow-hidden">
                <div className="hidden @5xl:flex items-center gap-2 px-3 py-2 bg-gray-50 border-b border-gray-200 text-gray-500 uppercase font-black text-[10px]">
                  <div className="flex-1">Hierarquia de Categorias</div>
                  <div className="shrink-0 flex gap-4">
                    <span className="w-[110px]">Produtos Ativos</span>
                    <span className="w-[110px]">Comissão Base</span>
                    <span className="w-[70px]">Status</span>
                  </div>
                  <div className="shrink-0 w-[330px] text-right">Ações</div>
                </div>
                <div role="tree" aria-label="Árvore de categorias">
                  {visibleRows.map((row) => (
                    <CategoryRow
                      key={row.node.id}
                      row={row}
                      query={deferredQuery.trim()}
                      onToggle={toggleExpanded}
                      onToggleActive={onRowToggleActive}
                      onAttributes={onRowAttributes}
                      onAddSub={onRowAddSub}
                      onEdit={onRowEdit}
                      onDelete={onRowDelete}
                    />
                  ))}
                </div>
                {view.rows.length > visibleRows.length && (
                  <div className="p-3 text-center bg-gray-50 border-t border-gray-200">
                    <button
                      type="button"
                      onClick={() => setRowLimit((n) => n + ROW_PAGE)}
                      className="px-4 py-2 bg-white border border-gray-300 hover:bg-purple-50 text-gray-700 rounded-xl text-[11px] font-extrabold cursor-pointer"
                    >
                      Mostrar mais ({view.rows.length - visibleRows.length} restantes)
                    </button>
                  </div>
                )}
              </div>
            )}
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
                <div className="relative">
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    max="100"
                    placeholder="Ex: 4.5 (em branco = sem taxa própria)"
                    value={formCommission}
                    onChange={(e) => setFormCommission(e.target.value)}
                    className="w-full p-2.5 pr-8 border border-gray-300 rounded-xl focus:ring-2 focus:ring-purple-500 font-bold"
                  />
                  <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 font-bold">%</span>
                </div>
                <p className="text-[10px] text-gray-400 mt-1">
                  Deixe em branco para esta categoria usar a comissão do vendedor (ou o padrão global).
                </p>
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

      {attributesCategory && (
        <CategoryAttributesModal
          category={attributesCategory}
          categories={categories}
          onClose={() => setAttributesCategory(null)}
          showToast={showToast}
        />
      )}
    </div>
  );
};
