import React, { useState } from 'react';
import { AlertOctagon, CheckCircle2, Trash2 } from 'lucide-react';

interface AdminReportsModerationProps {
  showToast: (msg: string) => void;
}

export const AdminReportsModeration: React.FC<AdminReportsModerationProps> = ({ showToast }) => {
  const [reports, setReports] = useState<any[]>([]);

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-2xl p-6 border border-gray-200 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-gray-900 flex items-center gap-2">
            <AlertOctagon className="w-6 h-6 text-purple-600" />
            Central de Denúncias & Violações da Comunidade
          </h1>
          <p className="text-xs text-gray-500 mt-1">
            Moderação de conteúdo impróprio, réplicas falsificadas e comportamento abusivo.
          </p>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-gray-200 shadow-xs p-6 space-y-4">
        {reports.length === 0 ? (
          <div className="p-12 text-center text-gray-400 space-y-2">
            <AlertOctagon className="w-10 h-10 mx-auto text-gray-300 stroke-1" />
            <p className="font-bold text-sm text-gray-600">Nenhuma denúncia registrada</p>
            <p className="text-xs text-gray-400 max-w-sm mx-auto">
              Não existem denúncias ativas ou relatórios de violação de termos para análise no momento.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200 text-gray-500 uppercase font-black text-[10px]">
                  <th className="p-3">Ref Denúncia</th>
                  <th className="p-3">Item / Perfil Denunciado</th>
                  <th className="p-3">Denunciante</th>
                  <th className="p-3">Motivo Alegado</th>
                  <th className="p-3">Status</th>
                  <th className="p-3 text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {reports.map(r => (
                  <tr key={r.id} className="hover:bg-gray-50/50">
                    <td className="p-3 font-extrabold text-gray-900">{r.id}</td>
                    <td className="p-3 font-bold text-red-600">{r.reportedItem}</td>
                    <td className="p-3 text-gray-600">{r.reporter}</td>
                    <td className="p-3 text-gray-700">{r.reason}</td>
                    <td className="p-3 font-bold text-amber-700">{r.status}</td>
                    <td className="p-3 text-right">
                      <button onClick={() => showToast(`Anúncio ${r.reportedItem} removido por violação.`)} className="px-2.5 py-1 bg-red-600 text-white font-bold rounded-lg hover:bg-red-700">
                        Remover Anúncio
                      </button>
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
