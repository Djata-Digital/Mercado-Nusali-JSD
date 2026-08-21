import React, { useState } from 'react';
import { ShoppingBag, Search, Eye, RefreshCw, AlertCircle, ShieldAlert, Truck, DollarSign } from 'lucide-react';
import { mockAdminOrdersList, AdminOrderRecord } from '../../data/mockAdminOrders';

interface AdminOrdersManagerProps {
  showToast: (msg: string) => void;
}

export const AdminOrdersManager: React.FC<AdminOrdersManagerProps> = ({ showToast }) => {
  const [orders, setOrders] = useState<AdminOrderRecord[]>(mockAdminOrdersList);
  const [searchTerm, setSearchTerm] = useState('');

  const filtered = orders.filter(o => 
    o.id.toLowerCase().includes(searchTerm.toLowerCase()) ||
    o.buyerName.toLowerCase().includes(searchTerm.toLowerCase()) ||
    o.sellerName.toLowerCase().includes(searchTerm.toLowerCase()) ||
    o.trackingCode.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-2xl p-6 border border-gray-200 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-gray-900 flex items-center gap-2">
            <ShoppingBag className="w-6 h-6 text-purple-600" />
            Gestão Global de Pedidos & Vendas
          </h1>
          <p className="text-xs text-gray-500 mt-1">
            Supervisão transacional em tempo real de compras locais na Guiné-Bissau e envios cross-border CPLP.
          </p>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-gray-200 shadow-xs p-6 space-y-4">
        <div className="relative w-full md:w-80">
          <Search className="w-4 h-4 text-gray-400 absolute left-3 top-2.5" />
          <input
            type="text"
            placeholder="Buscar por ID, comprador, loja ou rastreio..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-9 pr-3 py-2 text-xs border border-gray-300 rounded-xl focus:ring-2 focus:ring-purple-500"
          />
        </div>

        {filtered.length === 0 ? (
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
                  <th className="p-3">ID Pedido / Data</th>
                  <th className="p-3">Comprador</th>
                  <th className="p-3">Vendedor / Loja</th>
                  <th className="p-3">Rota</th>
                  <th className="p-3">Total / Meio</th>
                  <th className="p-3">Escrow</th>
                  <th className="p-3">Logística Status</th>
                  <th className="p-3 text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filtered.map(o => (
                  <tr key={o.id} className="hover:bg-gray-50/50">
                    <td className="p-3 font-extrabold text-gray-900">
                      {o.id}
                      <span className="block text-[10px] text-gray-400 font-normal">{o.date}</span>
                    </td>
                    <td className="p-3 font-bold text-gray-800">{o.buyerName}</td>
                    <td className="p-3 font-bold text-purple-700">{o.storeName} ({o.sellerName})</td>
                    <td className="p-3 font-bold text-gray-700">
                      {o.originCountry} ➔ {o.destCountry}
                    </td>
                    <td className="p-3 font-black text-emerald-700">
                      {o.totalFormatted}
                      <span className="block text-[10px] text-gray-400 font-normal">{o.paymentMethod}</span>
                    </td>
                    <td className="p-3">
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-black ${
                        o.escrowStatus === 'released' ? 'bg-emerald-100 text-emerald-800' :
                        o.escrowStatus === 'disputed' ? 'bg-red-100 text-red-800' : 'bg-amber-100 text-amber-800'
                      }`}>
                        {o.escrowStatus.toUpperCase()}
                      </span>
                    </td>
                    <td className="p-3 font-bold text-gray-800">{o.logisticsStatus}</td>
                    <td className="p-3 text-right">
                      <button
                        onClick={() => showToast(`Detalhes do pedido ${o.id} abertos.`)}
                        className="p-1.5 hover:bg-purple-50 text-purple-600 rounded-lg font-bold"
                      >
                        <Eye className="w-4 h-4" />
                      </button>
                    </td>
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
