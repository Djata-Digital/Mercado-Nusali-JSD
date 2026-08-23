import React, { useState, useMemo } from 'react';
import {
  LayoutDashboard, ShieldCheck, AlertCircle, Building2, Globe, CheckCircle2, Lock,
  Warehouse, DollarSign, Users, PackageCheck, MapPin, UserCheck, Store, Package,
  Layers, Tag, ShoppingBag, CreditCard, ArrowUpRight, ArrowDownRight, RotateCcw,
  Truck, LifeBuoy, AlertOctagon, ShieldAlert, Megaphone, Bell, BarChart3, History,
  Settings, Shield, Database, Search, Menu, X, ChevronRight, Check
} from 'lucide-react';

import { AdminCountriesManager } from './admin/AdminCountriesManager';
import { AdminRegionsManager } from './admin/AdminRegionsManager';
import { AdminCountryRepresentatives } from './admin/AdminCountryRepresentatives';
import { AdminRegionalSupervisors } from './admin/AdminRegionalSupervisors';
import { AdminUsersManager } from './admin/AdminUsersManager';
import { AdminSellersManager } from './admin/AdminSellersManager';
import { AdminKycReview } from './admin/AdminKycReview';
import { AdminStoresManager } from './admin/AdminStoresManager';
import { AdminProductsModeration } from './admin/AdminProductsModeration';
import { AdminCategoriesManager } from './admin/AdminCategoriesManager';
import { AdminBrandsManager } from './admin/AdminBrandsManager';
import { AdminOrdersManager } from './admin/AdminOrdersManager';
import { AdminPaymentsManager } from './admin/AdminPaymentsManager';
import { AdminEscrowManager } from './admin/AdminEscrowManager';
import { AdminFinanceDashboard } from './admin/AdminFinanceDashboard';
import { AdminPayoutsManager } from './admin/AdminPayoutsManager';
import { AdminRefundsManager } from './admin/AdminRefundsManager';
import { AdminDisputesManager } from './admin/AdminDisputesManager';
import { AdminReturnsManager } from './admin/AdminReturnsManager';
import { AdminLogisticsDashboard } from './admin/AdminLogisticsDashboard';
import { AdminWarehousesManager } from './admin/AdminWarehousesManager';
import { AdminCarriersManager } from './admin/AdminCarriersManager';
import { AdminCustomsManager } from './admin/AdminCustomsManager';
import { AdminSupportTickets } from './admin/AdminSupportTickets';
import { AdminReportsModeration } from './admin/AdminReportsModeration';
import { AdminRiskCenter } from './admin/AdminRiskCenter';
import { AdminMarketingManager } from './admin/AdminMarketingManager';
import { AdminNotificationsManager } from './admin/AdminNotificationsManager';
import { AdminReportsDashboard } from './admin/AdminReportsDashboard';
import { AdminAuditLogs } from './admin/AdminAuditLogs';
import { AdminRolesPermissions } from './admin/AdminRolesPermissions';
import { AdminPlatformSettings } from './admin/AdminPlatformSettings';
import { AdminSecurityCenter } from './admin/AdminSecurityCenter';
import { RegionalOperationsView } from './admin/RegionalOperationsView';
import { AdminDatabaseMonitor } from './admin/AdminDatabaseMonitor';

export const AdminDashboardView: React.FC = () => {
  const [activeTab, setActiveTab] = useState<string>('overview');
  const [searchFilter, setSearchFilter] = useState<string>('');
  const [mobileMenuOpen, setMobileMenuOpen] = useState<boolean>(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage(null);
    }, 4000);
  };

  const navCategories = [
    {
      group: 'Liderança & Operações',
      items: [
        { id: 'overview', label: 'Painel Global', icon: Globe },
        { id: 'regional_ops', label: 'Operações Regionais', icon: MapPin },
        { id: 'countries', label: 'Países & Parâmetros', icon: Globe },
        { id: 'regions', label: 'Regiões & Setores', icon: MapPin },
        { id: 'reps', label: 'Representantes Nacionais', icon: UserCheck },
        { id: 'supervisors', label: 'Supervisores Regionais', icon: Users },
      ]
    },
    {
      group: 'Usuários & Vendedores',
      items: [
        { id: 'users', label: 'Gestão de Usuários', icon: Users },
        { id: 'sellers', label: 'Vendedores & Reputação', icon: Store },
        { id: 'kyc', label: 'Análise KYC & Documentos', icon: ShieldCheck },
        { id: 'stores', label: 'Lojas Oficiais', icon: Building2 },
      ]
    },
    {
      group: 'Catálogo & Moderação',
      items: [
        { id: 'products', label: 'Moderação de Produtos', icon: Package },
        { id: 'categories', label: 'Árvore de Categorias', icon: Layers },
        { id: 'brands', label: 'Marcas Registradas', icon: Tag },
        { id: 'reports_mod', label: 'Central de Denúncias', icon: AlertOctagon },
      ]
    },
    {
      group: 'Transacional & Financeiro',
      items: [
        { id: 'orders', label: 'Gestão de Pedidos', icon: ShoppingBag },
        { id: 'payments', label: 'Nusali Pay & Gateways', icon: CreditCard },
        { id: 'escrow', label: 'Custódia Escrow', icon: Lock },
        { id: 'finance', label: 'Dashboard Financeiro', icon: DollarSign },
        { id: 'payouts', label: 'Repasses a Vendedores', icon: ArrowUpRight },
        { id: 'refunds', label: 'Estornos & Reembolsos', icon: ArrowDownRight },
        { id: 'disputes', label: 'Mediação de Disputas', icon: ShieldAlert },
        { id: 'returns', label: 'Logística Reversa', icon: RotateCcw },
      ]
    },
    {
      group: 'Logística & Cadeia CPLP',
      items: [
        { id: 'logistics', label: 'Expedição & Entregas', icon: Truck },
        { id: 'warehouses', label: 'HUBs & Armazéns', icon: Warehouse },
        { id: 'carriers', label: 'Transportadoras & Frotas', icon: Truck },
        { id: 'customs', label: 'Alfândega & DTA', icon: Shield },
      ]
    },
    {
      group: 'Suporte, Risco & Sistema',
      items: [
        { id: 'db_monitor', label: 'Banco de Dados & Redis', icon: Database },
        { id: 'support', label: 'Atendimento & Suporte', icon: LifeBuoy },
        { id: 'risk', label: 'Central de Risco & IA', icon: ShieldAlert },
        { id: 'marketing', label: 'Marketing & Banners', icon: Megaphone },
        { id: 'notifications', label: 'Comunicados Push/SMS', icon: Bell },
        { id: 'reports_bi', label: 'BI & Relatórios Executivos', icon: BarChart3 },
        { id: 'audit', label: 'Logs de Auditoria', icon: History },
        { id: 'roles', label: 'Perfis & Matriz Permissões', icon: Lock },
        { id: 'platform_settings', label: 'Configurações Globais', icon: Settings },
        { id: 'security', label: 'Segurança & 2FA', icon: Shield },
      ]
    }
  ];

  // Filtered categories based on search
  const filteredCategories = useMemo(() => {
    if (!searchFilter.trim()) return navCategories;
    const term = searchFilter.toLowerCase();
    return navCategories
      .map(cat => ({
        ...cat,
        items: cat.items.filter(
          item =>
            item.label.toLowerCase().includes(term) ||
            cat.group.toLowerCase().includes(term)
        )
      }))
      .filter(cat => cat.items.length > 0);
  }, [searchFilter]);

  // Find active item information
  const activeItemInfo = useMemo(() => {
    for (const cat of navCategories) {
      const found = cat.items.find(i => i.id === activeTab);
      if (found) {
        return { item: found, group: cat.group };
      }
    }
    return {
      item: { id: 'overview', label: 'Painel Global', icon: Globe },
      group: 'Liderança & Operações'
    };
  }, [activeTab]);

  const ActiveIcon = activeItemInfo.item.icon;

  const totalItemsCount = navCategories.reduce((acc, cat) => acc + cat.items.length, 0);

  return (
    <div className="max-w-[1720px] mx-auto px-3 sm:px-4 md:px-6 py-6">
      {/* Toast Banner */}
      {toastMessage && (
        <div className="fixed bottom-6 right-6 z-50 bg-emerald-950 text-white font-bold text-xs px-5 py-3 rounded-2xl shadow-2xl border border-emerald-500/50 animate-bounce flex items-center gap-2">
          <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Top Banner & Mobile Toggle */}
      <div className="bg-gradient-to-r from-emerald-950 via-slate-900 to-teal-950 text-white rounded-3xl p-5 md:p-7 shadow-xl border border-emerald-500/20 mb-6">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="space-y-1.5">
            <div className="inline-flex items-center gap-2 bg-emerald-500/20 text-emerald-300 px-3 py-0.5 rounded-full text-xs font-bold border border-emerald-500/30">
              <LayoutDashboard className="w-3.5 h-3.5 text-emerald-400" />
              <span>Plataforma Global Mercado Nusali • Suíte Administrativa</span>
            </div>
            <h1 className="text-xl sm:text-2xl lg:text-3xl font-black tracking-tight text-white">
              SISTEMA INTEGRADO DE ADMINISTRAÇÃO & SUPERVISÃO CPLP
            </h1>
            <p className="text-gray-300 text-xs sm:text-sm max-w-3xl leading-relaxed">
              Gestão multi-nível para Administração Global, Representações Nacionais (Guiné-Bissau, Brasil, Portugal, Angola, Cabo Verde, Moçambique), Supervisão Regional, Nusali Pay, Nusali Proteção e Logística Integrada.
            </p>
          </div>

          {/* Quick Mobile Menu Trigger & Status Indicator */}
          <div className="flex items-center gap-3">
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="lg:hidden flex items-center gap-2 bg-emerald-600 hover:bg-emerald-500 text-white px-4 py-2.5 rounded-xl font-bold text-xs shadow-lg transition-all"
            >
              {mobileMenuOpen ? <X className="w-4 h-4" /> : <Menu className="w-4 h-4" />}
              <span>{mobileMenuOpen ? 'Fechar Menu' : 'Menu Lateral'}</span>
            </button>
            <div className="hidden sm:flex items-center gap-2 bg-white/10 px-3.5 py-2 rounded-xl border border-white/10 text-xs text-emerald-300 font-semibold">
              <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              <span>{totalItemsCount} Módulos Conectados</span>
            </div>
          </div>
        </div>
      </div>

      {/* Main Two-Column Layout (Sticky Left Sidebar + Independent Content Area) */}
      <div className="flex flex-col lg:flex-row items-start gap-6 relative">
        
        {/* Backdrop for Mobile Menu */}
        {mobileMenuOpen && (
          <div
            onClick={() => setMobileMenuOpen(false)}
            className="fixed inset-0 bg-black/60 backdrop-blur-xs z-40 lg:hidden"
          />
        )}

        {/* LATERAL SIDEBAR PANEL WITH INDEPENDENT SCROLL */}
        <aside
          className={`
            fixed lg:sticky top-0 lg:top-4 z-50 lg:z-10
            left-0 bottom-0 lg:bottom-auto
            w-80 sm:w-84 max-w-[85vw] lg:w-76 xl:w-80
            h-full lg:h-[calc(100vh-2rem)]
            bg-slate-950 text-white
            rounded-r-3xl lg:rounded-3xl
            border-r lg:border border-emerald-500/20
            shadow-2xl flex flex-col overflow-hidden
            transition-transform duration-300 ease-in-out
            ${mobileMenuOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
          `}
        >
          {/* Sidebar Top Header & Search Bar */}
          <div className="p-4 border-b border-white/10 bg-slate-900/90 shrink-0 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center">
                  <ShieldCheck className="w-4 h-4 text-emerald-400" />
                </div>
                <div>
                  <h2 className="text-xs font-black uppercase tracking-wider text-white">Navegação Lateral</h2>
                  <p className="text-[10px] text-gray-400">Controles Administrativos</p>
                </div>
              </div>

              {/* Close button for mobile */}
              <button
                onClick={() => setMobileMenuOpen(false)}
                className="lg:hidden p-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-white/10"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Live Search Input */}
            <div className="relative">
              <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchFilter}
                onChange={e => setSearchFilter(e.target.value)}
                placeholder="Filtrar módulos..."
                className="w-full bg-white/5 border border-white/10 rounded-xl pl-9 pr-3 py-2 text-xs text-white placeholder-gray-400 focus:outline-none focus:border-emerald-400 focus:ring-1 focus:ring-emerald-400 transition-all"
              />
              {searchFilter && (
                <button
                  onClick={() => setSearchFilter('')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-white text-xs"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>

          {/* Independent Scrollable Navigation Body */}
          <div className="flex-1 overflow-y-auto px-3 py-3 space-y-4 scrollbar-thin scrollbar-thumb-emerald-700/50 scrollbar-track-slate-900">
            {filteredCategories.length === 0 ? (
              <div className="p-6 text-center text-gray-400 space-y-2">
                <AlertCircle className="w-6 h-6 text-gray-500 mx-auto" />
                <p className="text-xs">Nenhum módulo encontrado para "{searchFilter}"</p>
                <button
                  onClick={() => setSearchFilter('')}
                  className="text-xs text-emerald-400 hover:underline font-bold"
                >
                  Limpar filtro
                </button>
              </div>
            ) : (
              filteredCategories.map((cat, catIdx) => (
                <div key={catIdx} className="space-y-1">
                  {/* Category Header */}
                  <div className="px-2 py-1 flex items-center justify-between">
                    <span className="text-[10px] font-black uppercase tracking-wider text-emerald-400/90">
                      {cat.group}
                    </span>
                    <span className="text-[9px] text-gray-500 font-mono font-bold">
                      {cat.items.length}
                    </span>
                  </div>

                  {/* Category Items */}
                  <div className="space-y-0.5">
                    {cat.items.map(item => {
                      const Icon = item.icon;
                      const isActive = activeTab === item.id;
                      return (
                        <button
                          key={item.id}
                          onClick={() => {
                            setActiveTab(item.id);
                            setMobileMenuOpen(false);
                          }}
                          className={`
                            w-full text-left px-3 py-2 rounded-xl text-xs font-bold transition-all
                            flex items-center justify-between group
                            ${
                              isActive
                                ? 'bg-gradient-to-r from-emerald-600 to-teal-600 text-white shadow-md shadow-emerald-900/40'
                                : 'text-gray-300 hover:bg-white/8 hover:text-white'
                            }
                          `}
                        >
                          <div className="flex items-center gap-2.5 min-w-0 pr-1">
                            <Icon
                              className={`w-4 h-4 shrink-0 transition-transform ${
                                isActive ? 'text-white scale-110' : 'text-gray-400 group-hover:text-emerald-400'
                              }`}
                            />
                            <span className="truncate">{item.label}</span>
                          </div>
                          {isActive && (
                            <div className="w-1.5 h-1.5 rounded-full bg-white shrink-0 shadow-xs" />
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Sidebar Footer Info */}
          <div className="p-3 border-t border-white/10 bg-slate-900/90 shrink-0 flex items-center justify-between text-[11px] text-gray-400">
            <div className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-emerald-500" />
              <span className="font-semibold text-gray-300">Painel Sincronizado</span>
            </div>
            <span className="text-[10px] font-mono text-emerald-400/80 bg-emerald-950/60 px-2 py-0.5 rounded-md border border-emerald-500/20">
              CPLP v2.4
            </span>
          </div>
        </aside>

        {/* MAIN MODULE CONTENT AREA */}
        <main className="flex-1 min-w-0 w-full">
          {/* Active Tab Header Bar */}
          <div className="bg-white rounded-2xl p-4 sm:p-5 shadow-sm border border-gray-200/80 mb-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-emerald-50 border border-emerald-100 flex items-center justify-center text-emerald-700 shrink-0 shadow-xs">
                <ActiveIcon className="w-5 h-5" />
              </div>
              <div>
                <div className="flex items-center gap-1.5 text-xs text-gray-500 font-medium">
                  <span>{activeItemInfo.group}</span>
                  <ChevronRight className="w-3.5 h-3.5 text-gray-400" />
                  <span className="text-emerald-700 font-semibold">{activeItemInfo.item.label}</span>
                </div>
                <h2 className="text-lg font-black text-gray-900 tracking-tight">
                  {activeItemInfo.item.label}
                </h2>
              </div>
            </div>

            <div className="flex items-center gap-2 self-end sm:self-auto">
              <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-emerald-50 text-emerald-800 text-xs font-bold rounded-xl border border-emerald-200">
                <Check className="w-3.5 h-3.5 text-emerald-600" />
                Módulo Ativo
              </span>
            </div>
          </div>

          {/* Module View Container */}
          <div className="bg-white rounded-3xl shadow-sm border border-gray-200/80 p-4 sm:p-6 min-h-[650px]">
            {activeTab === 'db_monitor' && <AdminDatabaseMonitor />}
            {activeTab === 'overview' && <AdminFinanceDashboard showToast={showToast} />}

            {activeTab === 'regional_ops' && <RegionalOperationsView showToast={showToast} />}
            {activeTab === 'countries' && <AdminCountriesManager showToast={showToast} />}
            {activeTab === 'regions' && <AdminRegionsManager showToast={showToast} />}
            {activeTab === 'reps' && <AdminCountryRepresentatives showToast={showToast} />}
            {activeTab === 'supervisors' && <AdminRegionalSupervisors showToast={showToast} />}
            {activeTab === 'users' && <AdminUsersManager showToast={showToast} />}
            {activeTab === 'sellers' && <AdminSellersManager showToast={showToast} />}
            {activeTab === 'kyc' && <AdminKycReview showToast={showToast} />}
            {activeTab === 'stores' && <AdminStoresManager showToast={showToast} />}
            {activeTab === 'products' && <AdminProductsModeration showToast={showToast} />}
            {activeTab === 'categories' && <AdminCategoriesManager showToast={showToast} />}
            {activeTab === 'brands' && <AdminBrandsManager showToast={showToast} />}
            {activeTab === 'orders' && <AdminOrdersManager showToast={showToast} />}
            {activeTab === 'payments' && <AdminPaymentsManager showToast={showToast} />}
            {activeTab === 'escrow' && <AdminEscrowManager showToast={showToast} />}
            {activeTab === 'finance' && <AdminFinanceDashboard showToast={showToast} />}
            {activeTab === 'payouts' && <AdminPayoutsManager showToast={showToast} />}
            {activeTab === 'refunds' && <AdminRefundsManager showToast={showToast} />}
            {activeTab === 'disputes' && <AdminDisputesManager showToast={showToast} />}
            {activeTab === 'returns' && <AdminReturnsManager showToast={showToast} />}
            {activeTab === 'logistics' && <AdminLogisticsDashboard showToast={showToast} />}
            {activeTab === 'warehouses' && <AdminWarehousesManager showToast={showToast} />}
            {activeTab === 'carriers' && <AdminCarriersManager showToast={showToast} />}
            {activeTab === 'customs' && <AdminCustomsManager showToast={showToast} />}
            {activeTab === 'support' && <AdminSupportTickets showToast={showToast} />}
            {activeTab === 'reports_mod' && <AdminReportsModeration showToast={showToast} />}
            {activeTab === 'risk' && <AdminRiskCenter showToast={showToast} />}
            {activeTab === 'marketing' && <AdminMarketingManager showToast={showToast} />}
            {activeTab === 'notifications' && <AdminNotificationsManager showToast={showToast} />}
            {activeTab === 'reports_bi' && <AdminReportsDashboard showToast={showToast} />}
            {activeTab === 'audit' && <AdminAuditLogs showToast={showToast} />}
            {activeTab === 'roles' && <AdminRolesPermissions showToast={showToast} />}
            {activeTab === 'platform_settings' && <AdminPlatformSettings showToast={showToast} />}
            {activeTab === 'security' && <AdminSecurityCenter showToast={showToast} />}
          </div>
        </main>
      </div>
    </div>
  );
};
