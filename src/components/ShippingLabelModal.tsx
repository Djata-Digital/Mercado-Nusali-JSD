import React, { useRef } from 'react';
import {
  Printer,
  Download,
  Copy,
  X,
  Package,
  Truck,
  ShieldCheck,
  QrCode,
  CheckCircle2,
  ExternalLink,
  MapPin,
  Barcode,
} from 'lucide-react';
import { NusaliLogo } from './NusaliLogo';
import { countriesConfig } from '../utils/currencyUtils';

export interface ShippingLabelData {
  trackingNumber: string;
  orderNumber: string;
  serviceType?: string; // 'NUSALI EXPRESS FULL' | 'NUSALI STANDARD CPLP' | 'LOGÍSTICA REVERSA'
  routeCode?: string; // e.g. 'GW-BIS > PT-LIS > 001'
  originHub?: string;
  destinationHub?: string;
  sender: {
    name: string;
    storeName?: string;
    address: string;
    city: string;
    state?: string;
    country: string;
    phone?: string;
  };
  recipient: {
    name: string;
    address: string;
    city: string;
    state?: string;
    postalCode?: string;
    country: string;
    phone?: string;
  };
  packageInfo: {
    itemsDescription: string;
    sku?: string;
    quantity: number;
    weightKg?: string | number;
    declaredValue?: string;
    dimensions?: string;
  };
  issuedAt?: string;
}

interface ShippingLabelModalProps {
  labelData: ShippingLabelData;
  isOpen: boolean;
  onClose: () => void;
  showToast: (msg: string) => void;
}

export const ShippingLabelModal: React.FC<ShippingLabelModalProps> = ({
  labelData,
  isOpen,
  onClose,
  showToast,
}) => {
  const labelRef = useRef<HTMLDivElement | null>(null);

  if (!isOpen) return null;

  const handleCopyTracking = () => {
    navigator.clipboard.writeText(labelData.trackingNumber);
    showToast(`Código de rastreio ${labelData.trackingNumber} copiado!`);
  };

  const handlePrint = () => {
    window.print();
  };

  const handleDownload = () => {
    // Generate clean printable HTML document for download/saving
    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      showToast('Por favor, permita popups para baixar a etiqueta.');
      return;
    }

    const labelHtml = labelRef.current ? labelRef.current.outerHTML : '';
    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>Etiqueta de Envio - ${labelData.trackingNumber}</title>
          <meta charset="utf-8" />
          <script src="https://cdn.tailwindcss.com"></script>
          <style>
            @page {
              size: 100mm 150mm;
              margin: 0;
            }
            body {
              margin: 0;
              padding: 10px;
              background-color: #fff;
              font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
            }
            @media print {
              body {
                padding: 0;
              }
              .no-print {
                display: none !important;
              }
            }
          </style>
        </head>
        <body>
          <div class="flex flex-col items-center justify-center min-h-screen p-4">
            <div class="no-print mb-4 flex gap-2">
              <button onclick="window.print()" style="background:#047857; color:#fff; padding:8px 16px; border-radius:8px; font-weight:bold; font-size:14px; border:none; cursor:pointer;">
                🖨️ Imprimir / Salvar como PDF
              </button>
              <button onclick="window.close()" style="background:#e5e7eb; color:#374151; padding:8px 16px; border-radius:8px; font-weight:bold; font-size:14px; border:none; cursor:pointer;">
                Fechar
              </button>
            </div>
            ${labelHtml}
          </div>
        </body>
      </html>
    `);
    printWindow.document.close();
    showToast('Janela de impressão e download da etiqueta aberta!');
  };

  const recipientCountryConf = (countriesConfig as any)[labelData.recipient.country] || { flag: '📦', name: labelData.recipient.country };
  const senderCountryConf = (countriesConfig as any)[labelData.sender.country] || { flag: '🏢', name: labelData.sender.country };

  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-xs flex items-center justify-center p-3 sm:p-6 overflow-y-auto animate-fadeIn">
      {/* Container */}
      <div className="bg-white rounded-3xl max-w-xl w-full shadow-2xl border border-gray-100 overflow-hidden my-auto">
        {/* Modal Top Bar */}
        <div className="bg-slate-900 text-white p-4 sm:px-6 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-emerald-600 rounded-xl text-white">
              <Truck className="w-5 h-5" />
            </div>
            <div>
              <h2 className="font-black text-sm sm:text-base text-white">Etiqueta de Envio Nusali Express</h2>
              <p className="text-[11px] text-gray-400 font-mono">
                Rastreio: {labelData.trackingNumber} • {labelData.orderNumber}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleCopyTracking}
              className="p-2 bg-white/10 hover:bg-white/20 text-gray-200 rounded-xl text-xs transition cursor-pointer flex items-center gap-1"
              title="Copiar código de rastreio"
            >
              <Copy className="w-4 h-4" />
            </button>
            <button
              onClick={onClose}
              className="p-2 bg-white/10 hover:bg-red-500/20 text-gray-200 hover:text-red-400 rounded-xl transition cursor-pointer"
              title="Fechar"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Action Header Buttons */}
        <div className="bg-slate-50 border-b border-gray-200 px-6 py-3 flex items-center justify-between gap-3 flex-wrap">
          <span className="text-xs text-gray-600 font-medium">
            Formato Padrão Logístico: <strong>100mm × 150mm (A6 / Térmica)</strong>
          </span>

          <div className="flex items-center gap-2">
            <button
              onClick={handlePrint}
              className="px-4 py-2 bg-emerald-700 hover:bg-emerald-800 text-white font-bold rounded-xl text-xs transition flex items-center gap-1.5 cursor-pointer shadow-xs"
            >
              <Printer className="w-4 h-4" /> Imprimir Etiqueta
            </button>
            <button
              onClick={handleDownload}
              className="px-4 py-2 bg-slate-800 hover:bg-slate-900 text-white font-bold rounded-xl text-xs transition flex items-center gap-1.5 cursor-pointer shadow-xs"
            >
              <Download className="w-4 h-4" /> Baixar PDF / Imprimir
            </button>
          </div>
        </div>

        {/* Scrollable Printable Label Wrapper */}
        <div className="p-4 sm:p-6 max-h-[75vh] overflow-y-auto custom-scrollbar bg-slate-100 flex justify-center">
          {/* THE PHYSICAL LABEL CARD (100x150mm aspect ratio representation) */}
          <div
            ref={labelRef}
            id="shipping-label-printable"
            className="w-full max-w-[420px] bg-white border-2 border-dashed border-gray-400 p-4 rounded-xl text-black font-sans shadow-md space-y-3 print:border-none print:shadow-none print:p-2"
          >
            {/* LABEL HEADER */}
            <div className="border-b-2 border-black pb-2 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="bg-slate-950 text-yellow-400 font-black px-2 py-1 rounded-md text-xs tracking-wider">
                  NUSALI EXPRESS
                </div>
                <span className="text-[10px] font-bold text-gray-800 tracking-wider">CPLP LOGISTICS</span>
              </div>
              <div className="text-right">
                <span className="bg-black text-white font-black text-[11px] px-2 py-0.5 rounded">
                  {labelData.serviceType || 'EXPRESSO FULL'}
                </span>
              </div>
            </div>

            {/* ROUTING & HUB CODE */}
            <div className="flex items-center justify-between border-b border-black pb-2 font-mono text-xs">
              <div>
                <span className="text-[9px] text-gray-500 uppercase block font-bold">Origem &gt; Destino</span>
                <span className="font-black text-sm tracking-wide">
                  {labelData.routeCode || 'GW-BIS > GW-INT > 001'}
                </span>
              </div>
              <div className="text-right">
                <span className="text-[9px] text-gray-500 uppercase block font-bold">HUB Operacional</span>
                <span className="font-bold text-xs">{labelData.destinationHub || 'HUB-BISSAU-CENTRAL'}</span>
              </div>
            </div>

            {/* MAIN BARCODE (SVG High Resolution) */}
            <div className="bg-white p-2 border border-black rounded-sm flex flex-col items-center justify-center">
              <svg className="w-full h-14" viewBox="0 0 300 60">
                {/* Barcode Pattern SVG */}
                <rect x="5" y="0" width="3" height="50" fill="black" />
                <rect x="11" y="0" width="2" height="50" fill="black" />
                <rect x="16" y="0" width="6" height="50" fill="black" />
                <rect x="25" y="0" width="2" height="50" fill="black" />
                <rect x="30" y="0" width="4" height="50" fill="black" />
                <rect x="37" y="0" width="1" height="50" fill="black" />
                <rect x="42" y="0" width="5" height="50" fill="black" />
                <rect x="50" y="0" width="3" height="50" fill="black" />
                <rect x="56" y="0" width="2" height="50" fill="black" />
                <rect x="62" y="0" width="6" height="50" fill="black" />
                <rect x="71" y="0" width="4" height="50" fill="black" />
                <rect x="78" y="0" width="2" height="50" fill="black" />
                <rect x="83" y="0" width="5" height="50" fill="black" />
                <rect x="91" y="0" width="3" height="50" fill="black" />
                <rect x="97" y="0" width="2" height="50" fill="black" />
                <rect x="103" y="0" width="6" height="50" fill="black" />
                <rect x="112" y="0" width="4" height="50" fill="black" />
                <rect x="120" y="0" width="2" height="50" fill="black" />
                <rect x="126" y="0" width="5" height="50" fill="black" />
                <rect x="135" y="0" width="3" height="50" fill="black" />
                <rect x="142" y="0" width="2" height="50" fill="black" />
                <rect x="148" y="0" width="6" height="50" fill="black" />
                <rect x="157" y="0" width="4" height="50" fill="black" />
                <rect x="165" y="0" width="2" height="50" fill="black" />
                <rect x="171" y="0" width="5" height="50" fill="black" />
                <rect x="180" y="0" width="3" height="50" fill="black" />
                <rect x="187" y="0" width="2" height="50" fill="black" />
                <rect x="193" y="0" width="6" height="50" fill="black" />
                <rect x="202" y="0" width="4" height="50" fill="black" />
                <rect x="210" y="0" width="2" height="50" fill="black" />
                <rect x="216" y="0" width="5" height="50" fill="black" />
                <rect x="225" y="0" width="3" height="50" fill="black" />
                <rect x="232" y="0" width="2" height="50" fill="black" />
                <rect x="238" y="0" width="6" height="50" fill="black" />
                <rect x="248" y="0" width="3" height="50" fill="black" />
                <rect x="255" y="0" width="5" height="50" fill="black" />
                <rect x="264" y="0" width="2" height="50" fill="black" />
                <rect x="270" y="0" width="4" height="50" fill="black" />
                <rect x="278" y="0" width="6" height="50" fill="black" />
                <rect x="288" y="0" width="3" height="50" fill="black" />
                <rect x="294" y="0" width="2" height="50" fill="black" />
              </svg>
              <span className="font-mono font-black text-xs tracking-widest mt-1">
                {labelData.trackingNumber}
              </span>
            </div>

            {/* RECIPIENT (DESTINATÁRIO) - BOLD & CLEAR */}
            <div className="border-2 border-black p-2.5 rounded-sm bg-slate-50">
              <div className="flex items-center justify-between mb-1">
                <span className="text-[10px] font-black uppercase tracking-wider bg-black text-white px-1.5 py-0.5 rounded">
                  DESTINATÁRIO
                </span>
                <span className="text-xs font-bold">
                  {recipientCountryConf.flag} {recipientCountryConf.name}
                </span>
              </div>
              <div className="text-sm font-black text-gray-950 uppercase">
                {labelData.recipient.name}
              </div>
              <div className="text-xs text-gray-900 font-semibold mt-0.5 leading-snug">
                {labelData.recipient.address}
              </div>
              <div className="text-xs font-bold text-gray-900">
                {labelData.recipient.city} {labelData.recipient.state ? `• ${labelData.recipient.state}` : ''}{' '}
                {labelData.recipient.postalCode ? `(CEP/CP: ${labelData.recipient.postalCode})` : ''}
              </div>
              {labelData.recipient.phone && (
                <div className="text-[11px] font-mono text-gray-700 mt-1">
                  Tel: {labelData.recipient.phone}
                </div>
              )}
            </div>

            {/* SENDER (REMETENTE) */}
            <div className="border border-black p-2 rounded-sm text-[11px] bg-white">
              <span className="text-[9px] font-black uppercase text-gray-700 block mb-0.5">
                REMETENTE:
              </span>
              <div className="font-bold text-gray-900">
                {labelData.sender.storeName || labelData.sender.name} ({senderCountryConf.flag} {senderCountryConf.name})
              </div>
              <div className="text-gray-700 text-[10px]">
                {labelData.sender.address}, {labelData.sender.city}
              </div>
            </div>

            {/* PACKAGE & CUSTOMS DECLARATION */}
            <div className="border-2 border-black p-2.5 rounded-sm text-[10px] space-y-1.5 bg-gray-50">
              <div className="grid grid-cols-2 gap-2 pb-1.5 border-b border-black/30">
                <div>
                  <span className="font-bold block text-gray-600">PEDIDO / REF:</span>
                  <span className="font-mono font-black text-gray-950 text-[11px]">{labelData.orderNumber}</span>
                  <span className="font-bold block text-gray-600 mt-1">DESCRIÇÃO DO CONTEÚDO:</span>
                  <span className="font-semibold text-gray-950 block truncate">
                    {labelData.packageInfo.itemsDescription} (Qtd: {labelData.packageInfo.quantity}x)
                  </span>
                </div>
                <div className="text-right">
                  <span className="font-bold block text-gray-600">VALOR DECLARADO:</span>
                  <span className="font-mono font-bold text-gray-900">{labelData.packageInfo.declaredValue || 'Sob Cobertura Escrow'}</span>
                  <span className="font-bold block text-gray-600 mt-1">PROTOCOLO ADUANEIRO:</span>
                  <span className="font-mono font-bold text-gray-900">CPLP-ISENCAO-FACIL</span>
                </div>
              </div>

              {/* LOGISTICS WEIGHT AND DIMENSIONS HIGHLIGHT */}
              <div className="grid grid-cols-2 gap-2 pt-0.5 font-mono">
                <div className="bg-white p-1.5 border border-black rounded-xs">
                  <span className="text-[8px] font-black uppercase text-gray-600 block">⚖️ PESO LÍQ. / BRUTO</span>
                  <span className="font-black text-gray-950 text-xs">
                    {typeof labelData.packageInfo.weightKg === 'number'
                      ? `${labelData.packageInfo.weightKg.toFixed(2)} kg`
                      : labelData.packageInfo.weightKg
                      ? `${labelData.packageInfo.weightKg} kg`
                      : '0.50 kg'}
                  </span>
                </div>
                <div className="bg-white p-1.5 border border-black rounded-xs text-right">
                  <span className="text-[8px] font-black uppercase text-gray-600 block">📐 MEDIDAS (C × L × A)</span>
                  <span className="font-black text-gray-950 text-xs">
                    {labelData.packageInfo.dimensions || '20 × 15 × 10 cm'}
                  </span>
                </div>
              </div>
            </div>

            {/* QR CODE & VERIFICATION FOOTER */}
            <div className="pt-2 border-t border-black flex items-center justify-between text-[9px] text-gray-600">
              <div className="flex items-center gap-2">
                <div className="w-10 h-10 border border-black p-0.5 flex items-center justify-center bg-white">
                  <QrCode className="w-8 h-8 text-black" />
                </div>
                <div>
                  <span className="font-bold text-black block">AUTENTICAÇÃO ESCROW</span>
                  <span>Verificação CPLP via Mercado Nusali</span>
                </div>
              </div>
              <div className="text-right font-mono">
                <span>Emissão: {labelData.issuedAt || new Date().toLocaleDateString('pt-BR')}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Modal Footer */}
        <div className="bg-white border-t border-gray-200 p-4 sm:px-6 flex items-center justify-between">
          <span className="text-xs text-gray-500">
            Cole esta etiqueta na parte superior plana do pacote com fita adesiva transparente.
          </span>
          <button
            onClick={onClose}
            className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-800 font-bold rounded-xl text-xs transition cursor-pointer"
          >
            Fechar
          </button>
        </div>
      </div>
    </div>
  );
};
