import React, { useEffect, useMemo, useState } from 'react';
import { Package, Loader2, AlertCircle, ImageOff, PauseCircle, PlayCircle, X } from 'lucide-react';
import { AdminService } from '../../services/adminService';
import { useCountries } from '../../hooks/useCountries';

interface AdminProductsModerationProps {
  showToast: (msg: string) => void;
}

// FASE D16-G1.1 — Admin Global Catalog Isolation. Esta tela existia como um
// stub client-only (useState<any[]>([]) nunca populado, "moderação" fake
// sem nenhum backend real por trás) — nunca foi a causa da regressão de G1,
// mas também nunca implementou de fato a visão administrativa completa que
// o ADMIN/GLOBAL_ADMIN precisa. Objetivo desta fase: LISTAGEM
// administrativa global REAL, usando GET /admin/products (nunca o catálogo
// público /products) — sem inventar workflow de aprovação/suspensão/edição
// que não existe no backend (os antigos botões Aprovar/Suspender eram
// puramente locais, sem persistência nenhuma — removidos por não
// representarem uma ação real).
//
// "País de origem" aqui é um filtro ADMINISTRATIVO independente
// (originCountryFilter, mesmo conceito do catálogo público D16-G1) — nunca
// lido de PreferencesContext (selectedCountry/catalogOriginFilter
// comerciais). Trocar o seletor de país do Header nunca afeta esta lista.
export const AdminProductsModeration: React.FC<AdminProductsModerationProps> = ({ showToast }) => {
  const [products, setProducts] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [originFilter, setOriginFilter] = useState<string>('ALL');
  // C2.2 — a lista administrativa mostra publicados E pausados; o filtro só restringe a visão.
  const [visibilityFilter, setVisibilityFilter] = useState<'all' | 'published' | 'paused'>('all');
  const [pending, setPending] = useState<{ product: any; next: 'active' | 'paused' } | null>(null);
  const [reason, setReason] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  const { data: operationalCountries } = useCountries();

  const fetchProducts = async (origin: string, visibility: 'all' | 'published' | 'paused' = visibilityFilter) => {
    setIsLoading(true);
    setError(null);
    try {
      const params: { originCountryFilter?: string; visibility?: 'published' | 'paused'; limit?: number } = { limit: 100 };
      if (origin !== 'ALL') params.originCountryFilter = origin;
      if (visibility !== 'all') params.visibility = visibility;
      const res = await AdminService.getProducts(params);
      if (res.success && Array.isArray(res.data)) {
        setProducts(res.data);
      } else {
        setProducts([]);
        setError(res.message || 'Não foi possível carregar o catálogo administrativo.');
      }
    } catch (err: any) {
      setProducts([]);
      if (err?.response?.status === 401) {
        setError('Sua sessão expirou. Entre novamente.');
      } else if (err?.response?.status === 403) {
        setError('Você não possui permissão para visualizar o catálogo administrativo completo.');
      } else {
        setError('Não foi possível carregar o catálogo administrativo no momento.');
        showToast(err?.response?.data?.error?.message || err?.message || 'Erro ao carregar produtos administrativos.');
      }
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchProducts(originFilter, visibilityFilter);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [originFilter, visibilityFilter]);

  const confirmChange = async () => {
    if (!pending || isSaving) return;
    setIsSaving(true);
    try {
      const res = await AdminService.setProductStatus(pending.product.id, pending.next, reason.trim() || undefined);
      if (res.success) {
        showToast(res.message || (pending.next === 'paused' ? 'Produto retirado do catálogo.' : 'Produto devolvido ao catálogo.'));
        setPending(null);
        setReason('');
        await fetchProducts(originFilter, visibilityFilter);
      } else {
        showToast(res.message || 'Não foi possível alterar o produto.');
      }
    } catch (err: any) {
      showToast(err?.response?.data?.error?.message || err?.message || 'Não foi possível alterar o produto.');
    } finally {
      setIsSaving(false);
    }
  };

  const originOptions = useMemo(() => operationalCountries || [], [operationalCountries]);

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-2xl p-6 border border-gray-200 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-gray-900 flex items-center gap-2">
            <Package className="w-6 h-6 text-purple-600" />
            Catálogo Administrativo Global
          </h1>
          <p className="text-xs text-gray-500 mt-1">
            Todos os produtos da plataforma (publicados e pausados), de qualquer origem e escopo de venda — independente do país de destino ou do filtro comercial do catálogo público. Retirar um produto do catálogo não o apaga.
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <label htmlFor="admin-visibility-filter" className="text-[11px] font-bold text-gray-500 uppercase">
            Situação
          </label>
          <select
            id="admin-visibility-filter"
            value={visibilityFilter}
            onChange={(e) => setVisibilityFilter(e.target.value as 'all' | 'published' | 'paused')}
            className="text-xs font-bold border border-gray-200 rounded-lg px-3 py-2 bg-white text-gray-800"
          >
            <option value="all">Todos</option>
            <option value="published">Publicados</option>
            <option value="paused">Pausados</option>
          </select>
          <label htmlFor="admin-origin-filter" className="text-[11px] font-bold text-gray-500 uppercase">
            País de origem
          </label>
          <select
            id="admin-origin-filter"
            value={originFilter}
            onChange={(e) => setOriginFilter(e.target.value)}
            className="text-xs font-bold border border-gray-200 rounded-lg px-3 py-2 bg-white text-gray-800"
          >
            <option value="ALL">Todos</option>
            {originOptions.map((c) => (
              <option key={c.code} value={c.code}>
                {c.flag} {c.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-gray-200 shadow-xs p-6 space-y-4">
        {isLoading ? (
          <div className="p-12 text-center text-gray-400 space-y-2">
            <Loader2 className="w-8 h-8 mx-auto animate-spin text-purple-500" />
            <p className="font-bold text-sm text-gray-600">Carregando catálogo administrativo...</p>
          </div>
        ) : error ? (
          <div className="p-12 text-center space-y-2">
            <AlertCircle className="w-10 h-10 mx-auto text-red-400" />
            <p className="font-bold text-sm text-red-600">{error}</p>
          </div>
        ) : products.length === 0 ? (
          <div className="p-12 text-center text-gray-400 space-y-2">
            <Package className="w-10 h-10 mx-auto text-gray-300 stroke-1" />
            <p className="font-bold text-sm text-gray-600">Nenhum produto encontrado.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200 text-gray-500 uppercase font-black text-[10px]">
                  <th className="p-3">Produto</th>
                  <th className="p-3">Loja (ID)</th>
                  <th className="p-3">Origem</th>
                  <th className="p-3">Preço</th>
                  <th className="p-3">Escopo</th>
                  <th className="p-3">Status</th>
                  <th className="p-3 text-right">Ação</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {products.map((p) => (
                  <tr key={p.id} className="hover:bg-gray-50/50">
                    <td className="p-3">
                      <div className="flex items-center gap-2">
                        {p.image ? (
                          <img src={p.image} alt={p.title} className="w-8 h-8 rounded-lg object-cover border border-gray-200" />
                        ) : (
                          <div className="w-8 h-8 rounded-lg bg-gray-100 flex items-center justify-center border border-gray-200">
                            <ImageOff className="w-3.5 h-3.5 text-gray-300" />
                          </div>
                        )}
                        <div>
                          <div className="font-extrabold text-gray-900">{p.title}</div>
                          <div className="text-[10px] text-gray-400">ID: {p.id}</div>
                        </div>
                      </div>
                    </td>
                    <td className="p-3 font-mono text-[10px] text-gray-500">{p.storeId || '—'}</td>
                    <td className="p-3 font-bold text-gray-700">{p.countryCode || '—'}</td>
                    <td className="p-3 font-black text-purple-700">
                      {typeof p.price === 'number' ? p.price.toLocaleString('pt-BR', { style: 'currency', currency: p.currency || 'XOF' }) : p.price}
                    </td>
                    <td className="p-3">
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-gray-100 text-gray-700">
                        {p.publishingScope === 'international' ? 'Internacional' : 'Nacional'}
                      </span>
                    </td>
                    <td className="p-3">
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-black ${
                        p.isActive === false ? 'bg-red-100 text-red-800' : 'bg-emerald-100 text-emerald-800'
                      }`}>
                        {p.isActive === false ? 'PAUSADO' : 'PUBLICADO'}
                      </span>
                    </td>
                    <td className="p-3 text-right">
                      {p.isActive === false ? (
                        <button
                          onClick={() => { setPending({ product: p, next: 'active' }); setReason(''); }}
                          className="inline-flex items-center gap-1 font-bold text-emerald-700 hover:text-emerald-900 cursor-pointer whitespace-nowrap"
                        >
                          <PlayCircle className="w-3.5 h-3.5" /> Devolver ao catálogo
                        </button>
                      ) : (
                        <button
                          onClick={() => { setPending({ product: p, next: 'paused' }); setReason(''); }}
                          className="inline-flex items-center gap-1 font-bold text-amber-700 hover:text-amber-900 cursor-pointer whitespace-nowrap"
                        >
                          <PauseCircle className="w-3.5 h-3.5" /> Retirar do catálogo
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {pending && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4 animate-fadeIn">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-gray-100 space-y-4">
            <div className="flex items-center justify-between border-b border-gray-100 pb-3">
              <h3 className="font-black text-base text-gray-900 flex items-center gap-2">
                {pending.next === 'paused' ? <PauseCircle className="w-5 h-5 text-amber-600" /> : <PlayCircle className="w-5 h-5 text-emerald-600" />}
                {pending.next === 'paused' ? 'Retirar do catálogo' : 'Devolver ao catálogo'}
              </h3>
              <button onClick={() => setPending(null)} className="p-1 text-gray-400 hover:text-gray-600 rounded-lg" aria-label="Fechar">
                <X className="w-5 h-5" />
              </button>
            </div>

            <p className="text-xs text-gray-600">
              {pending.next === 'paused'
                ? <>O produto <strong>{pending.product.title}</strong> deixa de aparecer para os compradores e continua no painel do vendedor. Nada é apagado.</>
                : <>O produto <strong>{pending.product.title}</strong> volta a aparecer no catálogo (se a loja e o vendedor estiverem ativos).</>}
            </p>

            <div className="text-xs">
              <label htmlFor="product-status-reason" className="block font-bold text-gray-700 mb-1">Motivo (opcional, fica só na auditoria):</label>
              <textarea
                id="product-status-reason"
                rows={3}
                maxLength={500}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                className="w-full p-2.5 border border-gray-300 rounded-xl font-bold"
              />
            </div>

            <div className="pt-3 border-t border-gray-100 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setPending(null)}
                className="px-4 py-2 border border-gray-300 font-bold text-gray-700 rounded-xl hover:bg-gray-50 text-xs"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={confirmChange}
                disabled={isSaving}
                className={`px-5 py-2 text-white font-extrabold rounded-xl shadow-md text-xs disabled:opacity-60 ${
                  pending.next === 'paused' ? 'bg-amber-600 hover:bg-amber-700' : 'bg-emerald-600 hover:bg-emerald-700'
                }`}
              >
                {isSaving ? 'Salvando…' : pending.next === 'paused' ? 'Retirar do catálogo' : 'Devolver ao catálogo'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
