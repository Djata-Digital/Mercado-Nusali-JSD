import React, { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import {
  Truck,
  Package,
  MapPin,
  CheckCircle2,
  Clock,
  ArrowLeft,
  Copy,
  RefreshCw,
  ShieldCheck,
  AlertTriangle,
  RotateCcw,
} from 'lucide-react';
import axios from 'axios';

interface PublicTrackingEvent {
  status: string;
  description: string;
  location?: string | null;
  eventTime: string;
}

interface PublicTrackingData {
  trackingNumber: string;
  status: string;
  carrier?: string | null;
  fulfillmentMode: string;
  productTitle?: string | null;
  quantity?: number;
  originCity?: string | null;
  originCountry?: string | null;
  destinationCity?: string | null;
  destinationCountry?: string | null;
  shippedAt?: string | null;
  deliveredAt?: string | null;
  timeline: PublicTrackingEvent[];
}

export const TrackingPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const [tracking, setTracking] = useState<PublicTrackingData | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<boolean>(false);

  const fetchTracking = async () => {
    if (!id) return;
    setLoading(true);
    setError(null);
    try {
      const res = await axios.get(`/api/v1/tracking/${id}`);
      if (res.data?.success && res.data?.data) {
        setTracking(res.data.data);
      } else {
        setError(res.data?.error?.message || 'Código de rastreamento não encontrado.');
      }
    } catch (err: any) {
      setError(err?.response?.data?.error?.message || err?.message || 'Rastreamento não encontrado.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTracking();
  }, [id]);

  const copyTrackingNumber = () => {
    if (tracking?.trackingNumber) {
      navigator.clipboard.writeText(tracking.trackingNumber);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const statusBadge = (st: string) => {
    const s = (st || '').toUpperCase();
    switch (s) {
      case 'READY_TO_SHIP':
        return <span className="bg-sky-100 text-sky-800 text-xs font-black px-3 py-1 rounded-full border border-sky-200">AGUARDANDO EXPEDIÇÃO</span>;
      case 'SHIPPED':
        return <span className="bg-amber-100 text-amber-800 text-xs font-black px-3 py-1 rounded-full border border-amber-200">DESPACHADO</span>;
      case 'IN_TRANSIT':
        return <span className="bg-blue-100 text-blue-800 text-xs font-black px-3 py-1 rounded-full border border-blue-200">EM TRANSPORTE</span>;
      case 'OUT_FOR_DELIVERY':
        return <span className="bg-purple-100 text-purple-800 text-xs font-black px-3 py-1 rounded-full border border-purple-200">SAIU PARA ENTREGA</span>;
      case 'DELIVERED':
        return <span className="bg-emerald-100 text-emerald-800 text-xs font-black px-3 py-1 rounded-full border border-emerald-200">ENTREGUE</span>;
      case 'DELIVERY_FAILED':
        return <span className="bg-rose-100 text-rose-800 text-xs font-black px-3 py-1 rounded-full border border-rose-200">FALHA NA ENTREGA</span>;
      case 'RETURNING':
        return <span className="bg-orange-100 text-orange-800 text-xs font-black px-3 py-1 rounded-full border border-orange-200">EM DEVOLUÇÃO</span>;
      case 'RETURNED':
        return <span className="bg-gray-200 text-gray-800 text-xs font-black px-3 py-1 rounded-full border border-gray-300">DEVOLVIDO</span>;
      default:
        return <span className="bg-gray-100 text-gray-700 text-xs font-black px-3 py-1 rounded-full border border-gray-200">{s}</span>;
    }
  };

  return (
    <div className="min-h-screen bg-gray-50/50 py-10 px-4 sm:px-6 lg:px-8">
      <div className="max-w-4xl mx-auto space-y-6">

        {/* Top Navigation */}
        <div className="flex items-center justify-between">
          <Link
            to="/"
            className="inline-flex items-center gap-2 text-xs font-extrabold text-gray-600 hover:text-emerald-700 transition"
          >
            <ArrowLeft className="w-4 h-4" /> Voltar para o Mercado Nusali
          </Link>
          <div className="flex items-center gap-1 text-[11px] font-bold text-emerald-800 bg-emerald-50 px-3 py-1 rounded-full border border-emerald-200">
            <ShieldCheck className="w-3.5 h-3.5" /> Rastreamento Oficial Protegido
          </div>
        </div>

        {loading ? (
          <div className="bg-white rounded-3xl p-12 border border-gray-200 text-center space-y-3 shadow-xs">
            <RefreshCw className="w-10 h-10 text-emerald-600 animate-spin mx-auto" />
            <p className="text-sm font-bold text-gray-700">Buscando informações do envio...</p>
          </div>
        ) : error || !tracking ? (
          <div className="bg-white rounded-3xl p-10 border border-gray-200 text-center space-y-4 shadow-xs">
            <AlertTriangle className="w-12 h-12 text-rose-500 mx-auto" />
            <div>
              <h2 className="text-xl font-black text-gray-900">Código de Rastreamento Não Encontrado</h2>
              <p className="text-xs text-gray-500 mt-1 max-w-md mx-auto">{error}</p>
            </div>
            <Link
              to="/"
              className="inline-block bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-extrabold px-6 py-2.5 rounded-xl transition"
            >
              Ir para o Início
            </Link>
          </div>
        ) : (
          <div className="space-y-6 animate-fadeIn">
            {/* Header Card */}
            <div className="bg-slate-900 text-white rounded-3xl p-6 sm:p-8 shadow-xl space-y-6">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-800 pb-6">
                <div>
                  <span className="text-[10px] font-black uppercase tracking-widest text-emerald-400 font-mono block">
                    {tracking.fulfillmentMode === 'NUSALI_FULFILLMENT' ? 'Fulfillment Nusali HUB' : 'Vendedor Direto'}
                  </span>
                  <h1 className="text-2xl sm:text-3xl font-black mt-1">Rastreamento de Envio</h1>
                </div>
                <div>{statusBadge(tracking.status)}</div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs font-mono">
                <div className="bg-slate-800/80 p-4 rounded-2xl border border-slate-700/80 flex items-center justify-between">
                  <div>
                    <span className="text-[10px] text-slate-400 block uppercase font-sans font-bold">Código de Rastreio</span>
                    <span className="text-base font-black text-amber-400 tracking-wider block mt-0.5">{tracking.trackingNumber}</span>
                  </div>
                  <button
                    onClick={copyTrackingNumber}
                    className="p-2 bg-slate-700 hover:bg-slate-600 rounded-xl text-slate-200 transition cursor-pointer"
                    title="Copiar Código"
                  >
                    <Copy className="w-4 h-4" />
                  </button>
                </div>

                <div className="bg-slate-800/80 p-4 rounded-2xl border border-slate-700/80">
                  <span className="text-[10px] text-slate-400 block uppercase font-sans font-bold">Transportadora</span>
                  <span className="text-sm font-bold text-slate-100 block mt-1">
                    {tracking.carrier || 'Transportadora não definida'}
                  </span>
                </div>
              </div>
            </div>

            {/* Package & Route Summary */}
            <div className="bg-white rounded-3xl border border-gray-200 p-6 shadow-xs space-y-6">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-gray-100 pb-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-2xl bg-emerald-50 text-emerald-700 border border-emerald-100 flex items-center justify-center font-bold">
                    <Package className="w-5 h-5" />
                  </div>
                  <div>
                    <span className="text-[10px] font-black text-gray-400 uppercase font-mono block">Conteúdo</span>
                    <p className="font-extrabold text-gray-900 text-sm">
                      {tracking.quantity || 1}x {tracking.productTitle || 'Não informado'}
                    </p>
                  </div>
                </div>

                {/* Route */}
                <div className="flex items-center gap-4 text-xs font-semibold bg-gray-50 p-3 rounded-2xl border border-gray-100">
                  <div>
                    <span className="text-[9px] text-gray-400 font-mono block uppercase">Origem</span>
                    <span className="text-gray-900 font-bold">
                      {tracking.originCity || 'Não informado'}
                      {tracking.originCountry ? ` (${tracking.originCountry})` : ''}
                    </span>
                  </div>
                  <Truck className="w-4 h-4 text-emerald-600 shrink-0" />
                  <div>
                    <span className="text-[9px] text-gray-400 font-mono block uppercase">Destino</span>
                    <span className="text-gray-900 font-bold">
                      {tracking.destinationCity || 'Não informado'}
                      {tracking.destinationCountry ? ` (${tracking.destinationCountry})` : ''}
                    </span>
                  </div>
                </div>
              </div>

              {/* Real Timeline */}
              <div className="space-y-4">
                <h3 className="font-extrabold text-gray-900 text-sm flex items-center gap-2">
                  <Clock className="w-4 h-4 text-emerald-700" /> Histórico do Transporte
                </h3>

                {tracking.timeline.length === 0 ? (
                  <p className="text-xs text-gray-400 py-4 text-center">Envio ainda não iniciado. Nenhum evento registrado.</p>
                ) : (
                  <div className="relative border-l-2 border-emerald-200 ml-4 space-y-6 py-2">
                    {tracking.timeline.map((evt, idx) => (
                      <div key={idx} className="relative pl-6">
                        <div className="absolute -left-[9px] top-1 w-4 h-4 rounded-full bg-emerald-600 border-2 border-white ring-2 ring-emerald-200" />
                        <div className="bg-gray-50 p-4 rounded-2xl border border-gray-100 space-y-1">
                          <div className="flex items-center justify-between flex-wrap gap-2">
                            <span className="font-extrabold text-gray-900 text-xs">{evt.status}</span>
                            <span className="text-[10px] font-mono font-medium text-gray-500">
                              {evt.eventTime ? new Date(evt.eventTime).toLocaleString('pt-BR') : '-'}
                            </span>
                          </div>
                          <p className="text-xs text-gray-600">{evt.description}</p>
                          {evt.location && (
                            <span className="text-[10px] text-gray-400 flex items-center gap-1 font-medium pt-1">
                              <MapPin className="w-3 h-3 text-gray-400" /> {evt.location}
                            </span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

      </div>
    </div>
  );
};
