import React, { useEffect, useState } from 'react';
import { Users, Search, Loader2 } from 'lucide-react';
import { formatCurrency } from '../../utils/currencyUtils';
import { CurrencyCode } from '../../types';
import { SellerService } from '../../services/sellerService';

interface SellerCustomer {
  buyerId: string;
  displayName: string | null;
  country: string | null;
  totalOrders: number;
  totalSpent: number;
  currency: string;
  lastPurchaseAt: string | null;
}

interface SellerCustomersProps {
  showToast: (msg: string) => void;
}

// Meus Clientes (Fase 1 Operacional): CRM mínimo real, agregado a partir dos
// pedidos pagos do próprio vendedor (GET /seller/customers ->
// computeSellerCustomers no backend). Deliberadamente NÃO exibe e-mail,
// telefone, CPF/documento ou endereço de entrega — esses dados operacionais
// ficam restritos à visão do pedido específico, não a este CRM geral.
export const SellerCustomers: React.FC<SellerCustomersProps> = ({ showToast }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [customers, setCustomers] = useState<SellerCustomer[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const fetchCustomers = async () => {
      setIsLoading(true);
      try {
        const res = await SellerService.getCustomers();
        if (!cancelled && res.success && Array.isArray(res.data)) {
          setCustomers(res.data);
        }
      } catch (err) {
        console.error('Error fetching seller customers:', err);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    };
    fetchCustomers();
    return () => { cancelled = true; };
  }, []);

  const filtered = customers.filter((c) =>
    (c.displayName || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
    (c.country || '').toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-2xl p-6 border border-gray-200 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-gray-900 flex items-center gap-2">
            <Users className="w-6 h-6 text-emerald-600" />
            Meus Clientes
          </h1>
          <p className="text-xs text-gray-500 mt-1">
            Compradores com pedidos pagos na sua loja, total de pedidos e valor acumulado gasto.
          </p>
        </div>

        <div className="relative w-full md:w-64">
          <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Buscar por nome ou país..."
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
                <th className="p-3">Última Compra</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 font-medium">
              {isLoading ? (
                <tr>
                  <td colSpan={5} className="p-8 text-center text-gray-400">
                    <Loader2 className="w-5 h-5 animate-spin mx-auto mb-2" />
                    Carregando clientes...
                  </td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={5} className="p-8 text-center text-gray-400">
                    Nenhum cliente com pedido pago na sua base de compradores no momento.
                  </td>
                </tr>
              ) : (
                filtered.map((c) => (
                  <tr key={`${c.buyerId}:${c.currency}`}>
                    <td className="p-3">
                      <p className="font-bold text-gray-900">{c.displayName || 'Cliente'}</p>
                    </td>
                    <td className="p-3 font-bold text-gray-700">{c.country || 'Não informado'}</td>
                    <td className="p-3 font-bold text-gray-900">{c.totalOrders} pedido(s)</td>
                    <td className="p-3 font-black text-emerald-800">
                      {formatCurrency(c.totalSpent, c.currency as CurrencyCode)}
                    </td>
                    <td className="p-3 text-gray-600">
                      {c.lastPurchaseAt ? new Date(c.lastPurchaseAt).toLocaleDateString('pt-BR') : '—'}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
