import React, { useState, useEffect } from 'react';
import { DollarSign, TrendingUp, Wallet, ArrowDownRight, ArrowUpRight, BarChart3, PieChart, ShieldAlert, Loader2, RefreshCw } from 'lucide-react';
import { AdminService } from '../../services/adminService';

interface AdminFinanceDashboardProps {
  showToast: (msg: string) => void;
}

export const AdminFinanceDashboard: React.FC<AdminFinanceDashboardProps> = ({ showToast }) => {
  const [metrics, setMetrics] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);

  const fetchOverview = async () => {
    setIsLoading(true);
    try {
      const res = await AdminService.getFinanceOverview();
      if (res.success && res.data) {
        setMetrics(res.data);
      }
    } catch (err) {
      console.error('Error fetching admin finance overview:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchOverview();
  }, []);

  const gmvPaid = metrics?.gmvPaid || 0;
  const escrowHeld = metrics?.escrowHeld || 0;
  const escrowReleased = metrics?.escrowReleased || 0;
  const sellersBalance = metrics?.sellersBalanceAggregate || 0;
  const payoutsPending = metrics?.payoutsPending || 0;
  const payoutsCompleted = metrics?.payoutsCompleted || 0;

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-2xl p-6 border border-gray-200 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-gray-900 flex items-center gap-2">
            <DollarSign className="w-6 h-6 text-purple-600" />
            Dashboard Financeiro Real & Consolidação CPLP
          </h1>
          <p className="text-xs text-gray-500 mt-1">
            Receita real de vendas pagas, garantia retida em Escrow, saldo em carteira de vendedores e repasses.
          </p>
        </div>

        <button
          onClick={fetchOverview}
          className="flex items-center gap-2 text-xs font-bold text-gray-600 bg-gray-100 hover:bg-gray-200 px-3 py-2 rounded-xl transition self-start md:self-auto"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
          Atualizar Métricas
        </button>
      </div>

      {isLoading ? (
        <div className="p-12 text-center text-gray-400 bg-white rounded-2xl border border-gray-200">
          <Loader2 className="w-8 h-8 animate-spin mx-auto text-purple-600 mb-2" />
          <p className="text-xs font-bold">Consolidando métricas financeiras do banco...</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <div className="bg-white rounded-2xl border border-gray-200 shadow-xs p-5">
            <span className="text-[10px] font-bold text-gray-400 uppercase block">GMV Pago (Total Vendas Confirmadas)</span>
            <p className="text-2xl font-black text-gray-900 mt-1">XOF {gmvPaid.toLocaleString()}</p>
            <span className="text-xs font-bold text-emerald-700 flex items-center gap-1 mt-1">
              <TrendingUp className="w-3.5 h-3.5 text-emerald-600" /> Pedidos pagos
            </span>
          </div>

          <div className="bg-white rounded-2xl border border-gray-200 shadow-xs p-5">
            <span className="text-[10px] font-bold text-gray-400 uppercase block">Saldo Retido em Custódia (Escrow Held)</span>
            <p className="text-2xl font-black text-amber-600 mt-1">XOF {escrowHeld.toLocaleString()}</p>
            <span className="text-[10px] text-gray-500 block mt-1">Aguardando confirmação de entrega</span>
          </div>

          <div className="bg-white rounded-2xl border border-gray-200 shadow-xs p-5">
            <span className="text-[10px] font-bold text-gray-400 uppercase block">Garantia Liberada (Escrow Released)</span>
            <p className="text-2xl font-black text-purple-700 mt-1">XOF {escrowReleased.toLocaleString()}</p>
            <span className="text-[10px] text-gray-500 block mt-1">Já liberado aos vendedores</span>
          </div>

          <div className="bg-white rounded-2xl border border-gray-200 shadow-xs p-5">
            <span className="text-[10px] font-bold text-gray-400 uppercase block">Saldo Agregado em Carteiras (Available)</span>
            <p className="text-2xl font-black text-emerald-700 mt-1">XOF {sellersBalance.toLocaleString()}</p>
            <span className="text-[10px] text-gray-500 block mt-1">Saldo disponível para saque dos sellers</span>
          </div>

          <div className="bg-white rounded-2xl border border-gray-200 shadow-xs p-5">
            <span className="text-[10px] font-bold text-gray-400 uppercase block">Saques Pendentes de Repasse</span>
            <p className="text-2xl font-black text-blue-700 mt-1">XOF {payoutsPending.toLocaleString()}</p>
            <span className="text-[10px] text-gray-500 block mt-1">Aguardando processamento financeiro</span>
          </div>

          <div className="bg-white rounded-2xl border border-gray-200 shadow-xs p-5">
            <span className="text-[10px] font-bold text-gray-400 uppercase block">Total de Repasses Efetuados (Payouts)</span>
            <p className="text-2xl font-black text-emerald-800 mt-1">XOF {payoutsCompleted.toLocaleString()}</p>
            <span className="text-[10px] text-gray-500 block mt-1">Saques concluídos com sucesso</span>
          </div>
        </div>
      )}
    </div>
  );
};
