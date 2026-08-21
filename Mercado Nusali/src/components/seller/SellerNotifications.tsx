import React, { useState } from 'react';
import { Bell, CheckCircle2, Trash2, Filter, ShoppingBag, DollarSign, AlertCircle, MessageSquare, ShieldCheck } from 'lucide-react';

interface SellerNotificationsProps {
  showToast: (msg: string) => void;
}

export const SellerNotifications: React.FC<SellerNotificationsProps> = ({ showToast }) => {
  const [filterCategory, setFilterCategory] = useState('all');

  const [notifications, setNotifications] = useState<any[]>([]);

  const handleMarkAllRead = () => {
    setNotifications(prev => prev.map(n => ({ ...n, read: true })));
    showToast('Todas as notificações foram marcadas como lidas.');
  };

  const handleDelete = (id: string) => {
    setNotifications(prev => prev.filter(n => n.id !== id));
    showToast('Notificação removida.');
  };

  const filtered = notifications.filter(n => filterCategory === 'all' || n.category === filterCategory);

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-2xl p-6 border border-gray-200 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-gray-900 flex items-center gap-2">
            <Bell className="w-6 h-6 text-emerald-600" />
            Central de Notificações Unificada
          </h1>
          <p className="text-xs text-gray-500 mt-1">
            Acompanhe em tempo real alertas de vendas, saques, perguntas de clientes e liberações do Escrow.
          </p>
        </div>

        <button
          onClick={handleMarkAllRead}
          className="bg-emerald-50 text-emerald-800 border border-emerald-200 font-extrabold text-xs px-4 py-2 rounded-xl hover:bg-emerald-100 transition"
        >
          Marcar Todas como Lidas
        </button>
      </div>

      <div className="bg-white rounded-2xl border border-gray-200 shadow-xs p-6 space-y-4">
        <div className="flex items-center gap-2 overflow-x-auto pb-2 border-b border-gray-100">
          {[
            { id: 'all', label: 'Todas' },
            { id: 'pedidos', label: 'Vendas & Pedidos' },
            { id: 'financeiro', label: 'Saldos & Saques' },
            { id: 'devolution', label: 'Devoluções' },
            { id: 'perguntas', label: 'Perguntas' },
          ].map(cat => (
            <button
              key={cat.id}
              onClick={() => setFilterCategory(cat.id)}
              className={`px-3 py-1.5 text-xs font-bold rounded-lg transition ${
                filterCategory === cat.id ? 'bg-emerald-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              {cat.label}
            </button>
          ))}
        </div>

        <div className="divide-y divide-gray-100">
          {filtered.length === 0 ? (
            <div className="p-8 text-center text-gray-400">
              <Bell className="w-10 h-10 mx-auto mb-2 text-gray-300 stroke-1" />
              <p className="font-bold text-sm text-gray-600">Nenhuma notificação encontrada nesta categoria.</p>
            </div>
          ) : (
            filtered.map(n => (
            <div key={n.id} className={`py-4 flex items-center justify-between ${!n.read ? 'bg-emerald-50/40 p-3 rounded-xl' : ''}`}>
              <div className="space-y-0.5">
                <div className="flex items-center gap-2">
                  {!n.read && <span className="w-2 h-2 rounded-full bg-emerald-600 animate-pulse" />}
                  <h4 className="text-xs font-black text-gray-900">{n.title}</h4>
                  <span className="text-[10px] text-gray-400">• {n.time}</span>
                </div>
                <p className="text-xs text-gray-600">{n.desc}</p>
              </div>

              <button
                onClick={() => handleDelete(n.id)}
                className="p-1.5 hover:bg-gray-100 text-gray-400 hover:text-red-600 rounded-lg"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          )))}
        </div>
      </div>
    </div>
  );
};
