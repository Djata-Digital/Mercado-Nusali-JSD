import React, { useState, useEffect } from 'react';
import { History, Shield, CheckCircle2, Search, Loader2 } from 'lucide-react';
import { AdminService } from '../../services/adminService';
import { AuditLogRecord } from '../../data/mockAdminAudit';

interface AdminAuditLogsProps {
  showToast: (msg: string) => void;
}

export const AdminAuditLogs: React.FC<AdminAuditLogsProps> = ({ showToast }) => {
  const [logs, setLogs] = useState<AuditLogRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const fetchLogs = async () => {
    setIsLoading(true);
    try {
      const res = await AdminService.getAuditLogs();
      if (res.success && res.data) {
        setLogs(res.data);
      }
    } catch {
      // fallback
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchLogs();
  }, []);

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-2xl p-6 border border-gray-200 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-gray-900 flex items-center gap-2">
            <History className="w-6 h-6 text-purple-600" />
            Logs de Auditoria & Ações Administrativas
          </h1>
          <p className="text-xs text-gray-500 mt-1">
            Registro imutável de todas as alterações feitas por administradores, representantes e supervisores.
          </p>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-gray-200 shadow-xs p-6 space-y-4">
        {isLoading ? (
          <div className="p-8 text-center text-gray-400">
            <Loader2 className="w-6 h-6 animate-spin mx-auto text-purple-600 mb-2" />
            Carregando registros de auditoria...
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200 text-gray-500 uppercase font-black text-[10px]">
                  <th className="p-3">Data / Hora</th>
                  <th className="p-3">Usuário Interno</th>
                  <th className="p-3">Ação Executada</th>
                  <th className="p-3">Entidade Afetada</th>
                  <th className="p-3">Antes ➔ Depois</th>
                  <th className="p-3">IP / Origem</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {logs.map(l => (
                  <tr key={l.id} className="hover:bg-gray-50/50">
                    <td className="p-3 font-mono text-[11px] text-gray-500">{l.timestamp}</td>
                    <td className="p-3 font-bold text-gray-900">
                      {l.userName}
                      <span className="block text-[10px] text-purple-700 font-normal">{l.userRole}</span>
                    </td>
                    <td className="p-3 font-bold text-gray-800">{l.action}</td>
                    <td className="p-3 text-gray-700">{l.entity}</td>
                    <td className="p-3 font-mono text-[11px] text-gray-600">
                      {l.previousValue} ➔ <strong className="text-emerald-700">{l.newValue}</strong>
                    </td>
                    <td className="p-3 font-mono text-[11px] text-gray-500">
                      {l.ipAddress} ({l.country})
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
