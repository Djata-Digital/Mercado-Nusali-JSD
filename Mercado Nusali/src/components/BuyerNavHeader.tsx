import React from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import {
  User,
  Package,
  Wallet,
  Tag,
  Bell,
  MessageSquare,
  MapPin,
  ShieldCheck,
  Star,
  HelpCircle,
  RotateCcw,
  AlertCircle,
} from 'lucide-react';
import { useDisputes } from '../hooks/useDisputes';

export const BuyerNavHeader: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { data: disputes = [] } = useDisputes();

  const pendingDisputesCount = disputes.filter(
    (d: any) => d.status === 'opened' || d.status === 'under_admin_review'
  ).length;

  const navItems = [
    { path: '/profile', label: 'Meu Perfil', icon: <User className="w-4 h-4" /> },
    { path: '/orders', label: 'Minhas Compras', icon: <Package className="w-4 h-4" /> },
    { path: '/wallet', label: 'Nusali Pay', icon: <Wallet className="w-4 h-4" /> },
    { path: '/coupons', label: 'Cupons & Cashback', icon: <Tag className="w-4 h-4" /> },
    { path: '/notifications', label: 'Notificações', icon: <Bell className="w-4 h-4" /> },
    { path: '/messages', label: 'Mensagens', icon: <MessageSquare className="w-4 h-4" /> },
    { path: '/addresses', label: 'Endereços', icon: <MapPin className="w-4 h-4" /> },
    { path: '/security', label: 'Segurança', icon: <ShieldCheck className="w-4 h-4" /> },
    { path: '/returns-refunds', label: 'Devoluções', icon: <RotateCcw className="w-4 h-4" /> },
    { path: '/disputes', label: 'Disputas & Escrow', icon: <AlertCircle className="w-4 h-4" />, badge: pendingDisputesCount },
    { path: '/help-center', label: 'Central de Ajuda', icon: <HelpCircle className="w-4 h-4" /> },
  ];

  return (
    <div className="bg-white border-b border-gray-200 shadow-2xs mb-6 sticky top-20 z-30">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center gap-1 overflow-x-auto no-scrollbar py-2">
          {navItems.map((item) => {
            const isActive = location.pathname === item.path;
            return (
              <button
                key={item.path}
                onClick={() => navigate(item.path)}
                className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-semibold whitespace-nowrap transition cursor-pointer ${
                  isActive
                    ? 'bg-emerald-600 text-white shadow-xs'
                    : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
                }`}
              >
                {item.icon}
                <span>{item.label}</span>
                {item.badge !== undefined && item.badge > 0 && (
                  <span
                    className={`px-1.5 py-0.5 rounded-full text-[10px] font-bold ${
                      isActive ? 'bg-white text-emerald-800' : 'bg-red-600 text-white'
                    }`}
                  >
                    {item.badge}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
};

