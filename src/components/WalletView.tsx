import React, { useState, useEffect } from 'react';
import {
  Wallet,
  ArrowUpRight,
  ArrowDownLeft,
  RefreshCw,
  CreditCard,
  PlusCircle,
  ShieldCheck,
  History,
  DollarSign,
  Smartphone,
  Globe,
  Sparkles,
  Download,
  CheckCircle2,
} from 'lucide-react';
import { usePreferences } from '../context/PreferencesContext';
import { BuyerNavHeader } from './BuyerNavHeader';
import { formatCurrency, countriesConfig } from '../utils/currencyUtils';
import { BuyerService, BuyerWalletTransaction } from '../services/buyerService';

export const WalletView: React.FC = () => {
  const { selectedCurrency, selectedCountry, showToast } = usePreferences();

  const [activeTab, setActiveTab] = useState<'all' | 'deposits' | 'purchases' | 'cashback'>('all');
  const [balance, setBalance] = useState(45000);
  const [cashbackBalance, setCashbackBalance] = useState(3200);
  const [pendingEscrowBalance, setPendingEscrowBalance] = useState(19000);
  const [transactions, setTransactions] = useState<BuyerWalletTransaction[]>([]);
  const [savedCards, setSavedCards] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const [isDepositModalOpen, setIsDepositModalOpen] = useState(false);
  const [isTransferModalOpen, setIsTransferModalOpen] = useState(false);
  const [depositAmount, setDepositAmount] = useState('10000');
  const [depositMethod, setDepositMethod] = useState<'orange_money' | 'mtn' | 'pix' | 'mb_way' | 'card'>('orange_money');
  const [transferRecipient, setTransferRecipient] = useState('');
  const [transferAmount, setTransferAmount] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);

  const loadWalletData = async () => {
    setIsLoading(true);
    try {
      const res = await BuyerService.getWallet();
      if (res.success && res.data) {
        setBalance(res.data.balance || 0);
        setCashbackBalance(res.data.cashbackBalance || 0);
        setPendingEscrowBalance(res.data.pendingEscrowBalance || 0);
        setTransactions(res.data.transactions || []);
        setSavedCards(res.data.savedCards || []);
      }
    } catch (err) {
      console.error('Failed to load wallet:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadWalletData();
  }, []);

  const handleExecuteDeposit = async (e: React.FormEvent) => {
    e.preventDefault();
    const val = parseFloat(depositAmount);
    if (!val || val <= 0) return;

    setIsProcessing(true);
    try {
      const res = await BuyerService.depositWallet(val, depositMethod, selectedCurrency);
      if (res.success && res.data) {
        setBalance(res.data.balance);
        if (res.data.transaction) {
          setTransactions(prev => [res.data.transaction, ...prev]);
        }
        setIsDepositModalOpen(false);
        showToast(`Depósito de ${formatCurrency(val, selectedCurrency)} creditado com sucesso!`);
      } else {
        showToast(res.message || 'Erro ao processar depósito.');
      }
    } catch {
      showToast('Falha de conexão com o servidor.');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleExecuteTransfer = async (e: React.FormEvent) => {
    e.preventDefault();
    const val = parseFloat(transferAmount);
    if (!val || val <= 0 || !transferRecipient.trim()) return;

    setIsProcessing(true);
    try {
      const res = await BuyerService.transferWallet(transferRecipient.trim(), val);
      if (res.success && res.data) {
        setBalance(res.data.balance);
        if (res.data.transaction) {
          setTransactions(prev => [res.data.transaction, ...prev]);
        }
        setIsTransferModalOpen(false);
        setTransferRecipient('');
        setTransferAmount('');
        showToast(`Transferência de ${formatCurrency(val, selectedCurrency)} realizada com sucesso!`);
      } else {
        showToast(res.message || 'Erro ao processar transferência.');
      }
    } catch {
      showToast('Falha ao comunicar com o servidor.');
    } finally {
      setIsProcessing(false);
    }
  };

  const filteredTransactions = transactions.filter(t => {
    if (activeTab === 'deposits') return t.type === 'deposit';
    if (activeTab === 'purchases') return t.type === 'purchase';
    if (activeTab === 'cashback') return t.type === 'cashback';
    return true;
  });

  const currentCountry = countriesConfig[selectedCountry] || countriesConfig.GW;

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 animate-fadeIn">
      <BuyerNavHeader />

      {/* Main Wallet Hero Banner */}
      <div className="bg-gradient-to-r from-blue-950 via-emerald-900 to-teal-900 text-white rounded-2xl p-6 sm:p-8 shadow-xl mb-8">
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
          <div>
            <div className="inline-flex items-center gap-2 bg-yellow-400 text-blue-950 px-3 py-1 rounded-full text-xs font-black uppercase mb-3">
              <Wallet className="w-3.5 h-3.5" /> Nusali Pay - Carteira Internacional
            </div>
            <h1 className="text-2xl sm:text-3xl font-black">Minha Carteira Digital</h1>
            <p className="text-xs text-gray-200 mt-1 max-w-xl">
              Gerencie seus saldos, recarregue via Orange Money ou PIX, pague com 1 clique e receba cashback em todas as compras.
            </p>
          </div>

          <div className="flex flex-wrap gap-3">
            <button
              onClick={() => setIsDepositModalOpen(true)}
              className="bg-yellow-400 hover:bg-yellow-500 text-blue-950 font-black px-5 py-3 rounded-xl text-xs transition shadow-lg flex items-center gap-2 cursor-pointer"
            >
              <PlusCircle className="w-4 h-4" /> Adicionar Saldo
            </button>
            <button
              onClick={() => setIsTransferModalOpen(true)}
              className="bg-white/10 hover:bg-white/20 text-white border border-white/30 font-bold px-5 py-3 rounded-xl text-xs transition backdrop-blur-xs flex items-center gap-2 cursor-pointer"
            >
              <ArrowUpRight className="w-4 h-4 text-yellow-300" /> Transferir Saldo
            </button>
          </div>
        </div>

        {/* Balance Cards Sub-grid */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-8 pt-6 border-t border-white/15">
          <div className="bg-white/10 backdrop-blur-md rounded-xl p-4 border border-white/20">
            <span className="text-xs font-bold text-gray-300 flex items-center gap-1.5 mb-1">
              <Wallet className="w-4 h-4 text-yellow-400" /> Saldo Disponível
            </span>
            <span className="text-2xl sm:text-3xl font-black text-white">
              {formatCurrency(balance, selectedCurrency)}
            </span>
            <span className="block text-[10px] text-emerald-300 font-semibold mt-1">
              Pronto para compras com Proteção Escrow
            </span>
          </div>

          <div className="bg-white/10 backdrop-blur-md rounded-xl p-4 border border-white/20">
            <span className="text-xs font-bold text-gray-300 flex items-center gap-1.5 mb-1">
              <Sparkles className="w-4 h-4 text-emerald-400" /> Cashback Acumulado (Nusali+)
            </span>
            <span className="text-2xl sm:text-3xl font-black text-yellow-300">
              {formatCurrency(cashbackBalance, selectedCurrency)}
            </span>
            <span className="block text-[10px] text-gray-300 mt-1">
              Pode ser usado diretamente como desconto no checkout
            </span>
          </div>

          <div className="bg-white/10 backdrop-blur-md rounded-xl p-4 border border-white/20">
            <span className="text-xs font-bold text-gray-300 flex items-center gap-1.5 mb-1">
              <ShieldCheck className="w-4 h-4 text-cyan-400" /> Em Custódia Escrow
            </span>
            <span className="text-2xl sm:text-3xl font-black text-cyan-200">
              {formatCurrency(pendingEscrowBalance, selectedCurrency)}
            </span>
            <span className="block text-[10px] text-gray-300 mt-1">
              Protegido até confirmação de entrega do pacote
            </span>
          </div>
        </div>
      </div>

      {/* Main Content: Transactions and Cards */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Transactions List */}
        <div className="lg:col-span-2 bg-white rounded-2xl border border-gray-200 p-6 shadow-2xs">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
            <h2 className="text-lg font-black text-gray-900 flex items-center gap-2">
              <History className="w-5 h-5 text-emerald-600" /> Extrato & Movimentações
            </h2>

            {/* Filter Tabs */}
            <div className="flex items-center gap-1 bg-gray-100 p-1 rounded-xl text-xs font-bold">
              <button
                onClick={() => setActiveTab('all')}
                className={`px-3 py-1.5 rounded-lg transition cursor-pointer ${
                  activeTab === 'all' ? 'bg-white text-gray-900 shadow-2xs' : 'text-gray-500 hover:text-gray-900'
                }`}
              >
                Todos
              </button>
              <button
                onClick={() => setActiveTab('deposits')}
                className={`px-3 py-1.5 rounded-lg transition cursor-pointer ${
                  activeTab === 'deposits' ? 'bg-white text-gray-900 shadow-2xs' : 'text-gray-500 hover:text-gray-900'
                }`}
              >
                Depósitos
              </button>
              <button
                onClick={() => setActiveTab('purchases')}
                className={`px-3 py-1.5 rounded-lg transition cursor-pointer ${
                  activeTab === 'purchases' ? 'bg-white text-gray-900 shadow-2xs' : 'text-gray-500 hover:text-gray-900'
                }`}
              >
                Compras
              </button>
              <button
                onClick={() => setActiveTab('cashback')}
                className={`px-3 py-1.5 rounded-lg transition cursor-pointer ${
                  activeTab === 'cashback' ? 'bg-white text-gray-900 shadow-2xs' : 'text-gray-500 hover:text-gray-900'
                }`}
              >
                Cashback
              </button>
            </div>
          </div>

          {filteredTransactions.length === 0 ? (
            <div className="text-center py-12 text-gray-400">
              <History className="w-12 h-12 mx-auto mb-2 opacity-40" />
              <p className="text-xs">Nenhuma transação encontrada nesta categoria.</p>
            </div>
          ) : (
            <div className="divide-y divide-gray-100">
              {filteredTransactions.map((tx) => (
                <div key={tx.id} className="py-4 flex items-center justify-between gap-4 hover:bg-gray-50/50 px-2 rounded-xl transition">
                  <div className="flex items-center gap-3">
                    <div className={`p-2.5 rounded-xl ${
                      tx.type === 'deposit' ? 'bg-emerald-100 text-emerald-700' :
                      tx.type === 'cashback' ? 'bg-yellow-100 text-yellow-700' :
                      tx.type === 'transfer' ? 'bg-purple-100 text-purple-700' :
                      'bg-blue-100 text-blue-700'
                    }`}>
                      {tx.type === 'deposit' && <ArrowDownLeft className="w-5 h-5" />}
                      {tx.type === 'purchase' && <ArrowUpRight className="w-5 h-5" />}
                      {tx.type === 'cashback' && <Sparkles className="w-5 h-5" />}
                      {tx.type === 'transfer' && <ArrowUpRight className="w-5 h-5" />}
                    </div>

                    <div>
                      <h4 className="text-xs font-bold text-gray-900">{tx.title}</h4>
                      <div className="flex items-center gap-2 text-[10px] text-gray-400 mt-0.5 font-medium">
                        <span>{tx.date}</span>
                        <span>•</span>
                        <span>{tx.method}</span>
                        <span>•</span>
                        <span className={`font-bold ${
                          tx.status === 'Concluído' || tx.status === 'Acreditado' ? 'text-emerald-600' : 'text-amber-600'
                        }`}>
                          {tx.status}
                        </span>
                      </div>
                    </div>
                  </div>

                  <span className={`text-sm font-black whitespace-nowrap ${
                    tx.amount > 0 ? 'text-emerald-600' : 'text-gray-900'
                  }`}>
                    {tx.amount > 0 ? '+' : ''}{formatCurrency(tx.amount, selectedCurrency)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Right Sidebar: Payment Methods & Escrow Guarantee */}
        <div className="space-y-6">
          {/* Saved Cards */}
          <div className="bg-white rounded-2xl border border-gray-200 p-6 shadow-2xs">
            <h3 className="text-sm font-black text-gray-900 mb-4 flex items-center justify-between">
              <span className="flex items-center gap-2">
                <CreditCard className="w-4 h-4 text-blue-600" /> Cartões Salvos
              </span>
            </h3>

            <div className="space-y-3">
              {savedCards.map((card) => (
                <div key={card.id} className="p-3.5 border border-gray-200 rounded-xl flex items-center justify-between bg-gradient-to-r from-gray-50 to-white">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-7 bg-blue-900 text-white rounded-md flex items-center justify-center font-black text-[10px]">
                      {card.brand.toUpperCase()}
                    </div>
                    <div>
                      <p className="text-xs font-bold text-gray-900">•••• •••• •••• {card.last4}</p>
                      <p className="text-[10px] text-gray-400">Expira em {card.expMonth}/{card.expYear}</p>
                    </div>
                  </div>
                  <span className="text-[10px] bg-emerald-50 text-emerald-700 font-bold px-2 py-0.5 rounded-md border border-emerald-200">
                    Ativo
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Escrow Guarantee Infocard */}
          <div className="bg-gradient-to-br from-emerald-950 to-teal-900 text-white p-6 rounded-2xl shadow-md border border-emerald-800">
            <div className="flex items-center gap-2 text-yellow-300 font-black text-xs uppercase mb-2">
              <ShieldCheck className="w-4 h-4" /> Garantia Nusali Escrow
            </div>
            <h4 className="text-sm font-black mb-1">Seu dinheiro 100% protegido</h4>
            <p className="text-[11px] text-gray-200 leading-relaxed mb-4">
              Quando você realiza um pagamento, o valor permanece sob custódia segura até que você receba o produto em mãos e aprove a qualidade.
            </p>
            <div className="space-y-1.5 text-[11px] text-emerald-200">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-3.5 h-3.5 text-yellow-300" /> 7 dias de garantia para devoluções gratuitas
              </div>
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-3.5 h-3.5 text-yellow-300" /> Reembolso imediato para saldo na carteira
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Deposit Modal */}
      {isDepositModalOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl animate-scaleUp">
            <h3 className="text-lg font-black text-gray-900 mb-2 flex items-center gap-2">
              <PlusCircle className="w-5 h-5 text-emerald-600" /> Recarga Nusali Pay
            </h3>
            <p className="text-xs text-gray-500 mb-6">
              Selecione o valor e o meio de pagamento local desejado para crédito imediato.
            </p>

            <form onSubmit={handleExecuteDeposit} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1">Valor do Depósito</label>
                <div className="relative">
                  <input
                    type="number"
                    value={depositAmount}
                    onChange={e => setDepositAmount(e.target.value)}
                    className="w-full pl-3 pr-16 py-2.5 bg-gray-50 border border-gray-300 rounded-xl text-sm font-bold text-gray-900 focus:outline-hidden focus:ring-2 focus:ring-emerald-500"
                    placeholder="10000"
                    required
                  />
                  <span className="absolute right-3 top-2.5 text-xs font-bold text-gray-400">
                    {selectedCurrency}
                  </span>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-700 mb-2">Método de Recarga Local</label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setDepositMethod('orange_money')}
                    className={`p-3 rounded-xl border text-left flex items-center gap-2.5 transition cursor-pointer ${
                      depositMethod === 'orange_money' ? 'border-orange-500 bg-orange-50/50 ring-2 ring-orange-500' : 'border-gray-200 hover:bg-gray-50'
                    }`}
                  >
                    <Smartphone className="w-4 h-4 text-orange-600" />
                    <div>
                      <p className="text-xs font-black text-gray-900">Orange Money</p>
                      <p className="text-[10px] text-gray-500">Guiné-Bissau & Senegal</p>
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => setDepositMethod('mtn')}
                    className={`p-3 rounded-xl border text-left flex items-center gap-2.5 transition cursor-pointer ${
                      depositMethod === 'mtn' ? 'border-yellow-500 bg-yellow-50/50 ring-2 ring-yellow-500' : 'border-gray-200 hover:bg-gray-50'
                    }`}
                  >
                    <Smartphone className="w-4 h-4 text-yellow-600" />
                    <div>
                      <p className="text-xs font-black text-gray-900">MTN MoMo</p>
                      <p className="text-[10px] text-gray-500">Guiné-Bissau & África</p>
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => setDepositMethod('pix')}
                    className={`p-3 rounded-xl border text-left flex items-center gap-2.5 transition cursor-pointer ${
                      depositMethod === 'pix' ? 'border-teal-500 bg-teal-50/50 ring-2 ring-teal-500' : 'border-gray-200 hover:bg-gray-50'
                    }`}
                  >
                    <Globe className="w-4 h-4 text-teal-600" />
                    <div>
                      <p className="text-xs font-black text-gray-900">PIX Instantâneo</p>
                      <p className="text-[10px] text-gray-500">Brasil / CPLP</p>
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => setDepositMethod('card')}
                    className={`p-3 rounded-xl border text-left flex items-center gap-2.5 transition cursor-pointer ${
                      depositMethod === 'card' ? 'border-blue-500 bg-blue-50/50 ring-2 ring-blue-500' : 'border-gray-200 hover:bg-gray-50'
                    }`}
                  >
                    <CreditCard className="w-4 h-4 text-blue-600" />
                    <div>
                      <p className="text-xs font-black text-gray-900">Cartão Internacional</p>
                      <p className="text-[10px] text-gray-500">Visa / Mastercard</p>
                    </div>
                  </button>
                </div>
              </div>

              <div className="flex gap-3 pt-4 border-t border-gray-100">
                <button
                  type="button"
                  onClick={() => setIsDepositModalOpen(false)}
                  className="flex-1 py-2.5 rounded-xl border border-gray-300 text-xs font-bold text-gray-700 hover:bg-gray-50 transition cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isProcessing}
                  className="flex-1 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-black transition cursor-pointer flex items-center justify-center gap-2"
                >
                  {isProcessing ? <RefreshCw className="w-4 h-4 animate-spin" /> : 'Confirmar Recarga'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Transfer Modal */}
      {isTransferModalOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl animate-scaleUp">
            <h3 className="text-lg font-black text-gray-900 mb-2 flex items-center gap-2">
              <ArrowUpRight className="w-5 h-5 text-blue-600" /> Transferência Nusali Pay
            </h3>
            <p className="text-xs text-gray-500 mb-6">
              Envie saldo instantaneamente para qualquer comprador ou vendedor na comunidade CPLP.
            </p>

            <form onSubmit={handleExecuteTransfer} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1">E-mail ou Telefone do Destinatário</label>
                <input
                  type="text"
                  value={transferRecipient}
                  onChange={e => setTransferRecipient(e.target.value)}
                  placeholder="ex: amilcar@nusali.cplp ou +245 955..."
                  className="w-full px-3 py-2.5 bg-gray-50 border border-gray-300 rounded-xl text-xs font-medium text-gray-900 focus:outline-hidden focus:ring-2 focus:ring-blue-500"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1">Valor a Transferir</label>
                <div className="relative">
                  <input
                    type="number"
                    value={transferAmount}
                    onChange={e => setTransferAmount(e.target.value)}
                    placeholder="5000"
                    className="w-full pl-3 pr-16 py-2.5 bg-gray-50 border border-gray-300 rounded-xl text-sm font-bold text-gray-900 focus:outline-hidden focus:ring-2 focus:ring-blue-500"
                    required
                  />
                  <span className="absolute right-3 top-2.5 text-xs font-bold text-gray-400">
                    {selectedCurrency}
                  </span>
                </div>
                <span className="block text-[10px] text-gray-400 mt-1">
                  Saldo disponível: {formatCurrency(balance, selectedCurrency)}
                </span>
              </div>

              <div className="flex gap-3 pt-4 border-t border-gray-100">
                <button
                  type="button"
                  onClick={() => setIsTransferModalOpen(false)}
                  className="flex-1 py-2.5 rounded-xl border border-gray-300 text-xs font-bold text-gray-700 hover:bg-gray-50 transition cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isProcessing}
                  className="flex-1 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-black transition cursor-pointer flex items-center justify-center gap-2"
                >
                  {isProcessing ? <RefreshCw className="w-4 h-4 animate-spin" /> : 'Realizar Transferência'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
