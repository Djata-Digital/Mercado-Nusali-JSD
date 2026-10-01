import React, { useEffect, useState } from 'react';
import { ShoppingBag, Search, RefreshCw } from 'lucide-react';
import { AdminService } from '../../services/adminService';
import { formatCurrency } from '../../utils/currencyUtils';

interface AdminOrdersManagerProps {
  showToast: (msg: string) => void;
}

// FASE D18-C4.2 — conecta a tela (antes 100% mock: useState(mockAdminOrdersList)
// nunca substituído) à API real (GET /admin/orders). SOMENTE LEITURA: o botão
// "Ver detalhes" que existia antes só chamava showToast(...), sem nenhuma tela
// de detalhe real por trás — removido em vez de mantido como decoração, para
// não sugerir uma ação que não existe (mesmo critério já aplicado a
// AdminPaymentsManager em D18-C4.1). Nenhuma ação administrativa nova foi
// construída nesta fase.
interface AdminOrderRow {
  id: string;
  orderNumber: string;
  buyerName: string | null;
  sellerName: string | null;
  storeName: string | null;
  totalAmount: number;
  currency: string;
  paymentMethod: string | null;
  paymentStatus: string;
  escrowStatus: string;
  status: string;
  countryCode: string;
  sellerCountry: string | null;
  trackingCode: string | null;
  createdAt: string;
}

export const AdminOrdersManager: React.FC<AdminOrdersManagerProps> = ({ showToast }) => {
  const [orders, setOrders] = useState<AdminOrderRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    const fetchOrders = async () => {
      setIsLoading(true);
      try {
        const res = await AdminService.getOrders();
        if (res.success && Array.isArray(res.data)) {
          setOrders(res.data as AdminOrderRow[]);
        }
      } catch {
        showToast('Não foi possível carregar os pedidos agora.');
      } finally {
        setIsLoading(false);
      }
    };
    fetchOrders();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filtered = orders.filter((o) => {
    const term = searchTerm.toLowerCase();
    return (
      o.orderNumber.toLowerCase().includes(term) ||
      (o.buyerName || '').toLowerCase().includes(term) ||
      (o.sellerName || '').toLowerCase().includes(term) ||
      (o.trackingCode || '').toLowerCase().includes(term)
    );
  });

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-2xl p-6 border border-gray-200 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-gray-900 flex items-center gap-2">
            <ShoppingBag className="w-6 h-6 text-purple-600" />
            Gestão Global de Pedidos
          </h1>
          <p className="text-xs text-gray-500 mt-1">
            Visão somente leitura dos pedidos reais da plataforma.
          </p>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-gray-200 shadow-xs p-6 space-y-4">
        <div className="relative w-full md:w-80">
          <Search className="w-4 h-4 text-gray-400 absolute left-3 top-2.5" />
          <input
            type="text"
            placeholder="Buscar por pedido, comprador, vendedor ou rastreio..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-9 pr-3 py-2 text-xs border border-gray-300 rounded-xl focus:ring-2 focus:ring-purple-500"
          />
        </div>

        {isLoading ? (
          <div className="p-12 text-center text-gray-400 font-bold flex items-center justify-center gap-2">
            <RefreshCw className="w-4 h-4 animate-spin" /> Carregando pedidos...
          </div>
        ) : filtered.length === 0 ? (
          <div className="p-12 text-center text-gray-400 space-y-2">
            <ShoppingBag className="w-10 h-10 mx-auto text-gray-300 stroke-1" />
            <p className="font-bold text-sm text-gray-600">Nenhum pedido encontrado</p>
            <p className="text-xs text-gray-400 max-w-sm mx-auto">
              Não existem registros de compras ou vendas ativas na plataforma até o momento.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200 text-gray-500 uppercase font-black text-[10px]">
                  <th className="p-3">Pedido / Data</th>
                  <th className="p-3">Comprador</th>
                  <th className="p-3">Vendedor / Loja</th>
                  <th className="p-3">Total / Meio</th>
                  <th className="p-3">Escrow</th>
                  <th className="p-3">Status do Pedido</th>
                  <th className="p-3">Rastreio</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filtered.map((o) => (
                  <tr key={o.id} className="hover:bg-gray-50/50">
                    <td className="p-3 font-extrabold text-gray-900">
                      {o.orderNumber}
                      <span className="block text-[10px] text-gray-400 font-normal">{new Date(o.createdAt).toLocaleDateString('pt-BR')}</span>
                    </td>
                    <td className="p-3 font-bold text-gray-800">{o.buyerName || '—'}</td>
                    <td className="p-3 font-bold text-purple-700">{o.storeName || o.sellerName || '—'}</td>
                    <td className="p-3 font-black text-emerald-700">
                      {formatCurrency(o.totalAmount, o.currency)}
                      <span className="block text-[10px] text-gray-400 font-normal">{o.paymentMethod || '—'}</span>
                    </td>
                    <td className="p-3">
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-black ${
                        o.escrowStatus === 'released' ? 'bg-emerald-100 text-emerald-800' :
                        o.escrowStatus === 'disputed' || o.escrowStatus === 'refunded' ? 'bg-red-100 text-red-800' : 'bg-amber-100 text-amber-800'
                      }`}>
                        {o.escrowStatus.toUpperCase()}
                      </span>
                    </td>
                    <td className="p-3 font-bold text-gray-800">{o.status}</td>
                    <td className="p-3 font-mono text-gray-600">{o.trackingCode || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
