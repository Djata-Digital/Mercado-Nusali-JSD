import React, { useState } from 'react';
import {
  RotateCcw,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  FileText,
  Clock,
  Search,
  Filter,
  DollarSign,
  Truck,
  Image as ImageIcon,
  MessageSquare,
  ArrowRight,
  ShieldCheck,
  RefreshCw,
  Eye,
  Printer,
} from 'lucide-react';
import { CurrencyCode } from '../../types';
import { ShippingLabelModal, ShippingLabelData } from '../common/ShippingLabelModal';

interface SellerReturnsManagerProps {
  showToast: (msg: string) => void;
  selectedCurrency?: CurrencyCode;
}

export type ReturnStatus = 'pending' | 'approved' | 'in_transit' | 'received' | 'refunded' | 'disputed';

interface ReturnItem {
  id: string;
  orderId: string;
  buyerName: string;
  buyerEmail: string;
  productTitle: string;
  productImage: string;
  amount: number;
  currency: string;
  reason: string;
  requestDate: string;
  status: ReturnStatus;
  evidenceUrls: string[];
  timeline: { title: string; date: string; done: boolean }[];
  financialImpact: { refundAmount: number; returnShippingFee: number; netDeduction: number };
}

export const SellerReturnsManager: React.FC<SellerReturnsManagerProps> = ({ showToast }) => {
  const [activeTab, setActiveTab] = useState<ReturnStatus | 'all'>('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedReturn, setSelectedReturn] = useState<ReturnItem | null>(null);
  const [activeLabelData, setActiveLabelData] = useState<ShippingLabelData | null>(null);

  const getReturnLabelData = (item: ReturnItem): ShippingLabelData => ({
    shipmentId: `ret_${item.id}`,
    trackingNumber: `RET-NSL-${item.id.replace(/\D/g, '') || '9821'}`,
    orderNumber: item.orderId,
    fulfillmentMode: 'REVERSE_LOGISTICS',
    productTitle: `Devolução: ${item.productTitle}`,
    quantity: 1,
    carrier: 'Logística Reversa Nusali',
    recipientName: 'Devolução / Armazém de Retorno',
    recipientAddress: {
      street: 'Av. dos Combatentes da Liberdade',
      neighborhood: 'HUB Bandim',
      city: 'Bissau',
      countryCode: 'GW',
      phone: '+245955000111',
    },
    senderName: item.buyerName,
    senderAddress: {
      street: 'Endereço do Comprador',
      city: 'Bissau',
      countryCode: 'GW',
    },
  });

  const [returnsList, setReturnsList] = useState<ReturnItem[]>([]);

  const handleAction = (id: string, newStatus: ReturnStatus, actionName: string) => {
    setReturnsList(prev => prev.map(item => item.id === id ? { ...item, status: newStatus } : item));
    showToast(`Ação "${actionName}" executada com sucesso para a devolução ${id}`);
    if (selectedReturn && selectedReturn.id === id) {
      setSelectedReturn(prev => prev ? { ...prev, status: newStatus } : null);
    }
  };

  const filteredReturns = returnsList.filter(item => {
    const matchesTab = activeTab === 'all' || item.status === activeTab;
    const matchesSearch = item.id.toLowerCase().includes(searchTerm.toLowerCase()) ||
                          item.buyerName.toLowerCase().includes(searchTerm.toLowerCase()) ||
                          item.orderId.toLowerCase().includes(searchTerm.toLowerCase()) ||
                          item.productTitle.toLowerCase().includes(searchTerm.toLowerCase());
    return matchesTab && matchesSearch;
  });

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="bg-white rounded-2xl p-6 border border-gray-200 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-gray-900 flex items-center gap-2">
            <RotateCcw className="w-6 h-6 text-emerald-600" />
            Gestor de Devoluções e Reembolsos
          </h1>
          <p className="text-xs text-gray-500 mt-1">
            Gerencie solicitações de devolução, frete reverso da Nusali Logística e autorizações de reembolso.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <div className="bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-2 text-right">
            <p className="text-[10px] font-bold text-emerald-800 uppercase tracking-wider">Devoluções Pendentes</p>
            <p className="text-lg font-black text-emerald-900">
              {returnsList.filter(r => r.status === 'pending').length} solicitações
            </p>
          </div>
        </div>
      </div>

      {/* Tabs & Search */}
      <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-xs space-y-4">
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 border-b border-gray-100 pb-3">
          {/* Status Tabs */}
          <div className="flex items-center gap-1 overflow-x-auto w-full sm:w-auto pb-1 sm:pb-0 no-scrollbar">
            {[
              { id: 'all', label: 'Todas' },
              { id: 'pending', label: 'Pendentes' },
              { id: 'approved', label: 'Aprovadas' },
              { id: 'in_transit', label: 'Em Trânsito' },
              { id: 'received', label: 'Recebidas' },
              { id: 'refunded', label: 'Reembolsadas' },
              { id: 'disputed', label: 'Em Disputa' },
            ].map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)}
                className={`px-3 py-1.5 text-xs font-bold rounded-lg transition whitespace-nowrap ${
                  activeTab === tab.id
                    ? 'bg-emerald-600 text-white shadow-xs'
                    : 'text-gray-600 hover:bg-gray-100'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Search Box */}
          <div className="relative w-full sm:w-64">
            <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Buscar por comprador, ID, pedido..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-9 pr-3 py-1.5 text-xs border border-gray-300 rounded-lg focus:outline-hidden focus:ring-2 focus:ring-emerald-500"
            />
          </div>
        </div>

        {/* Returns Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-gray-50 text-gray-500 uppercase text-[10px] font-bold border-b border-gray-200">
              <tr>
                <th className="p-3">ID / Pedido</th>
                <th className="p-3">Comprador</th>
                <th className="p-3">Produto</th>
                <th className="p-3">Motivo</th>
                <th className="p-3">Valor Solicitado</th>
                <th className="p-3">Status</th>
                <th className="p-3 text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 font-medium">
              {filteredReturns.length === 0 ? (
                <tr>
                  <td colSpan={7} className="text-center py-8 text-gray-400">
                    Nenhuma solicitação de devolução encontrada neste filtro.
                  </td>
                </tr>
              ) : (
                filteredReturns.map(item => (
                  <tr key={item.id} className="hover:bg-gray-50 transition">
                    <td className="p-3">
                      <p className="font-bold text-gray-900">{item.id}</p>
                      <p className="text-[10px] text-gray-400">{item.orderId}</p>
                    </td>
                    <td className="p-3">
                      <p className="font-bold text-gray-900">{item.buyerName}</p>
                      <p className="text-[10px] text-gray-500">{item.buyerEmail}</p>
                    </td>
                    <td className="p-3">
                      <div className="flex items-center gap-2 max-w-xs">
                        <img src={item.productImage} alt="" className="w-8 h-8 rounded border object-cover shrink-0" />
                        <span className="truncate text-gray-800 font-medium">{item.productTitle}</span>
                      </div>
                    </td>
                    <td className="p-3 max-w-xs">
                      <p className="truncate text-gray-600 italic">"{item.reason}"</p>
                    </td>
                    <td className="p-3 font-bold text-gray-900">
                      {item.currency} {item.amount.toLocaleString()}
                    </td>
                    <td className="p-3">
                      <span className={`inline-block px-2.5 py-1 rounded-full text-[10px] font-extrabold uppercase ${
                        item.status === 'pending' ? 'bg-amber-100 text-amber-800 border border-amber-200' :
                        item.status === 'approved' ? 'bg-blue-100 text-blue-800 border border-blue-200' :
                        item.status === 'in_transit' ? 'bg-purple-100 text-purple-800 border border-purple-200' :
                        item.status === 'received' ? 'bg-teal-100 text-teal-800 border border-teal-200' :
                        item.status === 'refunded' ? 'bg-emerald-100 text-emerald-800 border border-emerald-200' :
                        'bg-red-100 text-red-800 border border-red-200'
                      }`}>
                        {item.status.replace('_', ' ')}
                      </span>
                    </td>
                    <td className="p-3 text-right">
                      <button
                        onClick={() => setSelectedReturn(item)}
                        className="bg-emerald-50 text-emerald-700 hover:bg-emerald-100 font-bold px-3 py-1.5 rounded-lg border border-emerald-200 transition inline-flex items-center gap-1"
                      >
                        <Eye className="w-3.5 h-3.5" /> Analisar
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Return Detail Modal */}
      {selectedReturn && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-3xl w-full max-h-[90vh] overflow-y-auto p-6 space-y-6 border border-gray-200 shadow-2xl">
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-gray-200 pb-4">
              <div>
                <h3 className="text-lg font-black text-gray-900">Análise de Devolução #{selectedReturn.id}</h3>
                <p className="text-xs text-gray-500">Pedido associado: {selectedReturn.orderId} • {selectedReturn.requestDate}</p>
              </div>
              <button
                onClick={() => setSelectedReturn(null)}
                className="p-1 hover:bg-gray-100 rounded-full text-gray-500"
              >
                <XCircle className="w-6 h-6" />
              </button>
            </div>

            {/* Buyer & Product Overview */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 bg-gray-50 p-4 rounded-xl border border-gray-200">
              <div>
                <p className="text-[10px] font-bold text-gray-400 uppercase">Comprador</p>
                <p className="text-sm font-bold text-gray-900">{selectedReturn.buyerName}</p>
                <p className="text-xs text-gray-600">{selectedReturn.buyerEmail}</p>
              </div>
              <div>
                <p className="text-[10px] font-bold text-gray-400 uppercase">Impacto Financeiro Estimado</p>
                <p className="text-sm font-black text-red-600">
                  - {selectedReturn.currency} {selectedReturn.financialImpact.netDeduction.toLocaleString()}
                </p>
                <p className="text-[10px] text-gray-500">Inclui reembolso e taxa de devolução reversa.</p>
              </div>
            </div>

            {/* Reason & Evidence */}
            <div className="space-y-3">
              <h4 className="text-xs font-extrabold text-gray-900 uppercase">Motivo Alegado</h4>
              <p className="p-3 bg-amber-50 text-amber-900 rounded-lg border border-amber-200 text-xs italic">
                "{selectedReturn.reason}"
              </p>

              {selectedReturn.evidenceUrls.length > 0 && (
                <div className="space-y-2">
                  <h4 className="text-xs font-extrabold text-gray-900 uppercase flex items-center gap-1">
                    <ImageIcon className="w-4 h-4 text-emerald-600" /> Evidências Anexadas ({selectedReturn.evidenceUrls.length})
                  </h4>
                  <div className="flex gap-2">
                    {selectedReturn.evidenceUrls.map((url, i) => (
                      <img key={i} src={url} alt="" className="w-24 h-24 object-cover rounded-lg border border-gray-300" />
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Timeline Progress */}
            <div className="space-y-2">
              <h4 className="text-xs font-extrabold text-gray-900 uppercase">Linha do Tempo da Devolução</h4>
              <div className="space-y-2">
                {selectedReturn.timeline.map((step, idx) => (
                  <div key={idx} className="flex items-center gap-2 text-xs">
                    <CheckCircle2 className={`w-4 h-4 ${step.done ? 'text-emerald-600' : 'text-gray-300'}`} />
                    <span className={step.done ? 'font-bold text-gray-800' : 'text-gray-400'}>{step.title}</span>
                    <span className="text-[10px] text-gray-400 ml-auto">{step.date}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Decision Actions */}
            <div className="pt-4 border-t border-gray-200 flex flex-wrap items-center justify-between gap-2">
              <button
                type="button"
                onClick={() => setActiveLabelData(getReturnLabelData(selectedReturn))}
                className="bg-slate-800 hover:bg-slate-900 text-white font-bold text-xs px-4 py-2 rounded-lg transition flex items-center gap-1.5 cursor-pointer shadow-xs"
              >
                <Printer className="w-3.5 h-3.5 text-emerald-400" /> Visualizar Etiqueta Reversa
              </button>

              <div className="flex flex-wrap gap-2">
                <button
                  onClick={() => handleAction(selectedReturn.id, 'approved', 'Aceitar Devolução Completa')}
                  className="bg-emerald-600 text-white font-bold text-xs px-4 py-2 rounded-lg hover:bg-emerald-700 transition cursor-pointer"
                >
                  Aceitar Devolução
                </button>

                <button
                  onClick={() => handleAction(selectedReturn.id, 'pending', 'Oferecer Troca do Produto')}
                  className="bg-blue-600 text-white font-bold text-xs px-4 py-2 rounded-lg hover:bg-blue-700 transition cursor-pointer"
                >
                  Oferecer Troca
                </button>

                <button
                  onClick={() => handleAction(selectedReturn.id, 'refunded', 'Oferecer Reembolso Parcial')}
                  className="bg-amber-600 text-white font-bold text-xs px-4 py-2 rounded-lg hover:bg-amber-700 transition cursor-pointer"
                >
                  Oferecer Reembolso Parcial (50%)
                </button>

                <button
                  onClick={() => handleAction(selectedReturn.id, 'disputed', 'Contestar no Escrow')}
                  className="bg-red-600 text-white font-bold text-xs px-4 py-2 rounded-lg hover:bg-red-700 transition cursor-pointer"
                >
                  Contestar Devolução
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Printable Shipping Label Modal */}
      <ShippingLabelModal
        labelData={activeLabelData}
        onClose={() => setActiveLabelData(null)}
      />
    </div>
  );
};
