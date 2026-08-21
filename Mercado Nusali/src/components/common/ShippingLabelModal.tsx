import React, { useRef, useState, useEffect } from 'react';
import { X, Printer } from 'lucide-react';
import QRCode from 'qrcode';

export interface ShippingLabelData {
  shipmentId: string;
  trackingNumber: string;
  orderNumber: string;
  carrier?: string | null;
  fulfillmentMode: string;
  productTitle: string;
  quantity: number;
  weight?: string | null;
  dimensions?: string | null;

  recipientName: string;
  recipientAddress: {
    street?: string | null;
    number?: string | null;
    complement?: string | null;
    neighborhood?: string | null;
    city?: string | null;
    state?: string | null;
    countryCode?: string | null;
    postalCode?: string | null;
    zipCode?: string | null;
    phone?: string | null;
  };

  senderName: string;
  senderAddress: {
    street?: string | null;
    number?: string | null;
    complement?: string | null;
    neighborhood?: string | null;
    city?: string | null;
    state?: string | null;
    countryCode?: string | null;
    postalCode?: string | null;
    phone?: string | null;
  };
}

interface ShippingLabelModalProps {
  labelData: ShippingLabelData | null;
  onClose: () => void;
}

export const ShippingLabelModal: React.FC<ShippingLabelModalProps> = ({ labelData, onClose }) => {
  const printRef = useRef<HTMLDivElement>(null);
  const [qrDataUrl, setQrDataUrl] = useState<string>('');
  const [qrWarning, setQrWarning] = useState<string | null>(null);

  useEffect(() => {
    if (!labelData?.trackingNumber) return;

    const envPublicUrl =
      (typeof process !== 'undefined' && (process.env?.VITE_PUBLIC_APP_URL || process.env?.PUBLIC_APP_URL || process.env?.APP_PUBLIC_URL)) ||
      (import.meta as any).env?.VITE_PUBLIC_APP_URL ||
      (import.meta as any).env?.PUBLIC_APP_URL ||
      (import.meta as any).env?.APP_PUBLIC_URL ||
      '';

    let baseUrl = envPublicUrl ? envPublicUrl.trim().replace(/\/$/, '') : '';

    if (!baseUrl && typeof window !== 'undefined') {
      const isLocalhost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
      if (!isLocalhost) {
        baseUrl = window.location.origin;
      }
    }

    if (baseUrl) {
      setQrWarning(null);
      const fullUrl = `${baseUrl}/tracking/${labelData.trackingNumber}`;
      QRCode.toDataURL(fullUrl, { margin: 1, width: 140 })
        .then((url) => setQrDataUrl(url))
        .catch(() => setQrDataUrl(''));
    } else {
      setQrDataUrl('');
      setQrWarning('URL pública de rastreamento não configurada');
    }
  }, [labelData?.trackingNumber]);

  if (!labelData) return null;

  const handlePrint = () => {
    window.print();
  };

  const isHub = labelData.fulfillmentMode === 'NUSALI_FULFILLMENT';

  return (
    <div className="fixed inset-0 bg-black/75 backdrop-blur-xs flex items-center justify-center p-4 z-50 overflow-y-auto">
      {/* Container */}
      <div className="bg-white rounded-3xl max-w-xl w-full p-6 shadow-2xl space-y-6 print:p-0 print:shadow-none print:max-w-none">

        {/* Modal Header */}
        <div className="flex items-center justify-between pb-4 border-b border-gray-100 print:hidden">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-2xl bg-emerald-50 border border-emerald-100 flex items-center justify-center text-emerald-700 font-bold">
              <Printer className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-extrabold text-gray-900 text-base">Etiqueta Oficial de Envio</h3>
              <p className="text-xs text-gray-500 font-mono">Formato A6 (10x15 cm) • Rastreio: {labelData.trackingNumber}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-gray-400 hover:text-gray-600 rounded-xl hover:bg-gray-100 transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* PRINTABLE LABEL TARGET */}
        <div ref={printRef} className="print-label-area border-2 border-dashed border-gray-300 rounded-2xl p-5 bg-white space-y-4 print:border-2 print:border-black print:rounded-none print:p-4 print:space-y-3">

          {/* Label Header */}
          <div className="flex justify-between items-center pb-3 border-b-2 border-black">
            <div>
              <span className="text-xs font-black uppercase tracking-widest text-emerald-800 font-mono block">MERCADO NUSALI</span>
              <span className="text-[10px] text-gray-600 font-semibold block">Rede Comercial & Logística CPLP</span>
            </div>
            <div className="text-right">
              <span className={`text-[10px] font-black px-2.5 py-0.5 rounded-full border ${
                isHub
                  ? 'bg-purple-50 text-purple-900 border-purple-300'
                  : 'bg-emerald-50 text-emerald-900 border-emerald-300'
              }`}>
                {isHub ? 'FULFILLMENT NUSALI HUB' : 'VENDEDOR DIRETO'}
              </span>
              <span className="text-[10px] text-gray-500 block font-mono mt-0.5">Pedido: #{labelData.orderNumber}</span>
            </div>
          </div>

          {/* Tracking Section (Real QR & Tracking Text) */}
          <div className="bg-gray-50 p-3 rounded-xl border border-gray-200 text-center space-y-1 print:bg-white print:border-black">
            <div className="flex items-center justify-between px-2">
              <span className="text-[10px] font-bold text-gray-600 uppercase">
                Transporte: {labelData.carrier || 'Transportadora não definida'}
              </span>
              <span className="text-[10px] font-mono text-gray-500">ID: {labelData.shipmentId}</span>
            </div>
            <span className="text-base font-black tracking-widest font-mono text-gray-900 block py-1">
              {labelData.trackingNumber}
            </span>
          </div>

          {/* Grid: Recipient & Sender */}
          <div className="grid grid-cols-2 gap-3 pt-1">
            {/* DESTINATÁRIO */}
            <div className="p-3 bg-emerald-50/50 rounded-xl border border-emerald-100 space-y-1 text-xs print:bg-white print:border-black">
              <span className="text-[10px] font-black uppercase text-emerald-900 tracking-wider block font-mono">
                DESTINATÁRIO (ENTREGA)
              </span>
              <p className="font-black text-gray-900 text-sm">{labelData.recipientName || 'Não informado'}</p>
              <p className="text-gray-700 font-medium leading-tight">
                {labelData.recipientAddress.street || 'Não informado'} {labelData.recipientAddress.number || ''}
                {labelData.recipientAddress.complement ? `, ${labelData.recipientAddress.complement}` : ''}
              </p>
              {labelData.recipientAddress.neighborhood && (
                <p className="text-gray-600 text-[11px]">{labelData.recipientAddress.neighborhood}</p>
              )}
              <p className="text-gray-900 font-bold">
                {labelData.recipientAddress.city || 'Não informado'}
                {labelData.recipientAddress.state ? `, ${labelData.recipientAddress.state}` : ''}
                {labelData.recipientAddress.countryCode ? ` - ${labelData.recipientAddress.countryCode}` : ''}
              </p>
              {labelData.recipientAddress.phone && (
                <p className="text-[10px] text-gray-500 font-mono pt-1">Tel: {labelData.recipientAddress.phone}</p>
              )}
            </div>

            {/* REMETENTE */}
            <div className="p-3 bg-gray-50 rounded-xl border border-gray-200 space-y-1 text-xs print:bg-white print:border-black">
              <span className="text-[10px] font-black uppercase text-gray-700 tracking-wider block font-mono">
                REMETENTE (ORIGEM)
              </span>
              <p className="font-bold text-gray-900">{labelData.senderName || 'Não informado'}</p>
              <p className="text-gray-600 leading-tight">
                {labelData.senderAddress.street || 'Não informado'} {labelData.senderAddress.number || ''}
              </p>
              <p className="text-gray-800 font-semibold">
                {labelData.senderAddress.city || 'Não informado'}
                {labelData.senderAddress.state ? `, ${labelData.senderAddress.state}` : ''}
                {labelData.senderAddress.countryCode ? ` - ${labelData.senderAddress.countryCode}` : ''}
              </p>
              {labelData.senderAddress.phone && (
                <p className="text-[10px] text-gray-500 font-mono pt-1">Contato: {labelData.senderAddress.phone}</p>
              )}
            </div>
          </div>

          {/* Package Items & Real QR Code Footer */}
          <div className="flex items-center justify-between pt-2 border-t border-gray-200 text-xs">
            <div className="space-y-0.5 max-w-[65%]">
              <span className="text-[10px] font-black uppercase text-gray-500 font-mono">Conteúdo do Pacote:</span>
              <p className="font-bold text-gray-900 truncate">
                {labelData.quantity}x {labelData.productTitle || 'Não informado'}
              </p>
              {labelData.weight && (
                <span className="text-[10px] text-gray-500 font-semibold block">Peso: {labelData.weight}</span>
              )}
            </div>

            {/* Real QR Code or Warning */}
            <div className="text-center p-1.5 bg-white rounded-xl border border-gray-200 shrink-0 print:border-black min-w-[84px]">
              {qrDataUrl ? (
                <img src={qrDataUrl} alt="QR Code de Rastreio" className="w-16 h-16 mx-auto" />
              ) : (
                <div className="w-16 h-16 bg-amber-50 text-amber-900 border border-amber-200 rounded-lg p-1 flex items-center justify-center text-[8px] font-bold text-center leading-tight">
                  {qrWarning || 'URL pública de rastreamento não configurada'}
                </div>
              )}
              <span className="text-[8px] text-gray-500 font-mono block mt-0.5">Rastreio Oficial</span>
            </div>
          </div>

        </div>

        {/* Actions (screen only) */}
        <div className="flex items-center justify-end gap-3 pt-2 border-t border-gray-100 print:hidden">
          <button
            onClick={onClose}
            className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-xl text-xs font-bold transition cursor-pointer"
          >
            Fechar
          </button>
          <button
            onClick={handlePrint}
            className="px-5 py-2.5 bg-emerald-700 hover:bg-emerald-800 text-white font-extrabold rounded-xl text-xs transition flex items-center gap-2 shadow-md shadow-emerald-900/20 cursor-pointer"
          >
            <Printer className="w-4 h-4" /> Imprimir Etiqueta A6
          </button>
        </div>

      </div>

      {/* Global Print Styles */}
      <style>{`
        @media print {
          body * {
            visibility: hidden !important;
          }
          .print-label-area, .print-label-area * {
            visibility: visible !important;
          }
          .print-label-area {
            position: absolute !important;
            left: 0 !important;
            top: 0 !important;
            width: 100% !important;
          }
        }
      `}</style>
    </div>
  );
};

