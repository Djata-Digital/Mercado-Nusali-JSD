import React, { useState } from 'react';
import { Users, Search, ShoppingBag, DollarSign, Star, Mail, Tag } from 'lucide-react';

interface SellerCustomersProps {
  showToast: (msg: string) => void;
  customers?: any[];
}

export const SellerCustomers: React.FC<SellerCustomersProps> = ({ showToast, customers }) => {
  const [searchTerm, setSearchTerm] = useState('');

  const list = customers || [];

  const filtered = list.filter((c: any) =>
    c.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    c.email.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-2xl p-6 border border-gray-200 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-gray-900 flex items-center gap-2">
            <Users className="w-6 h-6 text-emerald-600" />
            Base de Clientes & CRM do Vendedor
          </h1>
          <p className="text-xs text-gray-500 mt-1">
            Histórico de compradores, total gasto acumulado e segmentação por país e fidelidade.
          </p>
        </div>

        <div className="relative w-full md:w-64">
          <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Buscar por cliente ou e-mail..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-9 pr-3 py-2 text-xs border border-gray-300 rounded-xl focus:ring-2 focus:ring-emerald-500"
          />
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-gray-200 shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-gray-50 text-gray-500 uppercase text-[10px] font-bold border-b border-gray-200">
              <tr>
                <th className="p-3">Cliente</th>
                <th className="p-3">País</th>
                <th className="p-3">Total de Pedidos</th>
                <th className="p-3">Total Acumulado</th>
                <th className="p-3">Nível Fidelidade</th>
                <th className="p-3 text-right">Ação</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 font-medium">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={6} className="p-8 text-center text-gray-400">
                    Nenhum cliente cadastrado na sua base de compradores no momento.
                  </td>
                </tr>
              ) : (
                filtered.map((c: any) => (
                <tr key={c.id}>
                  <td className="p-3">
                    <p className="font-bold text-gray-900">{c.name}</p>
                    <p className="text-[10px] text-gray-400">{c.email}</p>
                  </td>
                  <td className="p-3 font-bold text-gray-700">{c.country}</td>
                  <td className="p-3 font-bold text-gray-900">{c.totalOrders} pedidos</td>
                  <td className="p-3 font-black text-emerald-800">{c.totalSpent}</td>
                  <td className="p-3">
                    <span className="bg-emerald-100 text-emerald-800 font-extrabold text-[10px] px-2.5 py-1 rounded-full uppercase">
                      {c.tier}
                    </span>
                  </td>
                  <td className="p-3 text-right">
                    <button
                      onClick={() => showToast(`Cupom exclusivo enviado para o cliente ${c.name}`)}
                      className="bg-emerald-50 text-emerald-700 font-bold text-xs px-3 py-1.5 rounded-lg border border-emerald-200 hover:bg-emerald-100 transition"
                    >
                      Enviar Cupom VIP
                    </button>
                  </td>
                </tr>
              )))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
