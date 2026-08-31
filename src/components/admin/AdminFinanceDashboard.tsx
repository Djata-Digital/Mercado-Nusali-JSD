import React, { useState, useEffect } from 'react';
import { DollarSign, TrendingUp, Loader2, RefreshCw, Receipt } from 'lucide-react';
import { AdminService } from '../../services/adminService';

interface AdminFinanceDashboardProps {
  showToast: (msg: string) => void;
}

interface CurrencyMetrics {
  gmvPaid: number;
  escrowHeld: number;
  escrowReleased: number;
  sellersBalanceAggregate: number;
  payoutsPending: number;
  payoutsCompleted: number;
}

function formatAmount(n: number): string {
  return (n || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// Correção crítica (Fase 1 Operacional — item 7: "financeiro Admin vazio"):
// o backend já calculava byCurrency corretamente (orders/escrow/wallets
// reais, shadow ledger nunca ligado), mas o dashboard só exibia UM
// "currency primário" escolhido arbitrariamente (XOF se existir, senão a
// primeira moeda encontrada) sob o rótulo hardcoded "XOF" — se as vendas
// reais estavam em BRL (como é o caso), o card mostrava 0 ou o valor
// errado com a moeda errada. Corrigido para mostrar TODAS as moedas com
// movimento real, cada uma com seu próprio rótulo — nunca somando/ocultando.
export const AdminFinanceDashboard: React.FC<AdminFinanceDashboardProps> = ({ showToast }) => {
  const [byCurrency, setByCurrency] = useState<Record<string, CurrencyMetrics>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [transactions, setTransactions] = useState<any[]>([]);
  const [isLoadingTransactions, setIsLoadingTransactions] = useState(true);

  const fetchOverview = async () => {
    setIsLoading(true);
    try {
      const res = await AdminService.getFinanceOverview();
      if (res.success && res.data?.byCurrency) {
        setByCurrency(res.data.byCurrency);
      }
    } catch (err) {
      console.error('Error fetching admin finance overview:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const fetchTransactions = async () => {
    setIsLoadingTransactions(true);
    try {
      const res = await AdminService.getFinanceTransactions({ limit: 100 });
      if (res.success && Array.isArray(res.data)) {
        setTransactions(res.data);
      }
    } catch (err) {
      console.error('Error fetching admin finance transactions:', err);
    } finally {
      setIsLoadingTransactions(false);
    }
  };

  const fetchAll = () => {
    fetchOverview();
    fetchTransactions();
  };

  useEffect(() => {
    fetchAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const currencies = Object.keys(byCurrency);

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-2xl p-6 border border-gray-200 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-gray-900 flex items-center gap-2">
            <DollarSign className="w-6 h-6 text-purple-600" />
            Dashboard Financeiro Real & Consolidação CPLP
          </h1>
          <p className="text-xs text-gray-500 mt-1">
            Receita real de vendas pagas, garantia retida em Escrow, saldo em carteira de vendedores e repasses — por moeda, nunca somadas.
          </p>
        </div>

        <button
          onClick={fetchAll}
          className="flex items-center gap-2 text-xs font-bold text-gray-600 bg-gray-100 hover:bg-gray-200 px-3 py-2 rounded-xl transition self-start md:self-auto"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${isLoading || isLoadingTransactions ? 'animate-spin' : ''}`} />
          Atualizar Métricas
        </button>
      </div>

      {isLoading ? (
        <div className="p-12 text-center text-gray-400 bg-white rounded-2xl border border-gray-200">
          <Loader2 className="w-8 h-8 animate-spin mx-auto text-purple-600 mb-2" />
          <p className="text-xs font-bold">Consolidando métricas financeiras do banco...</p>
        </div>
      ) : currencies.length === 0 ? (
        <div className="p-12 text-center text-gray-400 bg-white rounded-2xl border border-gray-200">
          <p className="text-xs font-bold">Nenhuma movimentação financeira real encontrada ainda (nenhum pedido pago, escrow ou carteira com saldo).</p>
        </div>
      ) : (
        <div className="space-y-6">
          {currencies.map((cur) => {
            const m = byCurrency[cur];
            return (
              <div key={cur} className="space-y-3">
                <h2 className="text-sm font-black text-gray-700 uppercase tracking-wide flex items-center gap-2">
                  <span className="bg-gray-900 text-white px-2.5 py-1 rounded-lg text-xs">{cur}</span>
                  Movimentação Real em {cur}
                </h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  <div className="bg-white rounded-2xl border border-gray-200 shadow-xs p-5">
                    <span className="text-[10px] font-bold text-gray-400 uppercase block">GMV Pago (Total Vendas Confirmadas)</span>
                    <p className="text-2xl font-black text-gray-900 mt-1">{cur} {formatAmount(m.gmvPaid)}</p>
                    <span className="text-xs font-bold text-emerald-700 flex items-center gap-1 mt-1">
                      <TrendingUp className="w-3.5 h-3.5 text-emerald-600" /> Pedidos pagos
                    </span>
                  </div>

                  <div className="bg-white rounded-2xl border border-gray-200 shadow-xs p-5">
                    <span className="text-[10px] font-bold text-gray-400 uppercase block">Saldo Retido em Custódia (Escrow Held)</span>
                    <p className="text-2xl font-black text-amber-600 mt-1">{cur} {formatAmount(m.escrowHeld)}</p>
                    <span className="text-[10px] text-gray-500 block mt-1">Aguardando confirmação de entrega</span>
                  </div>

                  <div className="bg-white rounded-2xl border border-gray-200 shadow-xs p-5">
                    <span className="text-[10px] font-bold text-gray-400 uppercase block">Garantia Liberada (Escrow Released)</span>
                    <p className="text-2xl font-black text-purple-700 mt-1">{cur} {formatAmount(m.escrowReleased)}</p>
                    <span className="text-[10px] text-gray-500 block mt-1">Já liberado aos vendedores</span>
                  </div>

                  <div className="bg-white rounded-2xl border border-gray-200 shadow-xs p-5">
                    <span className="text-[10px] font-bold text-gray-400 uppercase block">Saldo Agregado em Carteiras (Available)</span>
                    <p className="text-2xl font-black text-emerald-700 mt-1">{cur} {formatAmount(m.sellersBalanceAggregate)}</p>
                    <span className="text-[10px] text-gray-500 block mt-1">Saldo disponível para saque dos sellers</span>
                  </div>

                  <div className="bg-white rounded-2xl border border-gray-200 shadow-xs p-5">
                    <span className="text-[10px] font-bold text-gray-400 uppercase block">Saques Pendentes de Repasse</span>
                    <p className="text-2xl font-black text-blue-700 mt-1">{cur} {formatAmount(m.payoutsPending)}</p>
                    <span className="text-[10px] text-gray-500 block mt-1">Aguardando processamento financeiro</span>
                  </div>

                  <div className="bg-white rounded-2xl border border-gray-200 shadow-xs p-5">
                    <span className="text-[10px] font-bold text-gray-400 uppercase block">Total de Repasses Efetuados (Payouts)</span>
                    <p className="text-2xl font-black text-emerald-800 mt-1">{cur} {formatAmount(m.payoutsCompleted)}</p>
                    <span className="text-[10px] text-gray-500 block mt-1">Saques concluídos com sucesso</span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Extrato de operações financeiras reais (Fase 1 Operacional — item 7):
          fonte = orders + payments (paymentStatus='paid'), nunca
          ledger_transactions (shadow ledger continua desligado) — cada linha
          é um pedido pago real, nunca um lançamento contábil inventado. */}
      <div className="bg-white rounded-2xl border border-gray-200 shadow-xs p-6 space-y-4">
        <h2 className="text-sm font-black text-gray-900 uppercase tracking-wide flex items-center gap-2">
          <Receipt className="w-4 h-4 text-purple-600" /> Extrato de Vendas Pagas (Registros Financeiros Reais)
        </h2>
        {isLoadingTransactions ? (
          <div className="p-8 text-center text-gray-400">
            <Loader2 className="w-6 h-6 animate-spin mx-auto mb-2" />
            Carregando extrato...
          </div>
        ) : transactions.length === 0 ? (
          <div className="p-8 text-center text-gray-400 text-xs font-bold">
            Nenhum pedido pago encontrado.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-gray-50 text-gray-500 uppercase text-[10px] font-bold border-b border-gray-200">
                <tr>
                  <th className="p-2.5">Pedido</th>
                  <th className="p-2.5">Vendedor</th>
                  <th className="p-2.5">Comprador</th>
                  <th className="p-2.5 text-right">Valor Bruto</th>
                  <th className="p-2.5 text-right">Comissão</th>
                  <th className="p-2.5 text-right">Repasse Vendedor</th>
                  <th className="p-2.5 text-right">Subsídio Nusali (Frete)</th>
                  <th className="p-2.5">Escrow</th>
                  <th className="p-2.5">Pagamento</th>
                  <th className="p-2.5">Data</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 font-medium">
                {transactions.map((t) => (
                  <tr key={t.orderId} className="hover:bg-gray-50/50">
                    <td className="p-2.5 font-mono text-[11px] font-bold text-gray-900">{t.orderNumber}</td>
                    <td className="p-2.5 text-gray-800">{t.sellerName}</td>
                    <td className="p-2.5 text-gray-500 font-mono text-[10px]">{t.buyerId}</td>
                    <td className="p-2.5 text-right font-bold text-gray-900">{t.currency} {formatAmount(t.grossAmount)}</td>
                    <td className="p-2.5 text-right text-red-600">
                      {t.marketplaceCommission !== null
                        ? `${t.currency} ${formatAmount(t.marketplaceCommission)}${t.commissionRateSnapshot !== null ? ` (${t.commissionRateSnapshot}%)` : ''}`
                        : '—'}
                    </td>
                    <td className="p-2.5 text-right text-emerald-700 font-bold">
                      {t.sellerNetAmount !== null ? `${t.currency} ${formatAmount(t.sellerNetAmount)}` : '⚠ ausente'}
                    </td>
                    <td className="p-2.5 text-right text-blue-700">
                      {t.shippingMarketplaceSubsidy ? `${t.currency} ${formatAmount(t.shippingMarketplaceSubsidy)}` : '—'}
                    </td>
                    <td className="p-2.5">
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-black ${
                        t.escrowStatus === 'held' ? 'bg-blue-100 text-blue-800' :
                        t.escrowStatus === 'released' ? 'bg-emerald-100 text-emerald-800' :
                        t.escrowStatus === 'disputed' ? 'bg-red-100 text-red-800' : 'bg-gray-100 text-gray-700'
                      }`}>
                        {t.escrowStatus}
                      </span>
                    </td>
                    <td className="p-2.5 text-gray-600">{t.paymentMethod || '—'}</td>
                    <td className="p-2.5 text-gray-500 font-mono text-[10px]">
                      {t.createdAt ? new Date(t.createdAt).toLocaleDateString('pt-BR') : '—'}
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
