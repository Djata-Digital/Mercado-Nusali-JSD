import React, { useState } from 'react';
import { ShieldAlert, AlertTriangle, Eye, Lock, CheckCircle } from 'lucide-react';
import { mockRiskAlertsList, RiskAlertRecord } from '../../data/mockAdminRisk';

interface AdminRiskCenterProps {
  showToast: (msg: string) => void;
}

export const AdminRiskCenter: React.FC<AdminRiskCenterProps> = ({ showToast }) => {
  const [alerts, setAlerts] = useState<RiskAlertRecord[]>(mockRiskAlertsList);

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-2xl p-6 border border-gray-200 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-gray-900 flex items-center gap-2">
            <ShieldAlert className="w-6 h-6 text-purple-600" />
            Central de Risco, Antifraude & Prevenção de Perdas
          </h1>
          <p className="text-xs text-gray-500 mt-1">
            Motor de regras para detecção de saques suspeitos, lavagem de capitais e múltiplas contas.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {alerts.map(a => (
          <div key={a.id} className="bg-white rounded-2xl border border-gray-200 shadow-xs p-5 space-y-4 hover:border-purple-300 transition">
            <div className="flex justify-between items-start">
              <div>
                <span className="text-[10px] font-bold text-gray-400 block font-mono">Ref: {a.id} ({a.country})</span>
                <h3 className="font-extrabold text-sm text-gray-900">{a.entityName}</h3>
                <p className="text-xs text-purple-700 font-bold">{a.entityType}</p>
              </div>

              <span className={`text-[10px] font-black px-2.5 py-1 rounded-full ${
                a.riskScoreLabel === 'Crítico' ? 'bg-red-100 text-red-800' : 'bg-amber-100 text-amber-800'
              }`}>
                RISCO {a.riskScoreLabel.toUpperCase()} ({a.riskScoreNumber}%)
              </span>
            </div>

            <p className="text-xs text-gray-600 bg-gray-50 p-3 rounded-xl border border-gray-100">
              {a.description}
            </p>

            <div className="pt-2 flex items-center justify-between text-xs border-t border-gray-100">
              <span className="text-[10px] text-gray-400">{a.detectedAt}</span>
              <button
                onClick={() => showToast(`Entidade ${a.entityName} bloqueada por precaução de risco.`)}
                className="bg-red-600 text-white font-extrabold text-xs px-3 py-1.5 rounded-xl hover:bg-red-700 transition"
              >
                Bloqueio Imediato
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
