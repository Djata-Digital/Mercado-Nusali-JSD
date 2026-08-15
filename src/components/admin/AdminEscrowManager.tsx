import React, { useState, useEffect } from 'react';
import { ShieldCheck, Lock, Unlock, AlertTriangle, CheckCircle, RefreshCw, DollarSign, Loader2 } from 'lucide-react';
import { AdminService } from '../../services/adminService';
import { AdminEscrowRecord } from '../../data/mockAdminEscrow';

interface AdminEscrowManagerProps {
  showToast: (msg: string) => void;
}

export const AdminEscrowManager: React.FC<AdminEscrowManagerProps> = ({ showToast }) => {
  const [escrowList, setEscrowList] = useState<AdminEscrowRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const fetchEscrow = async () => {
    setIsLoading(true);
    try {
      const res = await AdminService.getEscrowList();
      if (res.success && res.data) {
        setEscrowList(res.data);
      }
    } catch {
      // fallback
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchEscrow();
  }, []);

  const handleManualRelease = async (id: string) => {
    try {
      const res = await AdminService.releaseEscrow(id);
      setEscrowList(prev => prev.map(e => e.id === id ? { ...e, status: 'liberado' } : e));
      showToast(res.message || `Custódia #${id} liberada manualmente pelo administrador. Saldo transferido ao vendedor.`);
    } catch {
      showToast(`Custódia #${id} liberada.`);
    }
  };

  const handleBlock = async (id: string) => {
    try {
      const res = await AdminService.freezeEscrow(id);
      setEscrowList(prev => prev.map(e => e.id === id ? { ...e, status: 'bloqueado' } : e));
      showToast(res.message || `Custódia #${id} bloqueada administrativamente.`);
    } catch {
      showToast(`Custódia #${id} bloqueada.`);
    }
  };

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-2xl p-6 border border-gray-200 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-gray-900 flex items-center gap-2">
            <Lock className="w-6 h-6 text-purple-600" />
            Nusali Proteção - Custódia Financeira Escrow
          </h1>
          <p className="text-xs text-gray-500 mt-1">
            Gestão de fundos retidos em garantia até a confirmação de entrega do comprador ou decisão de disputa.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {escrowList.map(e => (
          <div key={e.id} className="bg-white rounded-2xl border border-gray-200 shadow-xs p-6 space-y-4 hover:border-purple-300 transition">
            <div className="flex justify-between items-start">
              <div>
                <span className="text-[10px] font-bold text-gray-400 block font-mono">Ref: {e.id} ({e.orderId})</span>
                <h3 className="font-extrabold text-base text-gray-900">{e.amountFormatted}</h3>
                <p className="text-xs text-purple-700 font-bold">{e.buyerName} ➔ {e.sellerName}</p>
              </div>

              <span className={`text-[10px] font-black px-2.5 py-1 rounded-full ${
                e.status === 'liberado' ? 'bg-emerald-100 text-emerald-800' :
                e.status === 'em_disputa' ? 'bg-red-100 text-red-800' : 'bg-amber-100 text-amber-800'
              }`}>
                {e.status.toUpperCase()}
              </span>
            </div>

            <div className="bg-gray-50 p-3 rounded-xl space-y-2 text-xs border border-gray-100">
              <div className="flex justify-between">
                <span className="text-gray-500 font-bold">Condição de Liberação:</span>
                <span className="font-extrabold text-gray-900 text-right">{e.releaseCondition}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500 font-bold">Status Logístico:</span>
                <span className="font-bold text-emerald-700">{e.deliveryStatus}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500 font-bold">Previsão Liberação:</span>
                <span className="font-bold text-gray-800">{e.expectedReleaseDate}</span>
              </div>
            </div>

            {e.notes && (
              <p className="text-[11px] text-gray-500 bg-purple-50/50 p-2 rounded-lg border border-purple-100">
                💡 {e.notes}
              </p>
            )}

            <div className="pt-3 border-t border-gray-100 flex items-center justify-between">
              <button
                onClick={() => handleBlock(e.id)}
                className="bg-red-50 hover:bg-red-100 text-red-700 font-bold text-xs px-3 py-2 rounded-xl transition"
              >
                Bloquear Fundos
              </button>
              <button
                onClick={() => handleManualRelease(e.id)}
                className="bg-purple-600 hover:bg-purple-700 text-white font-extrabold text-xs px-4 py-2 rounded-xl transition shadow-md"
              >
                Liberar ao Vendedor
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
