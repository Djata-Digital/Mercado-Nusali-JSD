import React, { useState, useEffect } from 'react';
import {
  Wallet,
  Lock,
  Clock,
  CheckCircle2,
  ArrowUpRight,
  ArrowDownLeft,
  Filter,
  DollarSign,
  ShieldCheck,
  RefreshCw,
  Search,
  Loader2,
} from 'lucide-react';
import { CurrencyCode } from '../../types';
import { SellerService } from '../../services/sellerService';

interface SellerWalletProps {
  showToast: (msg: string) => void;
  selectedCurrency?: CurrencyCode;
}

export const SellerWallet: React.FC<SellerWalletProps> = ({ showToast }) => {
  const [selectedCurrency, setSelectedCurrency] = useState<CurrencyCode>('XOF');
  const [loading, setLoading] = useState(true);
  const [walletData, setWalletData] = useState<any>(null);

  const fetchWallet = async () => {
    try {
      setLoading(true);
      const res = await SellerService.getWallet();
      if (res.success && res.data) {
        setWalletData(res.data);
      }
    } catch (err) {
      console.error('Error fetching wallet:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchWallet();
  }, []);

  const balances = walletData || {
    available: 1250000,
    retained: 450000,
    future: 320000,
    blocked: 0,
    cashbackEarned: 15000,
    refundsProcessed: 0,
    transactions: [],
  };

  const transactions = walletData?.transactions || [
    { id: 'TX-9901', type: 'credit', title: 'Venda Pedido #ORD-9102', date: 'Hoje', amount: 450000, currency: 'XOF', status: 'Liberado' },
    { id: 'TX-9890', type: 'payout', title: 'Saque para Orange Money (+245 955 88 12 00)', date: 'Ontem', amount: 500000, currency: 'XOF', status: 'Concluído' },
    { id: 'TX-9820', type: 'escrow', title: 'Retenção Escrow Pedido #ORD-8812', date: '27/07/2026', amount: 450000, currency: 'XOF', status: 'Retido' },
  ];

  return (
    <div className="space-y-6 animate-fadeIn">
      {/* Header */}
      <div className="bg-white rounded-2xl p-6 border border-gray-200 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-black text-gray-900 flex items-center gap-2">
              <Wallet className="w-6 h-6 text-emerald-600" />
              Carteira Digital Nusali Pay
            </h1>
            {loading && <Loader2 className="w-4 h-4 text-emerald-600 animate-spin" />}
          </div>
          <p className="text-xs text-gray-500 mt-1">
            Gestão unificada de saldos multimoeda, depósitos com garantia de custódia e movimentações financeiras.
          </p>
        </div>

        {/* Currency Selector & Refresh */}
        <div className="flex items-center gap-2">
          <button
            onClick={fetchWallet}
            disabled={loading}
            className="p-2 text-gray-500 hover:text-emerald-600 bg-gray-100 rounded-xl transition"
            title="Atualizar saldo"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
          <div className="flex items-center gap-2 bg-gray-50 p-2 rounded-xl border border-gray-200">
            <span className="text-xs font-bold text-gray-600">Moeda:</span>
            {(['XOF', 'BRL', 'EUR', 'AOA', 'USD'] as CurrencyCode[]).map(curr => (
              <button
                key={curr}
                onClick={() => setSelectedCurrency(curr)}
                className={`px-3 py-1 rounded-lg text-xs font-bold transition ${
                  selectedCurrency === curr
                    ? 'bg-emerald-600 text-white shadow-xs'
                    : 'bg-white text-gray-700 hover:bg-gray-100'
                }`}
              >
                {curr}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Balances Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-gradient-to-br from-emerald-900 to-teal-950 text-white p-5 rounded-2xl shadow-md space-y-2">
          <div className="flex items-center justify-between text-emerald-300 text-xs font-extrabold uppercase">
            <span>Saldo Disponível</span>
            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
          </div>
          <p className="text-2xl font-black">
            {selectedCurrency} {balances.available.toLocaleString()}
          </p>
          <p className="text-[10px] text-emerald-200">Pronto para saque imediato via Orange/PIX</p>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-gray-200 shadow-xs space-y-2">
          <div className="flex items-center justify-between text-amber-700 text-xs font-extrabold uppercase">
            <span>Saldo Retido (Escrow)</span>
            <Lock className="w-4 h-4 text-amber-600" />
          </div>
          <p className="text-2xl font-black text-amber-900">
            {selectedCurrency} {balances.retained.toLocaleString()}
          </p>
          <p className="text-[10px] text-gray-500">Aguardando confirmação de entrega do comprador</p>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-gray-200 shadow-xs space-y-2">
          <div className="flex items-center justify-between text-blue-700 text-xs font-extrabold uppercase">
            <span>Saldo Futuro</span>
            <Clock className="w-4 h-4 text-blue-600" />
          </div>
          <p className="text-2xl font-black text-blue-900">
            {selectedCurrency} {balances.future.toLocaleString()}
          </p>
          <p className="text-[10px] text-gray-500">Liberação nos próximos 7 dias</p>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-gray-200 shadow-xs space-y-2">
          <div className="flex items-center justify-between text-gray-500 text-xs font-extrabold uppercase">
            <span>Cashback & Benefícios</span>
            <ShieldCheck className="w-4 h-4 text-emerald-600" />
          </div>
          <p className="text-xl font-black text-gray-900">
            +{selectedCurrency} {balances.cashbackEarned.toLocaleString()}
          </p>
          <p className="text-[10px] text-gray-500">Acumulado no programa de recompensas</p>
        </div>
      </div>

      {/* Transactions Table */}
      <div className="bg-white rounded-2xl border border-gray-200 shadow-xs p-6 space-y-4">
        <h3 className="text-sm font-black text-gray-900 uppercase tracking-wider">
          Histórico de Movimentações da Carteira ({transactions.length})
        </h3>

        <div className="divide-y divide-gray-100">
          {transactions.map((tx: any) => (
            <div key={tx.id} className="py-3.5 flex items-center justify-between text-xs font-medium">
              <div className="flex items-center gap-3">
                <div className={`w-9 h-9 rounded-xl flex items-center justify-center font-bold ${
                  tx.type === 'credit' ? 'bg-emerald-100 text-emerald-700' :
                  tx.type === 'payout' ? 'bg-blue-100 text-blue-700' :
                  tx.type === 'escrow' ? 'bg-amber-100 text-amber-700' :
                  'bg-red-100 text-red-700'
                }`}>
                  {tx.type === 'credit' ? <ArrowDownLeft className="w-5 h-5" /> : <ArrowUpRight className="w-5 h-5" />}
                </div>

                <div>
                  <p className="font-bold text-gray-900">{tx.title}</p>
                  <p className="text-[10px] text-gray-400">{tx.id} • {tx.date}</p>
                </div>
              </div>

              <div className="text-right">
                <p className={`font-black ${tx.type === 'credit' ? 'text-emerald-700' : 'text-gray-900'}`}>
                  {tx.type === 'credit' ? '+' : '-'} {tx.currency || selectedCurrency} {tx.amount.toLocaleString()}
                </p>
                <span className="text-[10px] font-extrabold text-gray-500 bg-gray-100 px-2 py-0.5 rounded">
                  {tx.status}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
