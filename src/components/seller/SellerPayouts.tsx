import React, { useState, useEffect } from 'react';
import {
  ArrowUpRight,
  Smartphone,
  CreditCard,
  Building2,
  Wallet,
  CheckCircle2,
  DollarSign,
  AlertCircle,
  Clock,
  ShieldCheck,
  RotateCcw,
  Loader2,
  RefreshCw,
} from 'lucide-react';
import { CurrencyCode } from '../../types';
import { SellerService } from '../../services/sellerService';

interface SellerPayoutsProps {
  showToast: (msg: string) => void;
  selectedCurrency?: CurrencyCode;
}

export const SellerPayouts: React.FC<SellerPayoutsProps> = ({ showToast }) => {
  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);
  const [selectedCurrency, setSelectedCurrency] = useState<CurrencyCode>('XOF');
  const [amount, setAmount] = useState<number>(100000);
  const [selectedMethod, setSelectedMethod] = useState<'orange_money' | 'mtn_money' | 'pix' | 'bank' | 'wallet'>('orange_money');
  const [accountDetail, setAccountDetail] = useState('+245 955 88 12 00');
  const [completedTx, setCompletedTx] = useState<any | null>(null);
  const [loading, setLoading] = useState(false);
  const [walletData, setWalletData] = useState<any>(null);

  const fetchWallet = async () => {
    try {
      const res = await SellerService.getWallet();
      if (res.success && res.data) {
        setWalletData(res.data);
      }
    } catch (err) {
      console.error('Error fetching wallet:', err);
    }
  };

  useEffect(() => {
    fetchWallet();
  }, []);

  const availableBalance = walletData?.available || 1250000;

  const paymentMethods = [
    { id: 'orange_money', name: 'Orange Money Guiné-Bissau', icon: Smartphone, feePct: 1.5, badge: 'Popular na África Ocidental' },
    { id: 'mtn_money', name: 'MTN Mobile Money', icon: Smartphone, feePct: 1.5, badge: 'África Ocidental' },
    { id: 'pix', name: 'PIX Brasil (Transferência Instantânea)', icon: CreditCard, feePct: 0.5, badge: 'Brasil 🇧🇷' },
    { id: 'bank', name: 'Transferência Bancária Internacional (IBAN/SWIFT)', icon: Building2, feePct: 2.0, badge: 'Europa / Global 🇪🇺' },
    { id: 'wallet', name: 'Carteira Digital Nusali Pay Direct', icon: Wallet, feePct: 0.0, badge: '0% Taxa' },
  ];

  const currentMethodObj = paymentMethods.find(m => m.id === selectedMethod)!;
  const calculatedFee = (amount * currentMethodObj.feePct) / 100;
  const netAmount = amount - calculatedFee;

  const handleConfirmPayout = async () => {
    try {
      setLoading(true);
      const res = await SellerService.requestPayout({
        amount,
        method: currentMethodObj.name,
        accountDetail,
        currency: selectedCurrency,
      });

      if (res.success && res.data) {
        setCompletedTx({
          ...res.data,
          netAmount: res.data.netAmount || netAmount,
          currency: res.data.currency || selectedCurrency,
          account: res.data.accountDetail || accountDetail,
        });
        setStep(4);
        showToast(`Saque de ${selectedCurrency} ${netAmount.toLocaleString()} solicitado com sucesso!`);
        fetchWallet();
      } else {
        showToast(res.message || 'Erro ao processar saque.');
      }
    } catch (err: any) {
      showToast(err.message || 'Falha na comunicação com o servidor.');
    } finally {
      setLoading(false);
    }
  };

  const payoutHistory = [
    { id: 'SAQUE-88129', date: 'Hoje', amount: 250000, currency: 'XOF', method: 'Orange Money (+245 955 88 12 00)', status: 'Concluído' },
    { id: 'SAQUE-87002', date: '20/07/2026', amount: 1500, currency: 'BRL', method: 'PIX (CNPJ 48.910.200/0001-92)', status: 'Concluído' },
    { id: 'SAQUE-85100', date: '12/07/2026', amount: 450, currency: 'EUR', method: 'IBAN PT50 0035 0001 2291 0021 9', status: 'Concluído' },
  ];

  return (
    <div className="space-y-6 animate-fadeIn">
      {/* Header Banner */}
      <div className="bg-white rounded-2xl p-6 border border-gray-200 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-gray-900 flex items-center gap-2">
            <ArrowUpRight className="w-6 h-6 text-emerald-600" />
            Solicitar Saque de Saldo
          </h1>
          <p className="text-xs text-gray-500 mt-1">
            Transfira seus rendimentos com suporte local a Orange Money, MTN, PIX, IBAN e Carteira Nusali Pay.
          </p>
        </div>

        <div className="bg-emerald-50 border border-emerald-200 px-4 py-2 rounded-xl text-right">
          <p className="text-[10px] font-bold text-emerald-800 uppercase">Saldo Disponível para Saque</p>
          <p className="text-lg font-black text-emerald-900">
            {selectedCurrency} {availableBalance.toLocaleString()}
          </p>
        </div>
      </div>

      {/* Payout Wizard Card */}
      <div className="bg-white rounded-2xl border border-gray-200 shadow-xs p-6 space-y-6">
        {/* Step Progress Indicators */}
        <div className="flex items-center justify-between border-b border-gray-200 pb-4 text-xs font-bold">
          <div className={`flex items-center gap-2 ${step >= 1 ? 'text-emerald-700' : 'text-gray-400'}`}>
            <span className="w-6 h-6 rounded-full bg-emerald-100 flex items-center justify-center text-emerald-800 font-black">1</span>
            <span>Moeda & Valor</span>
          </div>
          <div className={`flex items-center gap-2 ${step >= 2 ? 'text-emerald-700' : 'text-gray-400'}`}>
            <span className="w-6 h-6 rounded-full bg-emerald-100 flex items-center justify-center text-emerald-800 font-black">2</span>
            <span>Método de Recebimento</span>
          </div>
          <div className={`flex items-center gap-2 ${step >= 3 ? 'text-emerald-700' : 'text-gray-400'}`}>
            <span className="w-6 h-6 rounded-full bg-emerald-100 flex items-center justify-center text-emerald-800 font-black">3</span>
            <span>Confirmação & Taxas</span>
          </div>
        </div>

        {/* Step 1: Select Currency & Amount */}
        {step === 1 && (
          <div className="space-y-4 max-w-xl mx-auto">
            <h3 className="text-sm font-black text-gray-900 uppercase">Passo 1: Selecione a Moeda e Valor</h3>

            <div className="space-y-2">
              <label className="text-xs font-bold text-gray-700">Moeda da Conta:</label>
              <div className="grid grid-cols-5 gap-2">
                {(['XOF', 'BRL', 'EUR', 'AOA', 'USD'] as CurrencyCode[]).map(curr => (
                  <button
                    key={curr}
                    type="button"
                    onClick={() => setSelectedCurrency(curr)}
                    className={`p-2.5 rounded-xl border font-black text-xs transition ${
                      selectedCurrency === curr ? 'border-emerald-600 bg-emerald-50 text-emerald-800 shadow-xs' : 'border-gray-200 text-gray-700 hover:bg-gray-50'
                    }`}
                  >
                    {curr}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-2 pt-2">
              <label className="text-xs font-bold text-gray-700">Valor a Sacar ({selectedCurrency}):</label>
              <input
                type="number"
                value={amount}
                onChange={(e) => setAmount(Number(e.target.value))}
                min={1000}
                max={availableBalance}
                className="w-full p-3 border border-gray-300 rounded-xl font-black text-lg text-gray-900 focus:ring-2 focus:ring-emerald-500"
              />
              <p className="text-[10px] text-gray-400">
                Valor máximo disponível: {selectedCurrency} {availableBalance.toLocaleString()}
              </p>
            </div>

            <button
              onClick={() => setStep(2)}
              disabled={amount <= 0 || amount > availableBalance}
              className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold py-3 rounded-xl transition text-xs shadow-md disabled:opacity-50"
            >
              Avançar para Método de Recebimento
            </button>
          </div>
        )}

        {/* Step 2: Select Method */}
        {step === 2 && (
          <div className="space-y-4 max-w-xl mx-auto">
            <h3 className="text-sm font-black text-gray-900 uppercase">Passo 2: Escolha o Método de Recebimento</h3>

            <div className="space-y-2">
              {paymentMethods.map(m => {
                const IconComp = m.icon;
                return (
                  <label
                    key={m.id}
                    onClick={() => setSelectedMethod(m.id as any)}
                    className={`p-3.5 rounded-xl border flex items-center justify-between cursor-pointer transition ${
                      selectedMethod === m.id ? 'border-emerald-600 bg-emerald-50/60 shadow-xs' : 'border-gray-200 hover:bg-gray-50'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <div className="p-2 bg-emerald-100 text-emerald-800 rounded-lg">
                        <IconComp className="w-5 h-5" />
                      </div>
                      <div>
                        <p className="text-xs font-bold text-gray-900">{m.name}</p>
                        <p className="text-[10px] text-emerald-700 font-medium">{m.badge}</p>
                      </div>
                    </div>
                    <span className="text-xs font-black text-gray-700">Taxa: {m.feePct}%</span>
                  </label>
                );
              })}
            </div>

            <div className="space-y-1 pt-2">
              <label className="text-xs font-bold text-gray-700">Dados da Conta / Telefone / Chave PIX / IBAN:</label>
              <input
                type="text"
                value={accountDetail}
                onChange={(e) => setAccountDetail(e.target.value)}
                placeholder="Informe o número, chave ou IBAN de destino..."
                className="w-full p-2.5 border border-gray-300 rounded-xl text-xs font-bold text-gray-900 focus:ring-2 focus:ring-emerald-500"
              />
            </div>

            <div className="flex gap-2 pt-2">
              <button
                onClick={() => setStep(1)}
                className="w-1/3 bg-gray-100 hover:bg-gray-200 text-gray-800 font-bold py-3 rounded-xl text-xs"
              >
                Voltar
              </button>
              <button
                onClick={() => setStep(3)}
                className="w-2/3 bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold py-3 rounded-xl transition text-xs shadow-md"
              >
                Revisar Resumo do Saque
              </button>
            </div>
          </div>
        )}

        {/* Step 3: Review & Confirm */}
        {step === 3 && (
          <div className="space-y-4 max-w-xl mx-auto">
            <h3 className="text-sm font-black text-gray-900 uppercase">Passo 3: Confirmação e Resumo de Taxas</h3>

            <div className="bg-gray-50 p-4 rounded-xl border border-gray-200 space-y-3 text-xs">
              <div className="flex justify-between border-b pb-2">
                <span className="text-gray-500 font-medium">Valor Solicitado:</span>
                <span className="font-bold text-gray-900">{selectedCurrency} {amount.toLocaleString()}</span>
              </div>
              <div className="flex justify-between border-b pb-2">
                <span className="text-gray-500 font-medium">Método Escolhido:</span>
                <span className="font-bold text-gray-900">{currentMethodObj.name}</span>
              </div>
              <div className="flex justify-between border-b pb-2">
                <span className="text-gray-500 font-medium">Conta Destino:</span>
                <span className="font-mono font-bold text-emerald-800">{accountDetail}</span>
              </div>
              <div className="flex justify-between border-b pb-2 text-amber-700">
                <span className="font-medium">Taxa de Processamento ({currentMethodObj.feePct}%):</span>
                <span className="font-bold">- {selectedCurrency} {calculatedFee.toLocaleString()}</span>
              </div>
              <div className="flex justify-between pt-1 text-sm font-black text-emerald-900">
                <span>Valor Líquido a Receber:</span>
                <span>{selectedCurrency} {netAmount.toLocaleString()}</span>
              </div>
            </div>

            <div className="flex gap-2">
              <button
                onClick={() => setStep(2)}
                disabled={loading}
                className="w-1/3 bg-gray-100 hover:bg-gray-200 text-gray-800 font-bold py-3 rounded-xl text-xs"
              >
                Alterar Método
              </button>
              <button
                onClick={handleConfirmPayout}
                disabled={loading}
                className="w-2/3 bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold py-3 rounded-xl transition text-xs shadow-lg flex items-center justify-center gap-2"
              >
                {loading && <Loader2 className="w-4 h-4 animate-spin" />}
                Confirmar e Processar Saque
              </button>
            </div>
          </div>
        )}

        {/* Step 4: Receipt Result */}
        {step === 4 && completedTx && (
          <div className="bg-emerald-50 border border-emerald-200 p-6 rounded-2xl text-center space-y-4 max-w-xl mx-auto">
            <CheckCircle2 className="w-12 h-12 text-emerald-600 mx-auto" />
            <h3 className="text-lg font-black text-emerald-950">Saque Solicitado com Sucesso!</h3>

            <div className="bg-white p-4 rounded-xl border border-emerald-200 text-xs text-left space-y-2">
              <p className="flex justify-between">
                <span className="text-gray-500">ID da Transação:</span>
                <strong className="font-mono text-gray-900">{completedTx.id}</strong>
              </p>
              <p className="flex justify-between">
                <span className="text-gray-500">Valor Líquido:</span>
                <strong className="text-emerald-700 font-black">{completedTx.currency} {completedTx.netAmount?.toLocaleString()}</strong>
              </p>
              <p className="flex justify-between">
                <span className="text-gray-500">Destino:</span>
                <strong className="text-gray-800">{completedTx.account}</strong>
              </p>
            </div>

            <button
              onClick={() => { setStep(1); setCompletedTx(null); }}
              className="bg-emerald-700 hover:bg-emerald-800 text-white font-bold text-xs px-6 py-2.5 rounded-xl transition"
            >
              Realizar Novo Saque
            </button>
          </div>
        )}
      </div>

      {/* Payout History Table */}
      <div className="bg-white rounded-2xl border border-gray-200 shadow-xs p-6 space-y-4">
        <h3 className="text-sm font-black text-gray-900 uppercase tracking-wider">
          Histórico de Saques Realizados
        </h3>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-gray-50 text-gray-500 uppercase text-[10px] font-bold border-b border-gray-200">
              <tr>
                <th className="p-3">ID Saque</th>
                <th className="p-3">Data</th>
                <th className="p-3">Valor</th>
                <th className="p-3">Método & Conta</th>
                <th className="p-3 text-right">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 font-medium">
              {payoutHistory.map(item => (
                <tr key={item.id}>
                  <td className="p-3 font-bold text-gray-900">{item.id}</td>
                  <td className="p-3 text-gray-500">{item.date}</td>
                  <td className="p-3 font-black text-emerald-800">{item.currency} {item.amount.toLocaleString()}</td>
                  <td className="p-3 text-gray-700">{item.method}</td>
                  <td className="p-3 text-right">
                    <span className="bg-emerald-100 text-emerald-800 font-extrabold text-[10px] px-2.5 py-1 rounded-full uppercase">
                      {item.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
