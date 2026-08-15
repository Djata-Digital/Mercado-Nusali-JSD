import React, { useState } from 'react';
import {
  DollarSign,
  Wallet,
  Lock,
  ArrowUpRight,
  FileText,
  CreditCard,
  Building2,
  CheckCircle2,
  Clock,
  Download,
  X,
  ShieldCheck,
  Smartphone,
} from 'lucide-react';
import { CurrencyCode } from '../../types';
import { formatCurrency } from '../../utils/currencyUtils';

interface SellerFinancialManagerProps {
  selectedCurrency: CurrencyCode;
  showToast: (msg: string) => void;
}

export const SellerFinancialManager: React.FC<SellerFinancialManagerProps> = ({
  selectedCurrency,
  showToast,
}) => {
  const [isPayoutModalOpen, setIsPayoutModalOpen] = useState(false);
  const [payoutMethod, setPayoutMethod] = useState<'orange' | 'mtn' | 'bank' | 'pix'>('orange');
  const [payoutAmount, setPayoutAmount] = useState('100000');

  const availableBalance = 6850000;
  const escrowBalance = 4200000;
  const pendingRelease = 3800000;

  const ledgerTransactions = [
    { id: 'tx-801', date: 'Hoje 10:15', desc: 'Venda Pedido NSL-8941203 (Escrow Retido)', amount: '+ 180.500 XOF', type: 'escrow_hold' },
    { id: 'tx-800', date: 'Ontem 18:00', desc: 'Liberação Escrow Pedido NSL-771204', amount: '+ 240.000 XOF', type: 'credit' },
    { id: 'tx-799', date: '29/07 15:30', desc: 'Saque Efetuado via Orange Money (+245 955123456)', amount: '- 500.000 XOF', type: 'debit' },
    { id: 'tx-798', date: '28/07 11:00', desc: 'Comissão Mercado Nusali (5%)', amount: '- 12.000 XOF', type: 'fee' },
  ];

  const handleRequestPayout = (e: React.FormEvent) => {
    e.preventDefault();
    const amountNum = parseFloat(payoutAmount);
    if (!amountNum || amountNum <= 0) return;

    showToast(`Solicitação de saque de ${formatCurrency(amountNum, selectedCurrency)} enviada! Processando em até 15 minutos via ${payoutMethod.toUpperCase()}`);
    setIsPayoutModalOpen(false);
  };

  return (
    <div className="space-y-8 animate-fadeIn">
      {/* Top Banner Header */}
      <div className="bg-white rounded-2xl border border-gray-200 p-6 shadow-2xs flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-black text-gray-900 flex items-center gap-2">
            <DollarSign className="w-6 h-6 text-emerald-700" /> Financeiro, Escrow & Carteira
          </h1>
          <p className="text-xs text-gray-500 mt-1">
            Acompanhe o saldo disponível, valores sob custódia de proteção Escrow e solicite saques instantâneos.
          </p>
        </div>

        <button
          onClick={() => setIsPayoutModalOpen(true)}
          className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold px-5 py-2.5 rounded-xl text-xs transition flex items-center gap-2 shadow-xs shrink-0"
        >
          <ArrowUpRight className="w-4 h-4" /> Solicitar Saque Instantâneo
        </button>
      </div>

      {/* Financial Overview Balance Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-gradient-to-br from-emerald-900 to-teal-950 text-white p-6 rounded-2xl shadow-md space-y-2">
          <span className="text-xs font-bold text-emerald-200 uppercase block">Saldo Disponível para Saque</span>
          <h2 className="text-3xl font-black">{formatCurrency(availableBalance, selectedCurrency)}</h2>
          <span className="text-[11px] text-emerald-300 font-semibold block">
            Sem taxas de saque para Orange Money e MTN Mobile Money.
          </span>
        </div>

        <div className="bg-white p-6 rounded-2xl border border-gray-200 shadow-2xs space-y-2">
          <span className="text-xs font-bold text-gray-400 uppercase block flex items-center gap-1">
            <Lock className="w-3.5 h-3.5 text-blue-600" /> Saldo Retido em Custódia (Escrow)
          </span>
          <h2 className="text-3xl font-black text-blue-900">{formatCurrency(escrowBalance, selectedCurrency)}</h2>
          <span className="text-[11px] text-gray-500 font-semibold block">
            Proteção Nusali de compra segura contra fraudes.
          </span>
        </div>

        <div className="bg-white p-6 rounded-2xl border border-gray-200 shadow-2xs space-y-2">
          <span className="text-xs font-bold text-gray-400 uppercase block flex items-center gap-1">
            <Clock className="w-3.5 h-3.5 text-amber-600" /> A Liberação Próxima (24h - 48h)
          </span>
          <h2 className="text-3xl font-black text-amber-700">{formatCurrency(pendingRelease, selectedCurrency)}</h2>
          <span className="text-[11px] text-gray-500 font-semibold block">
            Aguardando confirmação de entrega da transportadora.
          </span>
        </div>
      </div>

      {/* Detailed Financial Ledger */}
      <div className="bg-white rounded-2xl border border-gray-200 p-6 shadow-2xs space-y-4">
        <div className="flex items-center justify-between border-b border-gray-100 pb-3">
          <h2 className="text-sm font-bold text-gray-900 flex items-center gap-2">
            <FileText className="w-4 h-4 text-emerald-700" /> Extrato Detalhado de Lançamentos
          </h2>
          <button
            onClick={() => showToast('Extrato financeiro exportado em PDF/Excel.')}
            className="text-xs font-bold text-emerald-700 hover:underline flex items-center gap-1"
          >
            <Download className="w-3.5 h-3.5" /> Exportar Extrato (PDF)
          </button>
        </div>

        <div className="divide-y divide-gray-100 text-xs">
          {ledgerTransactions.map((tx) => (
            <div key={tx.id} className="py-3 flex items-center justify-between gap-4">
              <div>
                <span className="font-bold text-gray-900 block">{tx.desc}</span>
                <span className="text-[10px] text-gray-400 font-mono">{tx.date} • ID: {tx.id}</span>
              </div>

              <span
                className={`font-black ${
                  tx.type === 'debit' || tx.type === 'fee' ? 'text-red-600' : 'text-emerald-700'
                }`}
              >
                {tx.amount}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Payout / Saque Modal */}
      {isPayoutModalOpen && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4 backdrop-blur-xs">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 space-y-6 shadow-2xl text-xs">
            <div className="flex items-center justify-between border-b border-gray-100 pb-3">
              <h3 className="font-bold text-base text-gray-900 flex items-center gap-2">
                <ArrowUpRight className="w-5 h-5 text-emerald-700" /> Solicitar Saque do Saldo
              </h3>
              <button onClick={() => setIsPayoutModalOpen(false)} className="p-1 text-gray-400 hover:text-gray-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleRequestPayout} className="space-y-4">
              <div>
                <label className="block text-gray-700 font-bold mb-1">Selecione o Meio de Recebimento *</label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setPayoutMethod('orange')}
                    className={`p-3 rounded-xl border text-left font-bold transition flex items-center gap-2 ${
                      payoutMethod === 'orange'
                        ? 'border-emerald-600 bg-emerald-50 text-emerald-900'
                        : 'border-gray-200 text-gray-700'
                    }`}
                  >
                    <Smartphone className="w-4 h-4 text-orange-600" /> Orange Money
                  </button>
                  <button
                    type="button"
                    onClick={() => setPayoutMethod('mtn')}
                    className={`p-3 rounded-xl border text-left font-bold transition flex items-center gap-2 ${
                      payoutMethod === 'mtn'
                        ? 'border-emerald-600 bg-emerald-50 text-emerald-900'
                        : 'border-gray-200 text-gray-700'
                    }`}
                  >
                    <Smartphone className="w-4 h-4 text-yellow-600" /> MTN Money
                  </button>
                  <button
                    type="button"
                    onClick={() => setPayoutMethod('bank')}
                    className={`p-3 rounded-xl border text-left font-bold transition flex items-center gap-2 ${
                      payoutMethod === 'bank'
                        ? 'border-emerald-600 bg-emerald-50 text-emerald-900'
                        : 'border-gray-200 text-gray-700'
                    }`}
                  >
                    <Building2 className="w-4 h-4 text-blue-600" /> Transferência BAO
                  </button>
                  <button
                    type="button"
                    onClick={() => setPayoutMethod('pix')}
                    className={`p-3 rounded-xl border text-left font-bold transition flex items-center gap-2 ${
                      payoutMethod === 'pix'
                        ? 'border-emerald-600 bg-emerald-50 text-emerald-900'
                        : 'border-gray-200 text-gray-700'
                    }`}
                  >
                    <CreditCard className="w-4 h-4 text-teal-600" /> PIX Brasil
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-gray-700 font-bold mb-1">Valor do Saque (XOF/EUR) *</label>
                <input
                  type="number"
                  value={payoutAmount}
                  onChange={(e) => setPayoutAmount(e.target.value)}
                  className="w-full p-2.5 border border-gray-300 rounded-xl font-bold text-sm"
                  required
                />
                <span className="text-[10px] text-gray-400 mt-1 block">
                  Disponível: {formatCurrency(availableBalance, selectedCurrency)}
                </span>
              </div>

              <div className="pt-4 border-t border-gray-100 flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setIsPayoutModalOpen(false)}
                  className="px-4 py-2 border border-gray-300 rounded-xl font-bold text-gray-700 hover:bg-gray-50"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl flex items-center gap-2 shadow-xs"
                >
                  <ArrowUpRight className="w-4 h-4" /> Confirmar Saque
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
