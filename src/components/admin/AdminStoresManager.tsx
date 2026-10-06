import React, { useState, useEffect } from 'react';
import { Building2, X, Loader2, PauseCircle, PlayCircle } from 'lucide-react';
import { AdminService } from '../../services/adminService';

interface AdminStoresManagerProps {
  showToast: (msg: string) => void;
}

// C2.2 — moderação MÍNIMA e real: pausar/reativar loja (PATCH /admin/stores/:id/status, só Administrador Geral, auditado).
// Loja pausada some do catálogo, da busca e das categorias (os produtos NÃO são alterados: reativar devolve os que continuam
// publicados). "Destacar na Home", "Advertência formal" e "Credenciar loja" foram removidos: não tinham backend e os avisos
// afirmavam ações que nunca aconteceram.
export const AdminStoresManager: React.FC<AdminStoresManagerProps> = ({ showToast }) => {
  const [stores, setStores] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [pending, setPending] = useState<{ store: any; next: 'active' | 'paused' } | null>(null);
  const [reason, setReason] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  const fetchStores = async () => {
    setIsLoading(true);
    try {
      const res = await AdminService.getStores();
      if (res.success && res.data) {
        setStores(res.data);
      } else if (res.message) {
        showToast(res.message);
      }
    } catch (err: any) {
      if (err?.response?.status === 401) {
        showToast('Sua sessão expirou. Entre novamente.');
      } else if (err?.response?.status === 403) {
        showToast('Você não possui permissão para acessar esta área.');
      } else {
        showToast(err?.response?.data?.message || err?.message || 'Erro ao carregar lojas.');
      }
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchStores();
  }, []);

  const confirmChange = async () => {
    if (!pending || isSaving) return;
    setIsSaving(true);
    try {
      const res = await AdminService.setStoreStatus(pending.store.id, pending.next, reason.trim() || undefined);
      if (res.success) {
        showToast(res.message || (pending.next === 'paused' ? 'Loja pausada.' : 'Loja reativada.'));
        setPending(null);
        setReason('');
        await fetchStores();
      } else {
        showToast(res.message || 'Não foi possível alterar a loja.');
      }
    } catch (err: any) {
      showToast(err?.response?.data?.error?.message || err?.message || 'Não foi possível alterar a loja.');
    } finally {
      setIsSaving(false);
    }
  };

  const statusLabel = (status: string) => (status === 'active' ? 'ATIVA' : status === 'paused' ? 'PAUSADA' : String(status || '—').toUpperCase());

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-2xl p-6 border border-gray-200 shadow-xs">
        <h1 className="text-2xl font-black text-gray-900 flex items-center gap-2">
          <Building2 className="w-6 h-6 text-purple-600" />
          Gestão & Moderação de Lojas
        </h1>
        <p className="text-xs text-gray-500 mt-1">
          Pause ou reative lojas. Uma loja pausada deixa de aparecer no catálogo, na busca e nas categorias, sem apagar nenhum produto.
        </p>
      </div>

      {isLoading ? (
        <div className="p-12 text-center text-gray-400">
          <Loader2 className="w-8 h-8 animate-spin mx-auto text-purple-600 mb-2" />
          Carregando lojas...
        </div>
      ) : stores.length === 0 ? (
        <div className="p-12 text-center text-gray-500 font-bold bg-white rounded-2xl border border-gray-200">
          Nenhuma loja encontrada
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {stores.map(s => (
            <div key={s.id} className="bg-white rounded-2xl border border-gray-200 shadow-xs p-5 space-y-4 hover:border-purple-300 transition">
              <div className="flex justify-between items-start gap-2">
                <div className="min-w-0">
                  <span className="text-[10px] font-bold text-gray-400 block">{s.countryCode || 'GW'}</span>
                  <h3 className="font-extrabold text-sm text-gray-900 break-words">{s.name}</h3>
                  <p className="text-xs text-purple-700 font-bold break-all">Slug: /{s.slug}</p>
                </div>
                <span className={`text-[10px] font-black px-2 py-0.5 rounded-full shrink-0 ${
                  s.status === 'active' ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'
                }`}>
                  {statusLabel(s.status)}
                </span>
              </div>

              <div className="space-y-1.5 text-xs bg-gray-50 p-3 rounded-xl">
                <div className="flex justify-between text-gray-600 gap-2">
                  <span>Descrição:</span>
                  <strong className="text-gray-900 truncate max-w-[150px]">{s.description || 'Sem descrição'}</strong>
                </div>
                <div className="flex justify-between text-gray-600">
                  <span>Avaliação:</span>
                  <strong className="text-gray-900">⭐ {s.rating || '5.0'}</strong>
                </div>
              </div>

              <div className="pt-2 flex items-center justify-end text-xs border-t border-gray-100">
                {s.status === 'active' ? (
                  <button
                    onClick={() => { setPending({ store: s, next: 'paused' }); setReason(''); }}
                    className="font-bold flex items-center gap-1 cursor-pointer text-amber-700 hover:text-amber-900"
                  >
                    <PauseCircle className="w-3.5 h-3.5" /> Pausar loja
                  </button>
                ) : s.status === 'paused' ? (
                  <button
                    onClick={() => { setPending({ store: s, next: 'active' }); setReason(''); }}
                    className="font-bold flex items-center gap-1 cursor-pointer text-emerald-700 hover:text-emerald-900"
                  >
                    <PlayCircle className="w-3.5 h-3.5" /> Reativar loja
                  </button>
                ) : (
                  <span className="text-gray-400 font-bold">Loja encerrada</span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {pending && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4 animate-fadeIn">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-gray-100 space-y-4">
            <div className="flex items-center justify-between border-b border-gray-100 pb-3">
              <h3 className="font-black text-base text-gray-900 flex items-center gap-2">
                {pending.next === 'paused' ? <PauseCircle className="w-5 h-5 text-amber-600" /> : <PlayCircle className="w-5 h-5 text-emerald-600" />}
                {pending.next === 'paused' ? 'Pausar loja' : 'Reativar loja'}
              </h3>
              <button onClick={() => setPending(null)} className="p-1 text-gray-400 hover:text-gray-600 rounded-lg" aria-label="Fechar">
                <X className="w-5 h-5" />
              </button>
            </div>

            <p className="text-xs text-gray-600">
              {pending.next === 'paused'
                ? <>A loja <strong>{pending.store.name}</strong> e todos os seus produtos deixam de aparecer para os compradores. Nenhum produto é apagado nem alterado.</>
                : <>A loja <strong>{pending.store.name}</strong> volta ao catálogo, junto com os produtos que continuam publicados.</>}
            </p>

            <div className="text-xs">
              <label htmlFor="store-status-reason" className="block font-bold text-gray-700 mb-1">Motivo (opcional, fica só na auditoria):</label>
              <textarea
                id="store-status-reason"
                rows={3}
                maxLength={500}
                value={reason}
                onChange={e => setReason(e.target.value)}
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
                {isSaving ? 'Salvando…' : pending.next === 'paused' ? 'Pausar loja' : 'Reativar loja'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
