import React, { useState, useEffect } from 'react';
import {
  QrCode,
  Copy,
  CheckCircle2,
  Clock,
  ShieldCheck,
  Zap,
  AlertCircle,
  ExternalLink,
  Smartphone,
  RefreshCw,
  X,
  Lock,
  Receipt,
} from 'lucide-react';
import { PixTransaction } from '../utils/pixEngine';
import { PixService } from '../services/pixService';

interface PixPaymentModalProps {
  isOpen: boolean;
  onClose: () => void;
  transaction: PixTransaction | null;
  onPaymentSuccess: (transaction: PixTransaction) => void;
}

export const PixPaymentModal: React.FC<PixPaymentModalProps> = ({
  isOpen,
  onClose,
  transaction: initialTransaction,
  onPaymentSuccess,
}) => {
  const [transaction, setTransaction] = useState<PixTransaction | null>(initialTransaction);
  const [copied, setCopied] = useState(false);
  const [timeLeftSeconds, setTimeLeftSeconds] = useState(900); // 15 minutes default
  const [isSimulating, setIsSimulating] = useState(false);
  const [isChecking, setIsChecking] = useState(false);

  useEffect(() => {
    setTransaction(initialTransaction);
    if (initialTransaction?.expiresAt) {
      const diff = Math.floor((new Date(initialTransaction.expiresAt).getTime() - Date.now()) / 1000);
      setTimeLeftSeconds(Math.max(0, diff > 0 ? diff : 900));
    }
  }, [initialTransaction]);

  // Countdown timer
  useEffect(() => {
    if (!isOpen || !transaction || transaction.status === 'paid') return;

    const timer = setInterval(() => {
      setTimeLeftSeconds((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [isOpen, transaction]);

  // Real-time status polling every 2.5 seconds
  useEffect(() => {
    if (!isOpen || !transaction?.txid || transaction.status === 'paid') return;

    const interval = setInterval(async () => {
      try {
        const res = await PixService.checkPixStatus(transaction.txid);
        if (res.success && res.data) {
          if (res.data.status === 'paid' && transaction.status !== 'paid') {
            setTransaction(res.data);
            setTimeout(() => {
              onPaymentSuccess(res.data!);
            }, 1200);
          }
        }
      } catch (err) {
        console.error('Polling Pix status error:', err);
      }
    }, 2500);

    return () => clearInterval(interval);
  }, [isOpen, transaction, onPaymentSuccess]);

  if (!isOpen || !transaction) return null;

  const handleCopyPixCode = async () => {
    try {
      await navigator.clipboard.writeText(transaction.brCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 3000);
    } catch (err) {
      console.error('Failed to copy Pix code:', err);
    }
  };

  const handleSimulatePayment = async () => {
    setIsSimulating(true);
    try {
      const res = await PixService.simulatePixPayment(transaction.txid);
      if (res.success && res.data) {
        setTransaction(res.data);
        setTimeout(() => {
          setIsSimulating(false);
          onPaymentSuccess(res.data!);
        }, 1200);
      } else {
        setIsSimulating(false);
      }
    } catch (err) {
      console.error('Error simulating Pix payment:', err);
      setIsSimulating(false);
    }
  };

  const handleManualCheck = async () => {
    setIsChecking(true);
    try {
      const res = await PixService.checkPixStatus(transaction.txid);
      if (res.success && res.data) {
        setTransaction(res.data);
        if (res.data.status === 'paid') {
          onPaymentSuccess(res.data);
        }
      }
    } catch (err) {
      console.error('Check error:', err);
    } finally {
      setIsChecking(false);
    }
  };

  const minutes = Math.floor(timeLeftSeconds / 60);
  const seconds = timeLeftSeconds % 60;
  const formattedTime = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  const isPaid = transaction.status === 'paid';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-xs overflow-y-auto">
      <div className="bg-white rounded-3xl max-w-lg w-full shadow-2xl border border-gray-100 overflow-hidden relative animate-in fade-in zoom-in duration-200 my-8">
        {/* Top Accent Header */}
        <div className="bg-gradient-to-r from-emerald-600 to-teal-700 p-6 text-white text-center relative">
          <button
            type="button"
            onClick={onClose}
            className="absolute top-4 right-4 text-white/80 hover:text-white p-1 rounded-full bg-white/10 hover:bg-white/20 transition cursor-pointer"
            title="Fechar"
          >
            <X className="w-5 h-5" />
          </button>

          <div className="inline-flex items-center gap-1.5 bg-white/20 text-white font-black text-[11px] px-3 py-1 rounded-full uppercase tracking-wider mb-2">
            <Zap className="w-3.5 h-3.5 fill-yellow-300 text-yellow-300" />
            Pagamento Instantâneo Banco Central do Brasil
          </div>

          <h2 className="text-2xl font-black">Pague com Pix</h2>
          <p className="text-xs text-emerald-100 mt-0.5">
            Aprovação automática em poucos segundos com garantia Escrow
          </p>

          {/* Amount Badge */}
          <div className="mt-4 inline-block bg-white text-gray-900 rounded-2xl px-6 py-2.5 shadow-lg">
            <span className="text-[11px] text-gray-500 font-bold block uppercase tracking-wider">Valor do Pix</span>
            <span className="text-2xl font-black text-emerald-700">
              R$ {transaction.amountBrl.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
            </span>
            {transaction.originalCurrency !== 'BRL' && (
              <span className="text-[10px] text-gray-400 block font-medium">
                (Equivalente a {transaction.originalAmount.toLocaleString('pt-BR')} {transaction.originalCurrency})
              </span>
            )}
          </div>
        </div>

        {/* Content Body */}
        <div className="p-6 space-y-5">
          {isPaid ? (
            /* Payment Approved State */
            <div className="text-center py-6 space-y-4">
              <div className="w-16 h-16 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mx-auto ring-8 ring-emerald-50">
                <CheckCircle2 className="w-10 h-10" />
              </div>
              <div>
                <h3 className="text-xl font-black text-gray-900">Pagamento Pix Aprovado!</h3>
                <p className="text-xs text-gray-500 mt-1">
                  Seu pedido foi confirmado e o saldo já está alocado no sistema de custódia Escrow.
                </p>
              </div>

              {/* Receipt Snippet */}
              <div className="bg-gray-50 border border-gray-200 rounded-2xl p-4 text-left text-xs space-y-2 font-mono">
                <div className="flex justify-between border-b border-gray-200 pb-1.5 text-gray-600">
                  <span>Beneficiário:</span>
                  <span className="font-bold text-gray-900">{transaction.merchantName}</span>
                </div>
                <div className="flex justify-between border-b border-gray-200 pb-1.5 text-gray-600">
                  <span>Chave Pix CNPJ:</span>
                  <span className="font-bold text-gray-900">{transaction.pixKey}</span>
                </div>
                <div className="flex justify-between border-b border-gray-200 pb-1.5 text-gray-600">
                  <span>TxID:</span>
                  <span className="font-bold text-gray-900">{transaction.txid}</span>
                </div>
                {transaction.endToEndId && (
                  <div className="flex flex-col border-b border-gray-200 pb-1.5 text-gray-600">
                    <span>EndToEndId (Autenticação BACEN):</span>
                    <span className="font-bold text-emerald-800 break-all text-[11px] mt-0.5">
                      {transaction.endToEndId}
                    </span>
                  </div>
                )}
                <div className="flex justify-between text-gray-600 pt-1">
                  <span>Data/Hora:</span>
                  <span className="font-bold text-gray-900">
                    {new Date(transaction.paidAt || Date.now()).toLocaleString('pt-BR')}
                  </span>
                </div>
              </div>

              <button
                type="button"
                onClick={() => onPaymentSuccess(transaction)}
                className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-3 px-4 rounded-xl text-sm transition shadow-md cursor-pointer"
              >
                Acompanhar Envio do Pedido
              </button>
            </div>
          ) : (
            /* Pending Payment State */
            <>
              {/* Timer Bar */}
              <div className="flex items-center justify-between bg-amber-50 border border-amber-200 rounded-xl px-4 py-2 text-xs">
                <div className="flex items-center gap-2 text-amber-900 font-bold">
                  <Clock className="w-4 h-4 text-amber-700 animate-pulse" />
                  <span>Expira em:</span>
                </div>
                <span className="font-mono font-black text-amber-800 text-sm">{formattedTime}</span>
              </div>

              {/* QR Code Container */}
              <div className="flex flex-col items-center justify-center p-4 bg-gray-50 border border-gray-200 rounded-2xl">
                {transaction.qrCodeDataUrl ? (
                  <div className="relative group">
                    <img
                      src={transaction.qrCodeDataUrl}
                      alt="Pix QR Code"
                      className="w-56 h-56 rounded-xl border border-white shadow-md bg-white p-2"
                    />
                    <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                      <div className="bg-white/95 rounded-full p-1.5 shadow-sm border border-gray-200">
                        <QrCode className="w-6 h-6 text-emerald-700" />
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="w-56 h-56 bg-gray-200 rounded-xl flex items-center justify-center text-gray-400">
                    Carregando QR Code...
                  </div>
                )}

                <span className="text-[11px] text-gray-500 font-semibold mt-2 flex items-center gap-1">
                  <Smartphone className="w-3.5 h-3.5" /> Aponte a câmera do app do seu banco
                </span>
              </div>

              {/* Pix Copia e Cola Block */}
              <div className="space-y-1.5">
                <label className="block text-xs font-bold text-gray-800">
                  Ou pague pelo Pix Copia e Cola:
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    readOnly
                    value={transaction.brCode}
                    onClick={(e) => (e.target as HTMLInputElement).select()}
                    className="w-full px-3 py-2 bg-gray-100 border border-gray-300 rounded-xl text-xs font-mono text-gray-700 truncate select-all focus:outline-hidden"
                  />
                  <button
                    type="button"
                    onClick={handleCopyPixCode}
                    className={`px-4 py-2 rounded-xl text-xs font-bold transition flex items-center gap-1.5 shrink-0 shadow-xs cursor-pointer ${
                      copied
                        ? 'bg-emerald-600 text-white'
                        : 'bg-gray-900 hover:bg-black text-white'
                    }`}
                  >
                    {copied ? (
                      <>
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        Copiado!
                      </>
                    ) : (
                      <>
                        <Copy className="w-3.5 h-3.5" />
                        Copiar Código
                      </>
                    )}
                  </button>
                </div>
              </div>

              {/* Status Polling Live Indicator */}
              <div className="flex items-center justify-between p-3 bg-emerald-50/60 border border-emerald-200/80 rounded-xl text-xs">
                <div className="flex items-center gap-2 text-emerald-950 font-semibold">
                  <span className="relative flex h-2.5 w-2.5">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-600"></span>
                  </span>
                  <span>Aguardando identificação bancária...</span>
                </div>
                <button
                  type="button"
                  onClick={handleManualCheck}
                  disabled={isChecking}
                  className="text-emerald-700 hover:text-emerald-900 text-[11px] font-bold flex items-center gap-1 cursor-pointer disabled:opacity-50"
                  title="Verificar se o banco já processou"
                >
                  <RefreshCw className={`w-3 h-3 ${isChecking ? 'animate-spin' : ''}`} />
                  Verificar
                </button>
              </div>

              {/* Simulation Action Button for Easy Demo & Testing */}
              <div className="pt-2 border-t border-gray-100 space-y-2">
                <button
                  type="button"
                  onClick={handleSimulatePayment}
                  disabled={isSimulating}
                  className="w-full py-2.5 px-3 bg-blue-50 hover:bg-blue-100 text-blue-800 border border-blue-200 rounded-xl text-xs font-bold transition flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
                >
                  <Zap className="w-3.5 h-3.5 text-blue-600" />
                  {isSimulating
                    ? 'Simulando liquidação no Banco Central...'
                    : '⚡ Simular Pagamento Bancário (Teste Imediato)'}
                </button>
              </div>

              {/* Instructions */}
              <div className="bg-gray-50 rounded-xl p-3 text-[11px] text-gray-600 space-y-1">
                <p className="font-bold text-gray-800">Como pagar:</p>
                <ol className="list-decimal list-inside space-y-0.5 text-gray-600 pl-1">
                  <li>Abra o aplicativo do seu banco (Nubank, Itaú, Inter, Bradesco, etc.).</li>
                  <li>Escolha <strong>Pagar com Pix</strong> &gt; <strong>Pix Copia e Cola</strong> ou <strong>Ler QR Code</strong>.</li>
                  <li>Confirme os dados e finalize a transferência.</li>
                </ol>
              </div>
            </>
          )}
        </div>

        {/* Footer info */}
        <div className="px-6 py-3 bg-gray-50 border-t border-gray-100 flex items-center justify-between text-[11px] text-gray-500">
          <span className="flex items-center gap-1 font-semibold text-emerald-700">
            <Lock className="w-3.5 h-3.5" /> Proteção Escrow Nusali
          </span>
          <span className="font-mono text-[10px]">ID: {transaction.txid}</span>
        </div>
      </div>
    </div>
  );
};
