import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Bell,
  Package,
  ShieldCheck,
  Tag,
  AlertCircle,
  Check,
  Trash2,
  ChevronRight,
  Sparkles,
  RefreshCw,
} from 'lucide-react';
import { usePreferences } from '../context/PreferencesContext';
import { BuyerNavHeader } from './BuyerNavHeader';
import { BuyerService, BuyerNotification } from '../services/buyerService';

export const NotificationsView: React.FC = () => {
  const navigate = useNavigate();
  const { showToast } = usePreferences();
  const [activeFilter, setActiveFilter] = useState<'all' | 'orders' | 'escrow' | 'promos'>('all');
  const [notifications, setNotifications] = useState<BuyerNotification[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const loadNotifications = async () => {
    setIsLoading(true);
    try {
      const res = await BuyerService.getNotifications();
      if (res.success && Array.isArray(res.data)) {
        setNotifications(res.data);
      }
    } catch (err) {
      console.error('Failed to load notifications:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadNotifications();
  }, []);

  const handleMarkAllAsRead = async () => {
    try {
      const res = await BuyerService.markAllNotificationsRead();
      if (res.success) {
        setNotifications(prev => prev.map(n => ({ ...n, isRead: true })));
        showToast('Todas as notificações foram marcadas como lidas.');
      }
    } catch {
      showToast('Erro ao atualizar notificações.');
    }
  };

  const handleClearAll = async () => {
    try {
      const res = await BuyerService.clearNotifications();
      if (res.success) {
        setNotifications([]);
        showToast('Histórico de notificações limpo.');
      }
    } catch {
      showToast('Erro ao limpar notificações.');
    }
  };

  const handleNotificationClick = async (notif: BuyerNotification) => {
    if (!notif.isRead) {
      await BuyerService.markNotificationRead(notif.id);
      setNotifications(prev => prev.map(n => n.id === notif.id ? { ...n, isRead: true } : n));
    }

    if (notif.targetView === 'tracking') {
      navigate('/orders');
    } else if (notif.targetView === 'coupons') {
      navigate('/coupons');
    } else if (notif.targetView === 'profile') {
      navigate('/profile');
    } else if (notif.targetView === 'wallet') {
      navigate('/wallet');
    } else if (notif.targetView === 'disputes') {
      navigate('/disputes');
    } else {
      navigate('/orders');
    }
  };

  const filteredNotifications = notifications.filter(n => {
    if (activeFilter === 'all') return true;
    return n.type === activeFilter;
  });

  const unreadCount = notifications.filter(n => !n.isRead).length;

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 animate-fadeIn">
      <BuyerNavHeader />

      {/* Header Banner */}
      <div className="bg-white rounded-2xl border border-gray-200 p-6 shadow-2xs mb-8 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 bg-amber-50 rounded-2xl flex items-center justify-center text-amber-600 border border-amber-200">
            <Bell className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-black text-gray-900">Central de Notificações</h1>
              {unreadCount > 0 && (
                <span className="bg-red-500 text-white text-[10px] font-black px-2 py-0.5 rounded-full">
                  {unreadCount} novas
                </span>
              )}
            </div>
            <p className="text-xs text-gray-500 mt-0.5">
              Acompanhe avisos de expedição, atualizações da garantia Escrow e promoções exclusivas.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {unreadCount > 0 && (
            <button
              onClick={handleMarkAllAsRead}
              className="bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold px-3 py-2 rounded-xl text-xs transition flex items-center gap-1.5 cursor-pointer"
            >
              <Check className="w-4 h-4 text-emerald-600" /> Marcar lidas
            </button>
          )}
          {notifications.length > 0 && (
            <button
              onClick={handleClearAll}
              className="bg-gray-100 hover:bg-red-50 text-gray-500 hover:text-red-600 font-bold px-3 py-2 rounded-xl text-xs transition flex items-center gap-1.5 cursor-pointer"
            >
              <Trash2 className="w-4 h-4" /> Limpar
            </button>
          )}
        </div>
      </div>

      {/* Filter Tabs */}
      <div className="flex items-center gap-2 mb-6 overflow-x-auto pb-2">
        <button
          onClick={() => setActiveFilter('all')}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition whitespace-nowrap cursor-pointer ${
            activeFilter === 'all'
              ? 'bg-gray-900 text-white shadow-xs'
              : 'bg-white text-gray-600 hover:bg-gray-100 border border-gray-200'
          }`}
        >
          Todas as Notificações ({notifications.length})
        </button>

        <button
          onClick={() => setActiveFilter('orders')}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition whitespace-nowrap flex items-center gap-1.5 cursor-pointer ${
            activeFilter === 'orders'
              ? 'bg-emerald-600 text-white shadow-xs'
              : 'bg-white text-gray-600 hover:bg-gray-100 border border-gray-200'
          }`}
        >
          <Package className="w-3.5 h-3.5" /> Envio & Logística
        </button>

        <button
          onClick={() => setActiveFilter('escrow')}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition whitespace-nowrap flex items-center gap-1.5 cursor-pointer ${
            activeFilter === 'escrow'
              ? 'bg-blue-600 text-white shadow-xs'
              : 'bg-white text-gray-600 hover:bg-gray-100 border border-gray-200'
          }`}
        >
          <ShieldCheck className="w-3.5 h-3.5" /> Garantia & Pagamentos
        </button>

        <button
          onClick={() => setActiveFilter('promos')}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition whitespace-nowrap flex items-center gap-1.5 cursor-pointer ${
            activeFilter === 'promos'
              ? 'bg-purple-600 text-white shadow-xs'
              : 'bg-white text-gray-600 hover:bg-gray-100 border border-gray-200'
          }`}
        >
          <Tag className="w-3.5 h-3.5" /> Cupons & Ofertas
        </button>
      </div>

      {/* Notifications List */}
      <div className="space-y-3">
        {filteredNotifications.length === 0 ? (
          <div className="bg-white rounded-2xl border border-gray-200 p-12 text-center text-gray-400">
            <Bell className="w-12 h-12 mx-auto mb-2 opacity-40" />
            <h3 className="text-sm font-bold text-gray-700">Nenhuma notificação encontrada</h3>
            <p className="text-xs text-gray-400 mt-1">Você receberá atualizações quando seus pedidos tiverem movimentações.</p>
          </div>
        ) : (
          filteredNotifications.map((notif) => (
            <div
              key={notif.id}
              onClick={() => handleNotificationClick(notif)}
              className={`p-4 rounded-2xl border transition cursor-pointer flex items-center justify-between gap-4 ${
                !notif.isRead
                  ? 'bg-blue-50/40 border-blue-200 shadow-2xs'
                  : 'bg-white border-gray-200 hover:border-gray-300'
              }`}
            >
              <div className="flex items-start gap-4">
                <div className={`p-2.5 rounded-xl shrink-0 mt-0.5 ${
                  notif.type === 'orders' ? 'bg-emerald-100 text-emerald-700' :
                  notif.type === 'escrow' ? 'bg-blue-100 text-blue-700' :
                  notif.type === 'promos' ? 'bg-purple-100 text-purple-700' :
                  'bg-amber-100 text-amber-700'
                }`}>
                  {notif.type === 'orders' && <Package className="w-5 h-5" />}
                  {notif.type === 'escrow' && <ShieldCheck className="w-5 h-5" />}
                  {notif.type === 'promos' && <Tag className="w-5 h-5" />}
                  {notif.type === 'system' && <Sparkles className="w-5 h-5" />}
                </div>

                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-xs font-black text-gray-900">{notif.title}</h3>
                    {!notif.isRead && (
                      <span className="w-2 h-2 rounded-full bg-blue-600"></span>
                    )}
                  </div>
                  <p className="text-xs text-gray-600 mt-0.5 leading-relaxed">{notif.message}</p>
                  <span className="text-[10px] text-gray-400 font-medium block mt-1">{notif.time}</span>
                </div>
              </div>

              <ChevronRight className="w-4 h-4 text-gray-400 shrink-0" />
            </div>
          ))
        )}
      </div>
    </div>
  );
};
