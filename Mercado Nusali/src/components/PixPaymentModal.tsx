import React, { useState, useEffect } from 'react';
import {
  QrCode,
  Copy,
  CheckCircle2,
  Clock,
  ShieldCheck,
  AlertCircle,
  RefreshCw,
  X,
  Lock,
} from 'lucide-react';
import { API_CONFIG } from '../config/api';
import { OrdersApi } from '../api/clients/OrdersApi';

export interface PixInitiateData {
  paymentId?: string;
  providerPaymentId?: string;
  method?: string;
  status?: string;
  amount?: number;
  currency?: string;
  pix?: {
    encodedImage?: string;
    payload?: string;
    expirationDate?: string;
  };
}

interface PixPaymentModalProps {
  isOpen: boolean;
  onClose: () => void;
  orderId: string;
  paymentData: PixInitiateData | null;
  onPaymentSuccess: (order: any) => void;
}

export const PixPaymentModal: React.FC<PixPaymentModalProps> = ({
  isOpen,
  onClose,
  orderId,
  paymentData,
  onPaymentSuccess,
}) => {
  const [copied, setCopied] = useState(false);
  const [paymentStatus, setPaymentStatus] = useState<string>('pending');
  const [isPollingActive, setIsPollingActive] = useState<boolean>(true);
  const [isSuccess, setIsSuccess] = useState(false);
  const isSandbox = API_CONFIG.PAYMENT_ENV === 'sandbox';

  // 1. Reset state when opened with new data
  useEffect(() => {
    if (isOpen) {
      setCopied(false);
      setPaymentStatus(paymentData?.status || 'pending');
      setIsPollingActive(true);
      setIsSuccess(false);
    }
  }, [isOpen, paymentData]);

  // 2. Controlled polling every 4 seconds for up to 5 minutes (300s = 75 ticks)
  useEffect(() => {
    if (!isOpen || !orderId || isSuccess) return;

    let totalTicks = 0;
    const maxTicks = 75; // 75 ticks * 4s = 300s = 5 minutes

    const interval = setInterval(async () => {
      totalTicks++;

      try {
        const res = await OrdersApi.getById(orderId);
        if (res.success && res.data) {
          const order = res.data;
          const status = order.paymentStatus;

          // Single Source of Truth: Financial Payment Status ONLY (paid)
          if (status === 'paid') {
            clearInterval(interval);
            setIsPollingActive(false);
            setPaymentStatus('paid');
            setIsSuccess(true);
            setTimeout(() => {
              onPaymentSuccess(order);
            }, 1200);
            return;
          } else if (status === 'failed' || status === 'expired' || status === 'overdue') {
            clearInterval(interval);
            setIsPollingActive(false);
            setPaymentStatus(status === 'overdue' ? 'expired' : status);
            return;
          }
        }
      } catch (err) {
        console.warn('Polling error on order status:', err);
      }

      // If maxTicks reached, stop active polling without artificially altering paymentStatus
      if (totalTicks >= maxTicks) {
        clearInterval(interval);
        setIsPollingActive(false);
      }
    }, 4000);

    return () => clearInterval(interval);
  }, [isOpen, orderId, isSuccess, onPaymentSuccess]);

  if (!isOpen || !paymentData) return null;

  const pixInfo = paymentData.pix;
  const qrImage = pixInfo?.encodedImage
    ? pixInfo.encodedImage.startsWith('data:')
      ? pixInfo.encodedImage
      : `data:image/png;base64,${pixInfo.encodedImage}`
    : null;

  const handleCopyCode = async () => {
    if (!pixInfo?.payload) return;
    try {
      await navigator.clipboard.writeText(pixInfo.payload);
      setCopied(true);
      setTimeout(() => setCopied(false), 3000);
    } catch (err) {
      console.error('Falha ao copiar PIX:', err);
    }
  };

  const formattedAmount = (paymentData.amount || 0).toLocaleString('pt-BR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto animate-fade-in">
      <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl space-y-5 border border-gray-100 relative">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-gray-100 pb-4">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-emerald-100 text-emerald-700 rounded-xl">
              <QrCode className="w-6 h-6" />
            </div>
            <div>
              <h3 className="font-extrabold text-gray-900 text-base">Pagamento via PIX</h3>
              <p className="text-xs text-gray-500 font-medium">Mercado Nusali - Gateway Asaas</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-gray-400 hover:text-gray-700 rounded-lg hover:bg-gray-100 transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Sandbox Badge */}
        {isSandbox && (
          <div className="bg-amber-50 border border-amber-200 text-amber-900 px-3 py-1.5 rounded-xl text-[11px] font-bold flex items-center justify-between">
            <span className="flex items-center gap-1.5">
              <span className="w-2 h-2 bg-amber-500 rounded-full animate-ping" />
              Pagamento de teste - Sandbox
            </span>
            <span className="text-[10px] text-amber-700 bg-amber-100 px-2 py-0.5 rounded-md font-mono">
              ASAAS SANDBOX
            </span>
          </div>
        )}

        {/* Success Banner */}
        {isSuccess ? (
          <div className="p-6 bg-emerald-50 border border-emerald-200 rounded-2xl text-center space-y-3">
            <CheckCircle2 className="w-12 h-12 text-emerald-600 mx-auto animate-bounce" />
            <h4 className="font-black text-emerald-900 text-lg">Pagamento aprovado com sucesso!</h4>
            <p className="text-xs text-emerald-700 font-semibold">
              O pagamento foi confirmado. Redirecionando para os detalhes do pedido...
            </p>
          </div>
        ) : (
          <>
            {/* Amount Section */}
            <div className="text-center py-2 bg-gray-50 rounded-xl border border-gray-100">
              <span className="text-xs text-gray-500 font-semibold block">Total a Pagar</span>
              <span className="text-3xl font-black text-emerald-700">R$ {formattedAmount} BRL</span>
            </div>

            {/* QR Code Section */}
            <div className="flex flex-col items-center justify-center space-y-3">
              {qrImage ? (
                <div className="p-3 bg-white border-2 border-emerald-500 rounded-2xl shadow-xs">
                  <img src={qrImage} alt="QR Code PIX Asaas" className="w-52 h-52 object-contain" />
                </div>
              ) : (
                <div className="p-8 bg-red-50 border border-red-200 text-red-700 rounded-2xl text-center text-xs font-semibold">
                  <AlertCircle className="w-8 h-8 text-red-500 mx-auto mb-2" />
                  Não foi possível carregar o QR Code. Tente novamente.
                </div>
              )}

              <p className="text-[11px] text-gray-500 font-medium text-center max-w-xs">
                Abra o app do seu banco ou carteira digital, escolha a opção <strong>PIX</strong> e escaneie o código acima.
              </p>
            </div>

            {/* Pix Copia e Cola Code */}
            {pixInfo?.payload && (
              <div className="space-y-2">
                <label className="text-xs font-bold text-gray-700 block">PIX Copia e Cola</label>
                <div className="relative">
                  <input
                    type="text"
                    readOnly
                    value={pixInfo.payload}
                    className="w-full pl-3 pr-24 py-2.5 bg-gray-50 border border-gray-300 rounded-xl text-xs font-mono text-gray-800 focus:outline-none"
                  />
                  <button
                    type="button"
                    onClick={handleCopyCode}
                    className={`absolute right-1 top-1 bottom-1 px-3 rounded-lg text-xs font-bold transition flex items-center gap-1 cursor-pointer ${
                      copied
                        ? 'bg-emerald-600 text-white'
                        : 'bg-emerald-700 hover:bg-emerald-800 text-white'
                    }`}
                  >
                    {copied ? (
                      <>
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        <span>Copiado!</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-3.5 h-3.5" />
                        <span>Copiar PIX</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            )}

            {/* Status & Expiration */}
            <div className="pt-2 border-t border-gray-100 flex items-center justify-between text-xs">
              {paymentStatus === 'expired' || paymentStatus === 'overdue' ? (
                <div className="flex items-center gap-2 text-red-600 font-bold">
                  <AlertCircle className="w-4 h-4 text-red-500" />
                  <span>PIX expirado</span>
                </div>
              ) : paymentStatus === 'failed' ? (
                <div className="flex items-center gap-2 text-red-600 font-bold">
                  <AlertCircle className="w-4 h-4 text-red-500" />
                  <span>Falha no pagamento</span>
                </div>
              ) : isPollingActive ? (
                <div className="flex items-center gap-2 text-emerald-800 font-bold">
                  <RefreshCw className="w-4 h-4 animate-spin text-emerald-600" />
                  <span>Aguardando confirmação do pagamento...</span>
                </div>
              ) : (
                <div className="flex items-center gap-2 text-amber-800 font-medium">
                  <Clock className="w-4 h-4 text-amber-600 shrink-0" />
                  <span>Aguardando confirmação. Você pode acompanhar este pagamento em Minhas Compras.</span>
                </div>
              )}
              {pixInfo?.expirationDate && (
                <span className="text-[11px] text-gray-500 font-medium shrink-0 ml-2">
                  Válido até: {new Date(pixInfo.expirationDate).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </span>
              )}
            </div>

            {/* Escrow Protection footer */}
            <div className="p-3 bg-emerald-50/70 border border-emerald-200/60 rounded-xl flex items-center gap-2 text-[11px] text-emerald-900 font-semibold">
              <Lock className="w-4 h-4 text-emerald-700 shrink-0" />
              <span>Seu valor fica protegido na conta Escrow Mercado Nusali até o recebimento do pedido.</span>
            </div>
          </>
        )}
      </div>
    </div>
  );
};
