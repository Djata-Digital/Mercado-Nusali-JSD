import React, { useState } from 'react';
import {
  Package,
  Search,
  Filter,
  PlusCircle,
  Edit,
  Eye,
  PauseCircle,
  PlayCircle,
  Trash2,
  CheckCircle2,
  AlertTriangle,
  Zap,
  Boxes,
  Sparkles,
  ArrowUpDown,
  MoreVertical,
  Film,
  Image as ImageIcon,
  Copy,
  Check,
  Share2,
} from 'lucide-react';
import { Product, CurrencyCode } from '../../types';
import { formatCurrency } from '../../utils/currencyUtils';

interface SellerProductsListProps {
  products: Product[];
  selectedCurrency: CurrencyCode;
  onNavigateCreateProduct: () => void;
  onOpenProductDetail: (id: string) => void;
  onUpdateProduct: (product: Product) => void;
  onEditProduct?: (product: Product) => void;
  onDeleteProduct?: (id: string) => void;
  showToast: (msg: string) => void;
}

export const SellerProductsList: React.FC<SellerProductsListProps> = ({
  products,
  selectedCurrency,
  onNavigateCreateProduct,
  onOpenProductDetail,
  onUpdateProduct,
  onEditProduct,
  onDeleteProduct,
  showToast,
}) => {
  const [activeTab, setActiveTab] = useState<
    'todos' | 'aprovados' | 'pendentes' | 'pausados' | 'sem_estoque' | 'rascunhos'
  >('todos');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [productToDelete, setProductToDelete] = useState<Product | null>(null);

  const handleCopyLink = async (productId: string) => {
    try {
      const url = `${window.location.origin}/products/${productId}`;
      await navigator.clipboard.writeText(url);
      setCopiedId(productId);
      setTimeout(() => setCopiedId(null), 2000);
    } catch {
      setCopiedId(productId);
      setTimeout(() => setCopiedId(null), 2000);
    }
  };

  // Filter products based on activeTab, searchQuery, and category
  const filteredProducts = products.filter((p) => {
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const matchTitle = p.title.toLowerCase().includes(q);
      const matchBrand = p.brand?.toLowerCase().includes(q);
      if (!matchTitle && !matchBrand) return false;
    }

    if (selectedCategory !== 'all' && p.category !== selectedCategory) {
      return false;
    }

    if (activeTab === 'sem_estoque') return p.stock === 0;
    if (activeTab === 'pausados') return p.stock > 0 && p.stock < 3; // simulated paused state
    return true;
  });

  const categories = Array.from(new Set(products.map((p) => p.category)));

  const handleToggleSelectAll = () => {
    if (selectedIds.length === filteredProducts.length) {
      setSelectedIds([]);
    } else {
      setSelectedIds(filteredProducts.map((p) => p.id));
    }
  };

  const handleToggleSelectOne = (id: string) => {
    if (selectedIds.includes(id)) {
      setSelectedIds(selectedIds.filter((i) => i !== id));
    } else {
      setSelectedIds([...selectedIds, id]);
    }
  };

  const handleQuickStockUpdate = (p: Product, delta: number) => {
    const updated = { ...p, stock: Math.max(0, p.stock + delta) };
    onUpdateProduct(updated);
    showToast(`Estoque de "${p.title.substring(0, 20)}..." alterado para ${updated.stock}`);
  };

  return (
    <div className="space-y-6 animate-fadeIn">
      {/* Top Banner */}
      <div className="bg-white rounded-2xl border border-gray-200 p-6 shadow-2xs flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-black text-gray-900 flex items-center gap-2">
            <Package className="w-6 h-6 text-emerald-700" /> Catálogo de Anúncios ({products.length})
          </h1>
          <p className="text-xs text-gray-500 mt-1">
            Gerencie o preço, estoque, anúncios patrocinados e fotos dos seus produtos cadastrados.
          </p>
        </div>

        <button
          onClick={onNavigateCreateProduct}
          className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold px-4 py-2.5 rounded-xl text-xs transition flex items-center gap-2 shadow-xs shrink-0"
        >
          <PlusCircle className="w-4 h-4" /> Cadastrar Novo Anúncio (Com IA)
        </button>
      </div>

      {/* Tabs */}
      <div className="bg-white rounded-2xl border border-gray-200 p-2 shadow-2xs overflow-x-auto">
        <div className="flex items-center gap-2 text-xs font-bold">
          {[
            { id: 'todos', label: 'Todos os Anúncios', count: products.length },
            { id: 'aprovados', label: 'Ativos / Aprovados', count: products.length },
            { id: 'pendentes', label: 'Em Análise (0)' },
            { id: 'pausados', label: 'Pausados' },
            { id: 'sem_estoque', label: 'Sem Estoque', count: products.filter((p) => p.stock === 0).length },
          ].map((t) => (
            <button
              key={t.id}
              onClick={() => setActiveTab(t.id as any)}
              className={`px-4 py-2 rounded-xl transition whitespace-nowrap flex items-center gap-2 ${
                activeTab === t.id
                  ? 'bg-emerald-600 text-white shadow-xs font-black'
                  : 'text-gray-600 hover:bg-gray-100'
              }`}
            >
              <span>{t.label}</span>
              {t.count !== undefined && (
                <span
                  className={`text-[10px] px-1.5 py-0.2 rounded-full font-extrabold ${
                    activeTab === t.id ? 'bg-white/20 text-white' : 'bg-gray-200 text-gray-700'
                  }`}
                >
                  {t.count}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Search & Filters */}
      <div className="bg-white rounded-2xl border border-gray-200 p-4 shadow-2xs flex flex-col sm:flex-row items-center justify-between gap-4">
        <div className="relative w-full sm:w-80">
          <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Buscar por título, marca ou SKU..."
            className="w-full pl-9 pr-4 py-2 border border-gray-300 rounded-xl text-xs focus:border-emerald-600 focus:outline-hidden"
          />
        </div>

        <div className="flex items-center gap-3 w-full sm:w-auto">
          <select
            value={selectedCategory}
            onChange={(e) => setSelectedCategory(e.target.value)}
            className="p-2 border border-gray-300 rounded-xl text-xs bg-white font-bold w-full sm:w-auto"
          >
            <option value="all">Todas as Categorias</option>
            {categories.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Bulk Actions Bar if items selected */}
      {selectedIds.length > 0 && (
        <div className="bg-slate-900 text-white p-3 rounded-2xl flex items-center justify-between text-xs animate-fadeIn">
          <span className="font-bold">{selectedIds.length} produtos selecionados</span>
          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                showToast(`${selectedIds.length} anúncios pausados.`);
                setSelectedIds([]);
              }}
              className="bg-slate-800 hover:bg-slate-700 px-3 py-1.5 rounded-xl font-bold flex items-center gap-1"
            >
              <PauseCircle className="w-3.5 h-3.5" /> Pausar Selecionados
            </button>
          </div>
        </div>
      )}

      {/* Products Table */}
      <div className="bg-white rounded-2xl border border-gray-200 shadow-2xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200 text-gray-600 font-bold uppercase tracking-wider">
                <th className="p-3 w-10 text-center">
                  <input
                    type="checkbox"
                    checked={selectedIds.length === filteredProducts.length && filteredProducts.length > 0}
                    onChange={handleToggleSelectAll}
                    className="rounded-xs text-emerald-600 focus:ring-emerald-500"
                  />
                </th>
                <th className="p-3">Produto & Detalhes</th>
                <th className="p-3">Categoria</th>
                <th className="p-3">Preço</th>
                <th className="p-3">Estoque</th>
                <th className="p-3 text-center">Fulfillment</th>
                <th className="p-3 text-center">Status</th>
                <th className="p-3 text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 font-medium">
              {filteredProducts.map((p) => {
                const isChecked = selectedIds.includes(p.id);

                return (
                  <tr key={p.id} className="hover:bg-gray-50/70 transition">
                    <td className="p-3 text-center">
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={() => handleToggleSelectOne(p.id)}
                        className="rounded-xs text-emerald-600 focus:ring-emerald-500"
                      />
                    </td>

                    <td className="p-3">
                      <div className="flex items-center gap-3 max-w-md">
                        <div className="relative shrink-0">
                          <img
                            src={p.image}
                            alt=""
                            className="w-12 h-12 rounded-xl object-contain border border-gray-200 p-0.5 bg-white"
                          />
                          {(p.videoUrl || p.shortVideo || (p.videos && p.videos.length > 0)) && (
                            <span className="absolute -bottom-1 -right-1 bg-emerald-600 text-white p-0.5 rounded-full shadow-xs" title="Possui vídeo curto">
                              <Film className="w-2.5 h-2.5" />
                            </span>
                          )}
                        </div>
                        <div className="truncate">
                          <button
                            onClick={() => onOpenProductDetail(p.id)}
                            className="font-bold text-gray-900 hover:text-emerald-700 text-left line-clamp-1 hover:underline"
                          >
                            {p.title}
                          </button>
                          <div className="flex items-center gap-2 text-[10px] text-gray-400 font-mono mt-0.5">
                            <span>SKU: NSL-{p.id.substring(0, 6).toUpperCase()}</span>
                            <span>•</span>
                            <span className="flex items-center gap-0.5 text-gray-500 font-medium">
                              <ImageIcon className="w-2.5 h-2.5" /> {p.galleryImages?.length || 1} fotos
                            </span>
                            {(p.videoUrl || p.shortVideo || (p.videos && p.videos.length > 0)) && (
                              <>
                                <span>•</span>
                                <span className="text-emerald-700 font-bold flex items-center gap-0.5">
                                  <Film className="w-2.5 h-2.5" /> Vídeo
                                </span>
                              </>
                            )}
                          </div>
                        </div>
                      </div>
                    </td>

                    <td className="p-3 text-gray-600 font-bold">{p.category}</td>

                    <td className="p-3">
                      <span className="font-black text-gray-900 block">
                        {formatCurrency(p.price, p.currency || selectedCurrency)}
                      </span>
                      {p.originalPrice && (
                        <span className="text-[10px] text-gray-400 line-through font-mono">
                          {formatCurrency(p.originalPrice, p.currency || selectedCurrency)}
                        </span>
                      )}
                    </td>

                    <td className="p-3">
                      <div className="flex items-center gap-2">
                        <span
                          className={`font-black ${
                            p.stock === 0 ? 'text-red-600' : p.stock < 5 ? 'text-amber-600' : 'text-emerald-800'
                          }`}
                        >
                          {p.stock} un.
                        </span>
                        <div className="flex items-center gap-0.5">
                          <button
                            onClick={() => handleQuickStockUpdate(p, -1)}
                            className="p-1 bg-gray-100 hover:bg-gray-200 rounded-md font-bold text-gray-700 text-[10px]"
                            title="Diminuir estoque"
                          >
                            -
                          </button>
                          <button
                            onClick={() => handleQuickStockUpdate(p, 1)}
                            className="p-1 bg-gray-100 hover:bg-gray-200 rounded-md font-bold text-gray-700 text-[10px]"
                            title="Aumentar estoque"
                          >
                            +
                          </button>
                        </div>
                      </div>
                    </td>

                    <td className="p-3 text-center">
                      <span className="bg-amber-100 text-amber-900 border border-amber-300 text-[10px] font-black px-2 py-0.5 rounded-full inline-flex items-center gap-1">
                        <Zap className="w-3 h-3 text-yellow-600 fill-yellow-500" /> FULFILLMENT
                      </span>
                    </td>

                    <td className="p-3 text-center">
                      {p.stock > 0 ? (
                        <span className="bg-emerald-100 text-emerald-800 text-[10px] font-bold px-2 py-0.5 rounded-full inline-flex items-center gap-1">
                          <CheckCircle2 className="w-3 h-3 text-emerald-600" /> Ativo
                        </span>
                      ) : (
                        <span className="bg-red-100 text-red-800 text-[10px] font-bold px-2 py-0.5 rounded-full inline-flex items-center gap-1">
                          <AlertTriangle className="w-3 h-3 text-red-600" /> Esgotado
                        </span>
                      )}
                    </td>

                    <td className="p-3 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          onClick={() => handleCopyLink(p.id)}
                          className={`p-1.5 rounded-lg transition cursor-pointer ${
                            copiedId === p.id
                              ? 'bg-emerald-100 text-emerald-700'
                              : 'hover:bg-gray-100 text-gray-600 hover:text-blue-600'
                          }`}
                          title={copiedId === p.id ? 'Link copiado!' : 'Copiar Link do Produto'}
                        >
                          {copiedId === p.id ? (
                            <Check className="w-4 h-4 text-emerald-600" />
                          ) : (
                            <Copy className="w-4 h-4" />
                          )}
                        </button>

                        <button
                          onClick={() => onOpenProductDetail(p.id)}
                          className="p-1.5 hover:bg-gray-100 text-gray-600 hover:text-gray-900 rounded-lg transition cursor-pointer"
                          title="Visualizar na Loja"
                        >
                          <Eye className="w-4 h-4" />
                        </button>

                        {onEditProduct && (
                          <button
                            onClick={() => onEditProduct(p)}
                            className="p-1.5 hover:bg-blue-50 text-gray-600 hover:text-blue-700 rounded-lg transition cursor-pointer"
                            title="Editar Produto"
                          >
                            <Edit className="w-4 h-4" />
                          </button>
                        )}

                        {onDeleteProduct && (
                          <button
                            onClick={() => setProductToDelete(p)}
                            className="p-1.5 hover:bg-red-50 text-gray-600 hover:text-red-700 rounded-lg transition cursor-pointer"
                            title="Excluir Produto"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Delete Confirmation Modal */}
      {productToDelete && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 animate-fadeIn">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4 border border-gray-100">
            <div className="flex items-center gap-3 text-red-600">
              <div className="p-3 bg-red-100 rounded-xl">
                <Trash2 className="w-6 h-6" />
              </div>
              <div>
                <h3 className="font-black text-gray-900 text-base">Excluir Produto</h3>
                <p className="text-xs text-gray-500">Esta ação removerá o produto do catálogo da loja.</p>
              </div>
            </div>

            <div className="bg-gray-50 p-3 rounded-xl flex items-center gap-3 border border-gray-200">
              <img
                src={productToDelete.image}
                alt={productToDelete.title}
                className="w-12 h-12 rounded-lg object-cover bg-white"
              />
              <div className="overflow-hidden">
                <div className="font-bold text-xs text-gray-900 truncate">{productToDelete.title}</div>
                <div className="text-[11px] text-gray-500 font-mono">
                  {formatCurrency(productToDelete.price, selectedCurrency)} • Estoque: {productToDelete.stock}
                </div>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setProductToDelete(null)}
                className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold rounded-xl text-xs transition cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => {
                  if (onDeleteProduct && productToDelete) {
                    onDeleteProduct(productToDelete.id);
                    setProductToDelete(null);
                  }
                }}
                className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white font-bold rounded-xl text-xs transition cursor-pointer shadow-md"
              >
                Sim, Excluir Produto
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
