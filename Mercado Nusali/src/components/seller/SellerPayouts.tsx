import React, { useState, useEffect } from 'react';
import {
  ArrowUpRight,
  Smartphone,
  CreditCard,
  Building2,
  Wallet,
  CheckCircle2,
  Loader2,
  AlertTriangle,
  PlusCircle,
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
  const [amount, setAmount] = useState<number>(0);
  const [selectedMethod, setSelectedMethod] = useState<'orange_money' | 'mtn_money' | 'pix' | 'bank' | 'wallet'>('orange_money');
  const [bankAccounts, setBankAccounts] = useState<any[]>([]);
  const [selectedBankAccountId, setSelectedBankAccountId] = useState<string>('');
  const [completedTx, setCompletedTx] = useState<any | null>(null);
  const [loading, setLoading] = useState(false);
  const [walletData, setWalletData] = useState<any>(null);
  const [payoutHistory, setPayoutHistory] = useState<any[]>([]);

  // Add Bank Account Modal State
  const [showAddAccountModal, setShowAddAccountModal] = useState(false);
  const [newAccType, setNewAccType] = useState<'bank_transfer' | 'pix' | 'orange_money' | 'mtn'>('orange_money');
  const [newAccHolder, setNewAccHolder] = useState('');
  const [newAccBankName, setNewAccBankName] = useState('');
  const [newAccNumber, setNewAccNumber] = useState('');
  const [newAccIban, setNewAccIban] = useState('');
  const [newAccSwift, setNewAccSwift] = useState('');
  const [newAccPixKey, setNewAccPixKey] = useState('');
  const [newAccMobile, setNewAccMobile] = useState('');
  const [newAccCurrency, setNewAccCurrency] = useState<CurrencyCode>('XOF');
  const [savingAccount, setSavingAccount] = useState(false);

  const handleSaveAccount = async () => {
    if (!newAccHolder.trim()) {
      showToast('Informe o nome do titular.');
      return;
    }
    if (newAccType === 'pix' && !newAccPixKey.trim()) {
      showToast('Informe a chave PIX.');
      return;
    }
    if ((newAccType === 'orange_money' || newAccType === 'mtn') && !newAccMobile.trim()) {
      showToast('Informe o número de telefone (Mobile Money).');
      return;
    }
    if (newAccType === 'bank_transfer' && !newAccNumber.trim() && !newAccIban.trim()) {
      showToast('Informe o número da conta ou IBAN/Routing.');
      return;
    }

    setSavingAccount(true);
    try {
      const res = await SellerService.addBankAccount({
        accountType: newAccType,
        accountHolder: newAccHolder.trim(),
        bankName: newAccType === 'bank_transfer' ? newAccBankName.trim() : undefined,
        accountNumber: newAccType === 'bank_transfer' ? newAccNumber.trim() : undefined,
        ibanOrRouting: newAccType === 'bank_transfer' ? newAccIban.trim() : undefined,
        swift: newAccType === 'bank_transfer' ? newAccSwift.trim() : undefined,
        pixKey: newAccType === 'pix' ? newAccPixKey.trim() : undefined,
        mobileMoneyNumber: (newAccType === 'orange_money' || newAccType === 'mtn') ? newAccMobile.trim() : undefined,
        currency: newAccCurrency,
      });

      if (res.success && res.data) {
        showToast('Conta de recebimento cadastrada com sucesso!');
        setShowAddAccountModal(false);
        setNewAccHolder('');
        setNewAccBankName('');
        setNewAccNumber('');
        setNewAccIban('');
        setNewAccSwift('');
        setNewAccPixKey('');
        setNewAccMobile('');
        const bankAccsRes = await SellerService.getBankAccounts();
        if (bankAccsRes.success && bankAccsRes.data) {
          setBankAccounts(bankAccsRes.data);
          setSelectedBankAccountId(res.data.id);
        }
      } else {
        showToast(res.message || res.error?.message || 'Erro ao cadastrar conta.');
      }
    } catch (err: any) {
      showToast(err?.response?.data?.message || err.message || 'Erro ao cadastrar conta.');
    } finally {
      setSavingAccount(false);
    }
  };

  const fetchWalletAndPayouts = async () => {
    try {
      const [walletRes, payoutsRes, bankAccsRes] = await Promise.all([
        SellerService.getWallet(),
        SellerService.getPayouts(),
        SellerService.getBankAccounts(),
      ]);
      if (walletRes.success && walletRes.data) {
        setWalletData(walletRes.data);
      }
      if (payoutsRes.success && payoutsRes.data) {
        setPayoutHistory(payoutsRes.data);
      }
      if (bankAccsRes.success && bankAccsRes.data) {
        setBankAccounts(bankAccsRes.data);
        if (bankAccsRes.data.length > 0) {
          const defaultAcc = bankAccsRes.data.find((a: any) => a.isDefault) || bankAccsRes.data[0];
          setSelectedBankAccountId(defaultAcc.id);
        }
      }
    } catch (err) {
      console.error('Error fetching wallet/payouts/bank-accounts:', err);
    }
  };

  useEffect(() => {
    fetchWalletAndPayouts();
  }, []);

  const availableBalance = walletData?.available || 0;

  const paymentMethods = [
    { id: 'orange_money', name: 'Orange Money Guiné-Bissau', icon: Smartphone, badge: 'SANDBOX / EM CONFIGURAÇÃO' },
    { id: 'mtn', name: 'MTN Mobile Money', icon: Smartphone, badge: 'SANDBOX / EM CONFIGURAÇÃO' },
    { id: 'pix', name: 'PIX Brasil (Transferência Instantânea)', icon: CreditCard, badge: 'SANDBOX / EM CONFIGURAÇÃO' },
    { id: 'bank_transfer', name: 'Transferência Bancária Internacional (IBAN/SWIFT)', icon: Building2, badge: 'SANDBOX / EM CONFIGURAÇÃO' },
    { id: 'wallet', name: 'Carteira Digital Nusali Pay Direct', icon: Wallet, badge: 'Interno' },
  ];

  const currentMethodObj = paymentMethods.find((m) => m.id === selectedMethod) || paymentMethods[0];
  const selectedBankAccountObj = bankAccounts.find(a => a.id === selectedBankAccountId);

  const handleConfirmPayout = async () => {
    try {
      if (selectedMethod !== 'wallet' && !selectedBankAccountId) {
        showToast('Selecione uma conta de recebimento cadastrada.');
        return;
      }

      setLoading(true);
      const res = await SellerService.requestPayout({
        amount,
        method: selectedMethod,
        bankAccountId: selectedMethod !== 'wallet' ? selectedBankAccountId : undefined,
        currency: selectedCurrency,
      });

      if (res.success && res.data) {
        setCompletedTx({
          ...res.data,
          grossAmount: amount,
          currency: res.data.currency || selectedCurrency,
          account: selectedBankAccountObj ? `${selectedBankAccountObj.bankName} - ${selectedBankAccountObj.accountNumber}` : 'Carteira Interna',
        });
        setStep(4);
        showToast(`Saque de ${selectedCurrency} ${amount.toLocaleString()} solicitado com sucesso!`);
        fetchWalletAndPayouts();
      } else {
        showToast(res.error?.message || res.message || 'Erro ao processar saque.');
      }
    } catch (err: any) {
      showToast(err?.response?.data?.error?.message || err.message || 'Falha na comunicação com o servidor.');
    } finally {
      setLoading(false);
    }
  };

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
            <span>Método & Conta</span>
          </div>
          <div className={`flex items-center gap-2 ${step >= 3 ? 'text-emerald-700' : 'text-gray-400'}`}>
            <span className="w-6 h-6 rounded-full bg-emerald-100 flex items-center justify-center text-emerald-800 font-black">3</span>
            <span>Confirmação & Resumo</span>
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

        {/* Step 2: Select Method & Bank Account */}
        {step === 2 && (
          <div className="space-y-4 max-w-xl mx-auto">
            <h3 className="text-sm font-black text-gray-900 uppercase">Passo 2: Escolha o Método e Conta de Destino</h3>

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
                        <p className="text-[10px] text-amber-700 font-medium">{m.badge}</p>
                      </div>
                    </div>
                  </label>
                );
              })}
            </div>

            {selectedMethod !== 'wallet' && (
              <div className="space-y-2 pt-2">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-gray-700">Selecione a Conta Cadastrada:</label>
                  <button
                    type="button"
                    onClick={() => {
                      const initialType = selectedMethod === 'pix' ? 'pix' : selectedMethod === 'bank_transfer' ? 'bank_transfer' : selectedMethod === 'mtn' ? 'mtn' : 'orange_money';
                      setNewAccType(initialType);
                      setNewAccCurrency(selectedCurrency);
                      setShowAddAccountModal(true);
                    }}
                    className="text-[11px] font-extrabold text-emerald-600 hover:text-emerald-700 flex items-center gap-1"
                  >
                    <PlusCircle className="w-3.5 h-3.5" />
                    <span>+ Cadastrar Nova Conta</span>
                  </button>
                </div>
                {bankAccounts.length === 0 ? (
                  <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl space-y-2 text-xs text-amber-800">
                    <div className="flex items-center gap-2 font-bold">
                      <AlertTriangle className="w-4 h-4 text-amber-600" />
                      <span>Nenhuma conta de recebimento cadastrada.</span>
                    </div>
                    <p className="text-[11px] text-amber-700">
                      Cadastre uma conta de recebimento para este método antes de solicitar o saque.
                    </p>
                    <button
                      type="button"
                      onClick={() => {
                        const initialType = selectedMethod === 'pix' ? 'pix' : selectedMethod === 'bank_transfer' ? 'bank_transfer' : selectedMethod === 'mtn' ? 'mtn' : 'orange_money';
                        setNewAccType(initialType);
                        setNewAccCurrency(selectedCurrency);
                        setShowAddAccountModal(true);
                      }}
                      className="mt-1 px-3 py-1.5 bg-amber-600 text-white font-bold rounded-lg text-xs hover:bg-amber-700 transition"
                    >
                      + Cadastrar Conta Agora
                    </button>
                  </div>
                ) : (
                  <select
                    value={selectedBankAccountId}
                    onChange={(e) => setSelectedBankAccountId(e.target.value)}
                    className="w-full p-2.5 border border-gray-300 rounded-xl text-xs font-bold text-gray-900 focus:ring-2 focus:ring-emerald-500"
                  >
                    {bankAccounts.map(acc => (
                      <option key={acc.id} value={acc.id}>
                        {acc.accountType ? `[${acc.accountType.toUpperCase()}] ` : ''}{acc.bankName ? `${acc.bankName} - ` : ''}{acc.accountHolder} ({acc.accountNumber || acc.ibanOrRouting || acc.pixKey || acc.mobileMoneyNumber || 'Conta Cadastrada'}) - [{acc.currency}]
                      </option>
                    ))}
                  </select>
                )}
              </div>
            )}

            <div className="flex gap-2 pt-2">
              <button
                onClick={() => setStep(1)}
                className="w-1/3 bg-gray-100 hover:bg-gray-200 text-gray-800 font-bold py-3 rounded-xl text-xs"
              >
                Voltar
              </button>
              <button
                onClick={() => setStep(3)}
                disabled={selectedMethod !== 'wallet' && !selectedBankAccountId}
                className="w-2/3 bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold py-3 rounded-xl transition text-xs shadow-md disabled:opacity-50"
              >
                Revisar Resumo do Saque
              </button>
            </div>
          </div>
        )}

        {/* Step 3: Review & Confirm */}
        {step === 3 && (
          <div className="space-y-4 max-w-xl mx-auto">
            <h3 className="text-sm font-black text-gray-900 uppercase flex items-center justify-between">
              <span>Passo 3: Confirmação e Resumo de Saque</span>
              <span className="px-2 py-0.5 text-xs bg-amber-100 text-amber-800 rounded border border-amber-300 font-bold">Resumo Oficial</span>
            </h3>

            <div className="bg-gray-50 p-4 rounded-xl border border-gray-200 space-y-3 text-xs">
              <div className="flex justify-between border-b pb-2">
                <span className="text-gray-500 font-medium">Valor Solicitado (Bruto):</span>
                <span className="font-bold text-gray-900">{selectedCurrency} {amount.toLocaleString()}</span>
              </div>
              <div className="flex justify-between border-b pb-2">
                <span className="text-gray-500 font-medium">Método Escolhido:</span>
                <span className="font-bold text-gray-900">{currentMethodObj.name}</span>
              </div>
              {selectedBankAccountObj && (
                <div className="flex justify-between border-b pb-2">
                  <span className="text-gray-500 font-medium">Conta Destino:</span>
                  <span className="font-mono font-bold text-emerald-800">
                    {selectedBankAccountObj.bankName} - {selectedBankAccountObj.accountNumber || selectedBankAccountObj.pixKey || selectedBankAccountObj.mobileMoneyNumber}
                  </span>
                </div>
              )}
              <div className="flex justify-between border-b pb-2 text-gray-500">
                <span className="font-medium">Taxa de Processamento:</span>
                <span className="italic font-semibold text-gray-600">Taxa será calculada pelo provedor</span>
              </div>
              <div className="flex justify-between pt-1 text-sm font-black text-emerald-900">
                <span>Valor de Referência:</span>
                <span>{selectedCurrency} {amount.toLocaleString()}</span>
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
                Confirmar e Solicitar Saque
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
                <span className="text-gray-500">Valor Bruto:</span>
                <strong className="text-emerald-700 font-black">{completedTx.currency} {completedTx.grossAmount?.toLocaleString()}</strong>
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
                <th className="p-3">Método</th>
                <th className="p-3 text-right">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 font-medium">
              {payoutHistory.length === 0 ? (
                <tr>
                  <td colSpan={5} className="p-8 text-center text-gray-400">
                    Nenhum saque de saldo realizado até o momento.
                  </td>
                </tr>
              ) : (
                payoutHistory.map(item => (
                  <tr key={item.id}>
                    <td className="p-3 font-bold text-gray-900 font-mono">{item.id}</td>
                    <td className="p-3 text-gray-500">{new Date(item.createdAt || item.date).toLocaleDateString()}</td>
                    <td className="p-3 font-black text-emerald-800">{item.currency} {Number(item.amount).toLocaleString()}</td>
                    <td className="p-3 text-gray-700 uppercase font-bold">{item.method}</td>
                    <td className="p-3 text-right">
                      <span className={`font-extrabold text-[10px] px-2.5 py-1 rounded-full uppercase ${
                        item.status === 'completed' ? 'bg-emerald-100 text-emerald-800' :
                        item.status === 'failed' ? 'bg-red-100 text-red-800' :
                        item.status === 'processing' ? 'bg-blue-100 text-blue-800' : 'bg-amber-100 text-amber-800'
                      }`}>
                        {item.status}
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
      {/* Modal: Cadastrar Nova Conta de Recebimento */}
      {showAddAccountModal && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 space-y-4 shadow-2xl border border-gray-100">
            <h3 className="text-base font-black text-gray-900 border-b pb-3">
              Cadastrar Nova Conta de Recebimento
            </h3>

            <div className="space-y-3">
              <div>
                <label className="text-xs font-bold text-gray-700">Tipo de Conta / Método:</label>
                <select
                  value={newAccType}
                  onChange={(e: any) => setNewAccType(e.target.value)}
                  className="w-full mt-1 p-2.5 border border-gray-300 rounded-xl text-xs font-bold text-gray-900"
                >
                  <option value="orange_money">Orange Money (Guiné-Bissau)</option>
                  <option value="mtn">MTN Mobile Money</option>
                  <option value="pix">PIX Brasil</option>
                  <option value="bank_transfer">Transferência Bancária (IBAN/SWIFT)</option>
                </select>
              </div>

              <div>
                <label className="text-xs font-bold text-gray-700">Nome do Titular (accountHolder) *:</label>
                <input
                  type="text"
                  value={newAccHolder}
                  onChange={(e) => setNewAccHolder(e.target.value)}
                  placeholder="Nome completo do titular da conta"
                  className="w-full mt-1 p-2.5 border border-gray-300 rounded-xl text-xs font-medium text-gray-900"
                />
              </div>

              {/* Dynamic Fields per accountType */}
              {newAccType === 'pix' && (
                <div>
                  <label className="text-xs font-bold text-gray-700">Chave PIX (CPF/CNPJ/Email/Telefone/EVP) *:</label>
                  <input
                    type="text"
                    value={newAccPixKey}
                    onChange={(e) => setNewAccPixKey(e.target.value)}
                    placeholder="Ex: 000.000.000-00 ou chave@email.com"
                    className="w-full mt-1 p-2.5 border border-gray-300 rounded-xl text-xs font-medium text-gray-900"
                  />
                </div>
              )}

              {(newAccType === 'orange_money' || newAccType === 'mtn') && (
                <div>
                  <label className="text-xs font-bold text-gray-700">Número Mobile Money (Telefone) *:</label>
                  <input
                    type="text"
                    value={newAccMobile}
                    onChange={(e) => setNewAccMobile(e.target.value)}
                    placeholder="Ex: +245 955 000 000"
                    className="w-full mt-1 p-2.5 border border-gray-300 rounded-xl text-xs font-medium text-gray-900"
                  />
                </div>
              )}

              {newAccType === 'bank_transfer' && (
                <>
                  <div>
                    <label className="text-xs font-bold text-gray-700">Nome do Banco *:</label>
                    <input
                      type="text"
                      value={newAccBankName}
                      onChange={(e) => setNewAccBankName(e.target.value)}
                      placeholder="Ex: Banco BNI, BGFI, Millennium BIM"
                      className="w-full mt-1 p-2.5 border border-gray-300 rounded-xl text-xs font-medium text-gray-900"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-xs font-bold text-gray-700">Número da Conta:</label>
                      <input
                        type="text"
                        value={newAccNumber}
                        onChange={(e) => setNewAccNumber(e.target.value)}
                        placeholder="Ex: 12345678"
                        className="w-full mt-1 p-2.5 border border-gray-300 rounded-xl text-xs font-medium text-gray-900"
                      />
                    </div>
                    <div>
                      <label className="text-xs font-bold text-gray-700">IBAN / Routing:</label>
                      <input
                        type="text"
                        value={newAccIban}
                        onChange={(e) => setNewAccIban(e.target.value)}
                        placeholder="Ex: GW60 0001 ..."
                        className="w-full mt-1 p-2.5 border border-gray-300 rounded-xl text-xs font-medium text-gray-900"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="text-xs font-bold text-gray-700">Código SWIFT / BIC (Opcional):</label>
                    <input
                      type="text"
                      value={newAccSwift}
                      onChange={(e) => setNewAccSwift(e.target.value)}
                      placeholder="Ex: BGNOGWXX"
                      className="w-full mt-1 p-2.5 border border-gray-300 rounded-xl text-xs font-medium text-gray-900"
                    />
                  </div>
                </>
              )}

              <div>
                <label className="text-xs font-bold text-gray-700">Moeda da Conta:</label>
                <select
                  value={newAccCurrency}
                  onChange={(e: any) => setNewAccCurrency(e.target.value)}
                  className="w-full mt-1 p-2.5 border border-gray-300 rounded-xl text-xs font-bold text-gray-900"
                >
                  <option value="XOF">XOF (Franco CFA)</option>
                  <option value="BRL">BRL (Real)</option>
                  <option value="EUR">EUR (Euro)</option>
                  <option value="AOA">AOA (Kwanza)</option>
                  <option value="USD">USD (Dólar)</option>
                </select>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-3 border-t">
              <button
                type="button"
                onClick={() => setShowAddAccountModal(false)}
                className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold rounded-xl text-xs"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={savingAccount}
                onClick={handleSaveAccount}
                className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl text-xs flex items-center gap-1.5 disabled:opacity-50"
              >
                {savingAccount && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                <span>Salvar Conta</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
