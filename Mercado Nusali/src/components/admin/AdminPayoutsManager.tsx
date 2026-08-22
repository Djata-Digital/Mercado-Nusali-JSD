import React, { useState, useEffect } from 'react';
import { ArrowUpRight, CheckCircle, Clock, Search, ShieldAlert, Loader2, XCircle, RefreshCw } from 'lucide-react';
import { AdminService } from '../../services/adminService';

interface AdminPayoutsManagerProps {
  showToast: (msg: string) => void;
}

export const AdminPayoutsManager: React.FC<AdminPayoutsManagerProps> = ({ showToast }) => {
  const [payouts, setPayouts] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [processingId, setProcessingId] = useState<string | null>(null);

  const fetchPayouts = async () => {
    setIsLoading(true);
    try {
      const res = await AdminService.getPayoutsList();
      if (res.success && res.data) {
        setPayouts(res.data);
      }
    } catch (err) {
      console.error('Error fetching admin payouts:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchPayouts();
  }, []);

  const handleUpdateStatus = async (id: string, status: 'processing' | 'completed' | 'failed') => {
    try {
      setProcessingId(id);
      const res = await AdminService.updatePayoutStatus(id, status);
      if (res.success) {
        showToast(res.message || `Status do saque #${id} atualizado.`);
        fetchPayouts();
      } else {
        showToast(res.message || 'Falha ao atualizar status do saque.');
      }
    } catch (err: any) {
      showToast(err?.message || 'Erro ao processar atualização do saque.');
    } finally {
      setProcessingId(null);
    }
  };

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-2xl p-6 border border-gray-200 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-gray-900 flex items-center gap-2">
            <ArrowUpRight className="w-6 h-6 text-purple-600" />
            Gestão de Repasses & Transferências a Vendedores
          </h1>
          <p className="text-xs text-gray-500 mt-1">
            Aprovação e conciliação bancária de saques via Orange Money, PIX, MB WAY e contas bancárias locais.
          </p>
        </div>

        <button
          onClick={fetchPayouts}
          className="flex items-center gap-2 text-xs font-bold text-gray-600 bg-gray-100 hover:bg-gray-200 px-3 py-2 rounded-xl transition self-start md:self-auto"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
          Atualizar
        </button>
      </div>

      <div className="bg-white rounded-2xl border border-gray-200 shadow-xs p-6 space-y-4">
        {isLoading ? (
          <div className="p-12 text-center text-gray-400">
            <Loader2 className="w-8 h-8 animate-spin mx-auto text-purple-600 mb-2" />
            <p className="text-xs font-bold">Carregando solicitações de repasse...</p>
          </div>
        ) : payouts.length === 0 ? (
          <div className="p-12 text-center text-gray-400 space-y-2">
            <ArrowUpRight className="w-10 h-10 mx-auto text-gray-300 stroke-1" />
            <p className="font-bold text-sm text-gray-600">Nenhum repasse ou solicitação de saque</p>
            <p className="text-xs text-gray-400 max-w-sm mx-auto">
              Não existem saques pendentes de vendedores ou transferências efetuadas no momento.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200 text-gray-500 uppercase font-black text-[10px]">
                  <th className="p-3">ID Saque</th>
                  <th className="p-3">Vendedor</th>
                  <th className="p-3">Valor</th>
                  <th className="p-3">Método</th>
                  <th className="p-3">Data</th>
                  <th className="p-3">Status</th>
                  <th className="p-3 text-right">Ações de Aprovação</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {payouts.map(p => (
                  <tr key={p.id} className="hover:bg-gray-50/50">
                    <td className="p-3 font-extrabold text-gray-900 font-mono">{p.id}</td>
                    <td className="p-3 font-bold text-gray-800">{p.sellerName || p.sellerId}</td>
                    <td className="p-3 font-black text-emerald-700">
                      {p.currency} {Number(p.amount).toLocaleString()}
                    </td>
                    <td className="p-3 text-gray-600 uppercase font-bold">{p.method}</td>
                    <td className="p-3 text-gray-500">{new Date(p.createdAt).toLocaleDateString()}</td>
                    <td className="p-3">
                      <span className={`px-2.5 py-1 rounded-full text-[10px] font-black ${
                        p.status === 'completed' ? 'bg-emerald-100 text-emerald-800' :
                        p.status === 'failed' ? 'bg-red-100 text-red-800' :
                        p.status === 'processing' ? 'bg-blue-100 text-blue-800' : 'bg-amber-100 text-amber-800'
                      }`}>
                        {(p.status || 'pending').toUpperCase()}
                      </span>
                    </td>
                    <td className="p-3 text-right space-x-2">
                      {p.status === 'pending' && (
                        <>
                          <button
                            disabled={processingId === p.id}
                            onClick={() => handleUpdateStatus(p.id, 'processing')}
                            className="px-2.5 py-1 bg-blue-50 text-blue-700 font-bold rounded-lg hover:bg-blue-100 transition"
                          >
                            Processar
                          </button>
                          <button
                            disabled={processingId === p.id}
                            onClick={() => handleUpdateStatus(p.id, 'failed')}
                            className="px-2.5 py-1 bg-red-50 text-red-700 font-bold rounded-lg hover:bg-red-100 transition"
                          >
                            Rejeitar
                          </button>
                        </>
                      )}
                      {p.status === 'processing' && (
                        <>
                          <button
                            disabled={processingId === p.id}
                            onClick={() => handleUpdateStatus(p.id, 'completed')}
                            className="px-2.5 py-1 bg-emerald-600 text-white font-bold rounded-lg hover:bg-emerald-700 transition shadow-xs"
                          >
                            Concluir Saque
                          </button>
                          <button
                            disabled={processingId === p.id}
                            onClick={() => handleUpdateStatus(p.id, 'failed')}
                            className="px-2.5 py-1 bg-red-50 text-red-700 font-bold rounded-lg hover:bg-red-100 transition"
                          >
                            Falhar / Devolver
                          </button>
                        </>
                      )}
                      {p.status === 'completed' && (
                        <span className="text-[11px] font-mono text-gray-400">Ref: {p.transactionRef || 'OK'}</span>
                      )}
                      {p.status === 'failed' && (
                        <span className="text-[11px] font-mono text-red-400">Falhou / Devolvido</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
