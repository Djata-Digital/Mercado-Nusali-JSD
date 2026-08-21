import React, { useState } from 'react';
import {
  LayoutDashboard,
  UserCheck,
  ShieldCheck,
  Store,
  Users,
  Package,
  PlusCircle,
  Boxes,
  ShoppingBag,
  TrendingUp,
  Truck,
  RotateCcw,
  AlertCircle,
  DollarSign,
  Wallet,
  ArrowUpRight,
  FileText,
  Tag,
  Gift,
  Megaphone,
  Sparkles,
  Users as UserGroup,
  MessageSquare,
  Star,
  Mail,
  Bell,
  BarChart3,
  Settings,
  HelpCircle,
  ChevronDown,
  Menu,
  X,
  BadgeCheck,
  Globe,
} from 'lucide-react';
import { SellerStoreData } from '../../data/mockSellerData';
import { CountryCode } from '../../types';
import { countriesConfig } from '../../utils/currencyUtils';

export type SellerNavSection =
  | 'overview'
  | 'account'
  | 'kyc'
  | 'stores'
  | 'team'
  | 'products_list'
  | 'product_create'
  | 'stock'
  | 'orders'
  | 'sales'
  | 'logistics'
  | 'returns'
  | 'disputes'
  | 'financial'
  | 'wallet'
  | 'payouts'
  | 'invoices'
  | 'promos'
  | 'coupons'
  | 'campaigns'
  | 'ads'
  | 'customers'
  | 'questions'
  | 'reviews'
  | 'messages'
  | 'notifications'
  | 'reports'
  | 'settings'
  | 'help';

interface SellerSidebarProps {
  activeSection: SellerNavSection;
  onSelectSection: (sec: SellerNavSection) => void;
  stores: SellerStoreData[];
  selectedStoreId: string;
  onSelectStore: (storeId: string) => void;
  sellerName: string;
  sellerCountry: CountryCode;
  pendingQuestionsCount: number;
  unreadMessagesCount: number;
  openDisputesCount: number;
  ordersCount?: number;
  taxId?: string;
}

const getInitials = (name: string): string => {
  if (!name || !name.trim()) return 'NV';
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[1][0]).toUpperCase();
  }
  return name.trim().substring(0, 2).toUpperCase();
};

export const SellerSidebar: React.FC<SellerSidebarProps> = ({
  activeSection,
  onSelectSection,
  stores,
  selectedStoreId,
  onSelectStore,
  sellerName,
  sellerCountry,
  pendingQuestionsCount,
  unreadMessagesCount,
  openDisputesCount,
  ordersCount = 0,
  taxId,
}) => {
  const [isMobileOpen, setIsMobileOpen] = useState(false);
  const [isStoreDropdownOpen, setIsStoreDropdownOpen] = useState(false);

  const selectedStore = stores.find((s) => s.id === selectedStoreId) || stores[0];
  const countryConf = countriesConfig[sellerCountry] || countriesConfig.GW;

  const navGroups = [
    {
      title: 'PAINEL CENTRAL',
      items: [
        { id: 'overview', label: 'Visão Geral', icon: LayoutDashboard },
        { id: 'account', label: 'Minha Conta de Vendedor', icon: UserCheck },
        { id: 'kyc', label: 'Verificação KYC', icon: ShieldCheck, badge: 'Nível 3' },
        { id: 'stores', label: 'Minhas Lojas (Multiloja)', icon: Store, count: stores.length },
        { id: 'team', label: 'Equipe da Loja', icon: Users },
      ],
    },
    {
      title: 'GESTÃO DE CATÁLOGO',
      items: [
        { id: 'products_list', label: 'Meus Produtos', icon: Package },
        { id: 'product_create', label: 'Cadastrar Produto (IA)', icon: PlusCircle, isHighlight: true },
        { id: 'stock', label: 'Estoque & Armazéns', icon: Boxes },
      ],
    },
    {
      title: 'PEDIDOS & VENDAS',
      items: [
        { id: 'orders', label: 'Pedidos de Venda', icon: ShoppingBag, count: ordersCount },
        { id: 'sales', label: 'Desempenho de Vendas', icon: TrendingUp },
        { id: 'logistics', label: 'Entregas & Fulfillment', icon: Truck },
        { id: 'returns', label: 'Devoluções & Trocas', icon: RotateCcw },
        { id: 'disputes', label: 'Disputas & Escrow', icon: AlertCircle, badgeCount: openDisputesCount, isAlert: openDisputesCount > 0 },
      ],
    },
    {
      title: 'FINANCEIRO & SALDOS',
      items: [
        { id: 'financial', label: 'Visão Financeira', icon: DollarSign },
        { id: 'wallet', label: 'Carteira Nusali Pay', icon: Wallet },
        { id: 'payouts', label: 'Solicitar Saque', icon: ArrowUpRight },
        { id: 'invoices', label: 'Faturas & Comissões', icon: FileText },
      ],
    },
    {
      title: 'MARKETING & PROMOÇÕES',
      items: [
        { id: 'promos', label: 'Promoções & Ofertas', icon: Tag },
        { id: 'coupons', label: 'Cupons do Vendedor', icon: Gift },
        { id: 'campaigns', label: 'Campanhas Sazonais', icon: Megaphone },
        { id: 'ads', label: 'Anúncios Patrocinados', icon: Sparkles },
      ],
    },
    {
      title: 'RELACIONAMENTO & SAC',
      items: [
        { id: 'customers', label: 'Meus Clientes', icon: UserGroup },
        { id: 'questions', label: 'Perguntas & Respostas', icon: MessageSquare, badgeCount: pendingQuestionsCount },
        { id: 'reviews', label: 'Avaliações dos Produtos', icon: Star },
        { id: 'messages', label: 'Mensagens Diretas', icon: Mail, badgeCount: unreadMessagesCount },
        { id: 'notifications', label: 'Central de Notificações', icon: Bell },
      ],
    },
    {
      title: 'SISTEMA & RELATÓRIOS',
      items: [
        { id: 'reports', label: 'Relatórios & Exportação', icon: BarChart3 },
        { id: 'settings', label: 'Configurações da Loja', icon: Settings },
        { id: 'help', label: 'Central de Ajuda do Vendedor', icon: HelpCircle },
      ],
    },
  ];

  const handleNavItemClick = (id: SellerNavSection) => {
    onSelectSection(id);
    setIsMobileOpen(false);
  };

  return (
    <>
      {/* Mobile Bar Toggle */}
      <div className="lg:hidden bg-blue-950 text-white p-4 flex items-center justify-between border-b border-blue-900 sticky top-0 z-40">
        <div className="flex items-center gap-2">
          <Store className="w-5 h-5 text-yellow-400" />
          <span className="font-extrabold text-sm tracking-wide">CENTRAL DO VENDEDOR</span>
        </div>
        <button
          onClick={() => setIsMobileOpen(!isMobileOpen)}
          className="p-2 bg-white/10 hover:bg-white/20 rounded-lg text-white transition"
        >
          {isMobileOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
        </button>
      </div>

      {/* Backdrop for mobile */}
      {isMobileOpen && (
        <div
          onClick={() => setIsMobileOpen(false)}
          className="fixed inset-0 bg-black/60 z-40 lg:hidden backdrop-blur-xs"
        />
      )}

      {/* Sidebar Container */}
      <aside
        className={`fixed lg:static top-0 left-0 bottom-0 w-72 bg-slate-900 text-slate-200 z-50 flex flex-col justify-between border-r border-slate-800 transition-transform duration-300 shadow-2xl lg:shadow-none ${
          isMobileOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
        }`}
      >
        <div className="flex-1 overflow-y-auto custom-scrollbar p-4 space-y-6">
          {/* Header Brand & Store Switcher */}
          <div className="space-y-3 pb-4 border-b border-slate-800">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-yellow-400 text-blue-950 font-black flex items-center justify-center text-sm shadow-md">
                  {getInitials(selectedStore?.name || sellerName || 'Sua Loja')}
                </div>
                <div>
                  <h2 className="font-black text-white text-sm tracking-tight leading-none truncate max-w-[140px]">
                    {selectedStore?.name || sellerName || 'Painel de Vendedor'}
                  </h2>
                  <span className="text-[10px] text-emerald-400 font-bold flex items-center gap-1 mt-0.5">
                    <BadgeCheck className="w-3 h-3" /> VERIFICADO GLOBAL
                  </span>
                </div>
              </div>
              <span className="text-xs">{countryConf.flag}</span>
            </div>

            {/* Active Store Dropdown Switcher */}
            <div className="relative">
              <button
                onClick={() => setIsStoreDropdownOpen(!isStoreDropdownOpen)}
                className="w-full bg-slate-800 hover:bg-slate-700/80 p-2.5 rounded-xl border border-slate-700 text-left transition flex items-center justify-between gap-2"
              >
                <div className="flex items-center gap-2.5 truncate">
                  <img
                    src={selectedStore?.logo || 'https://images.unsplash.com/photo-1534723482100-6420ad339a03?auto=format&fit=crop&q=80&w=200'}
                    alt=""
                    className="w-7 h-7 rounded-lg object-cover border border-slate-600 shrink-0"
                  />
                  <div className="truncate">
                    <span className="font-bold text-xs text-white block truncate">{selectedStore?.name}</span>
                    <span className="text-[10px] text-slate-400 block truncate">
                      {selectedStore?.category}
                    </span>
                  </div>
                </div>
                <ChevronDown className="w-4 h-4 text-slate-400 shrink-0" />
              </button>

              {isStoreDropdownOpen && (
                <div className="absolute top-full left-0 right-0 mt-1 bg-slate-800 border border-slate-700 rounded-xl shadow-xl z-50 p-1 space-y-1">
                  <span className="text-[10px] font-bold text-slate-400 px-3 py-1 block uppercase">Alternar Loja</span>
                  {stores.map((s) => (
                    <button
                      key={s.id}
                      onClick={() => {
                        onSelectStore(s.id);
                        setIsStoreDropdownOpen(false);
                      }}
                      className={`w-full text-left p-2 rounded-lg text-xs flex items-center gap-2 transition ${
                        s.id === selectedStoreId ? 'bg-emerald-600 text-white font-bold' : 'hover:bg-slate-700 text-slate-300'
                      }`}
                    >
                      <img src={s.logo} alt="" className="w-5 h-5 rounded-md object-cover" />
                      <span className="truncate">{s.name}</span>
                    </button>
                  ))}
                  <button
                    onClick={() => {
                      onSelectSection('stores');
                      setIsStoreDropdownOpen(false);
                    }}
                    className="w-full text-left p-2 rounded-lg text-xs font-bold text-yellow-400 hover:bg-slate-700 flex items-center gap-1 mt-1 border-t border-slate-700"
                  >
                    <PlusCircle className="w-3.5 h-3.5" /> + Criar Nova Loja
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Navigation Groups */}
          <div className="space-y-6">
            {navGroups.map((group, idx) => (
              <div key={idx} className="space-y-1">
                <span className="text-[10px] font-black text-slate-400 uppercase tracking-wider px-2 block">
                  {group.title}
                </span>

                <div className="space-y-0.5">
                  {group.items.map((item) => {
                    const Icon = item.icon;
                    const isActive = activeSection === item.id;
                    return (
                      <button
                        key={item.id}
                        onClick={() => handleNavItemClick(item.id as SellerNavSection)}
                        className={`w-full text-left px-3 py-2 rounded-xl text-xs font-bold transition flex items-center justify-between gap-2 ${
                          isActive
                            ? 'bg-emerald-600 text-white shadow-md'
                            : item.isHighlight
                            ? 'bg-amber-500/10 text-amber-300 border border-amber-500/30 hover:bg-amber-500/20'
                            : 'hover:bg-slate-800 text-slate-300 hover:text-white'
                        }`}
                      >
                        <div className="flex items-center gap-2.5 truncate">
                          <Icon className={`w-4 h-4 shrink-0 ${isActive ? 'text-white' : item.isHighlight ? 'text-amber-400' : 'text-slate-400'}`} />
                          <span className="truncate">{item.label}</span>
                        </div>

                        {item.badge && (
                          <span className="bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 text-[9px] font-extrabold px-1.5 py-0.2 rounded-md">
                            {item.badge}
                          </span>
                        )}

                        {item.count !== undefined && (
                          <span className="bg-slate-800 text-slate-300 text-[10px] font-bold px-1.5 py-0.2 rounded-full">
                            {item.count}
                          </span>
                        )}

                        {item.badgeCount !== undefined && item.badgeCount > 0 && (
                          <span
                            className={`text-[10px] font-black px-1.5 py-0.2 rounded-full ${
                              item.isAlert ? 'bg-red-500 text-white' : 'bg-yellow-400 text-slate-950'
                            }`}
                          >
                            {item.badgeCount}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Footer Seller Profile Info */}
        <div className="p-4 border-t border-slate-800 bg-slate-950/60 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-full bg-emerald-600 text-white font-bold flex items-center justify-center text-xs">
              {getInitials(sellerName)}
            </div>
            <div>
              <span className="font-bold text-xs text-white block">{sellerName}</span>
              <span className="text-[10px] text-slate-400 font-mono">
                {taxId && taxId.trim() ? `NIF ${taxId.trim()}` : 'NIF: Não Informado'}
              </span>
            </div>
          </div>

          <button
            onClick={() => onSelectSection('settings')}
            className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition"
            title="Configurações"
          >
            <Settings className="w-4 h-4" />
          </button>
        </div>
      </aside>
    </>
  );
};
