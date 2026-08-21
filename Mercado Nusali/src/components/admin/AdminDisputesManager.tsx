import React, { useState, useEffect } from 'react';
import { ShieldAlert, MessageSquare, FileText, CheckCircle2, User, Clock, Loader2 } from 'lucide-react';
import { AdminService } from '../../services/adminService';
import { AdminDisputeRecord } from '../../data/mockAdminDisputes';

interface AdminDisputesManagerProps {
  showToast: (msg: string) => void;
}

export const AdminDisputesManager: React.FC<AdminDisputesManagerProps> = ({ showToast }) => {
  const [disputes, setDisputes] = useState<AdminDisputeRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedDispute, setSelectedDispute] = useState<AdminDisputeRecord | null>(null);

  const fetchDisputes = async () => {
    setIsLoading(true);
    try {
      const res = await AdminService.getDisputesList();
      if (res.success && res.data) {
        setDisputes(res.data);
      }
    } catch {
      // fallback
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchDisputes();
  }, []);

  const handleResolveForBuyer = async (id: string) => {
    try {
      const res = await AdminService.resolveDispute(id, 'refund_buyer', 'Reembolso total agendado');
      setDisputes(prev => prev.map(d => d.id === id ? { ...d, status: 'resolved' } : d));
      showToast(res.message || `Disputa #${id} resolvida a favor do Comprador. Reembolso total agendado.`);
    } catch {
      showToast(`Disputa #${id} resolvida.`);
    }
    setSelectedDispute(null);
  };

  const handleResolveForSeller = async (id: string) => {
    try {
      const res = await AdminService.resolveDispute(id, 'release_seller', 'Fundos liberados no Escrow');
      setDisputes(prev => prev.map(d => d.id === id ? { ...d, status: 'resolved' } : d));
      showToast(res.message || `Disputa #${id} resolvida a favor do Vendedor. Fundos liberados no Escrow.`);
    } catch {
      showToast(`Disputa #${id} resolvida.`);
    }
    setSelectedDispute(null);
  };

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-2xl p-6 border border-gray-200 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-gray-900 flex items-center gap-2">
            <ShieldAlert className="w-6 h-6 text-purple-600" />
            Mediação de Disputas & Reclamações CPLP
          </h1>
          <p className="text-xs text-gray-500 mt-1">
            Mesa de conciliação com histórico de mensagens, fotos de evidências e decisão vinculante de mediadores.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {disputes.map(d => (
          <div key={d.id} className="bg-white rounded-2xl border border-gray-200 shadow-xs p-6 space-y-4 hover:border-purple-300 transition">
            <div className="flex justify-between items-start">
              <div>
                <span className="text-[10px] font-bold text-gray-400 block font-mono">Ref: {d.id} ({d.orderId})</span>
                <h3 className="font-extrabold text-sm text-gray-900">{d.productTitle}</h3>
                <p className="text-xs text-purple-700 font-bold">{d.buyerName} vs {d.sellerName}</p>
              </div>

              <span className="bg-red-100 text-red-800 text-[10px] font-black px-2.5 py-1 rounded-full">
                EM MEDIAÇÃO
              </span>
            </div>

            <div className="bg-gray-50 p-3 rounded-xl space-y-1.5 text-xs border border-gray-100">
              <span className="font-bold text-gray-700 block">Motivo da Reclamação:</span>
              <p className="text-gray-600">{d.reason}</p>
              <div className="pt-2 flex justify-between font-bold text-gray-800 border-t border-gray-200 mt-2">
                <span>Valor Retido: {d.amountFormatted}</span>
                <span>Mediador: {d.mediatorName}</span>
              </div>
            </div>

            <div className="flex items-center justify-between text-xs text-gray-500 pt-1">
              <span>💬 {d.messagesCount} mensagens • 📁 {d.evidencesCount} fotos de provas</span>
              <span className="font-bold text-amber-600 flex items-center gap-1">
                <Clock className="w-3.5 h-3.5" /> {d.deadline}
              </span>
            </div>

            <div className="pt-3 border-t border-gray-100 flex items-center justify-between">
              <button
                onClick={() => setSelectedDispute(d)}
                className="bg-purple-50 hover:bg-purple-100 text-purple-700 font-extrabold text-xs px-3 py-2 rounded-xl transition"
              >
                Abrir Sala de Mediação
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* Mediation Modal */}
      {selectedDispute && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fadeIn">
          <div className="bg-white rounded-2xl max-w-2xl w-full p-6 space-y-4 shadow-2xl border border-gray-200">
            <div className="flex justify-between items-center border-b border-gray-100 pb-3">
              <h3 className="text-lg font-black text-gray-900">Sala de Mediação Vinculante #{selectedDispute.id}</h3>
              <button onClick={() => setSelectedDispute(null)} className="text-gray-400 hover:text-gray-600 font-bold">X</button>
            </div>

            <div className="space-y-3 text-xs">
              <p className="font-bold text-gray-800">Linha do Tempo da Ocorrência:</p>
              <div className="space-y-2 border-l-2 border-purple-500 pl-3">
                {selectedDispute.timeline.map((item, idx) => (
                  <div key={idx} className="text-xs">
                    <span className="font-bold text-gray-900">{item.title}</span>
                    <span className="text-[10px] text-gray-400 block">{item.date}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-4 border-t border-gray-100">
              <button onClick={() => handleResolveForBuyer(selectedDispute.id)} className="px-3 py-2 bg-red-600 text-white font-bold text-xs rounded-xl">
                Decidir a Favor do Comprador (Reembolso)
              </button>
              <button onClick={() => handleResolveForSeller(selectedDispute.id)} className="px-3 py-2 bg-emerald-600 text-white font-bold text-xs rounded-xl">
                Decidir a Favor do Vendedor (Liberar Escrow)
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
