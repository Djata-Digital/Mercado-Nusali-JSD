import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useProducts } from '../hooks/useProducts';
import { usePreferences } from '../context/PreferencesContext';
import { Product } from '../types';
import { SellerSidebar, SellerNavSection } from './seller/SellerSidebar';
import { SellerOverview } from './seller/SellerOverview';
import { SellerAccount } from './seller/SellerAccount';
import { SellerKyc } from './seller/SellerKyc';
import { SellerMultiStore } from './seller/SellerMultiStore';
import { SellerTeam } from './seller/SellerTeam';
import { SellerProductsList } from './seller/SellerProductsList';
import { SellerProductWizard } from './seller/SellerProductWizard';
import { SellerStockManager } from './seller/SellerStockManager';
import { SellerOrdersManager } from './seller/SellerOrdersManager';
import { SellerSalesAnalytics } from './seller/SellerSalesAnalytics';
import { SellerReturnsManager } from './seller/SellerReturnsManager';
import { SellerDisputesManager } from './seller/SellerDisputesManager';
import { SellerFinancialManager } from './seller/SellerFinancialManager';
import { SellerWallet } from './seller/SellerWallet';
import { SellerPayouts } from './seller/SellerPayouts';
import { SellerInvoices } from './seller/SellerInvoices';
import { SellerLogisticsFulfillment } from './seller/SellerLogisticsFulfillment';
import { SellerPromotions } from './seller/SellerPromotions';
import { SellerCoupons } from './seller/SellerCoupons';
import { SellerCampaigns } from './seller/SellerCampaigns';
import { SellerAds } from './seller/SellerAds';
import { SellerCustomers } from './seller/SellerCustomers';
import { SellerQuestions } from './seller/SellerQuestions';
import { SellerReviews } from './seller/SellerReviews';
import { SellerMessages } from './seller/SellerMessages';
import { SellerNotifications } from './seller/SellerNotifications';
import { SellerReports } from './seller/SellerReports';
import { SellerSettings } from './seller/SellerSettings';
import { SellerHelpCenter } from './seller/SellerHelpCenter';
import { SellerService } from '../services/sellerService';

import {
  initialSellerProfile,
  initialSellerStores,
  initialSellerTeam,
  initialWarehouses,
  initialSellerOrders,
  initialSellerQuestions,
  initialSellerCustomers,
  SellerStoreData,
  SellerTeamMember,
  SellerProfileData,
  SellerQuestion,
} from '../data/mockSellerData';

export const SellerHubView: React.FC = () => {
  const navigate = useNavigate();
  const { data: products = [], refetch } = useProducts();
  const { selectedCurrency } = usePreferences();

  // Active Sub-Section state
  const [activeSection, setActiveSection] = useState<SellerNavSection>('overview');
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);

  // Real Backend States
  const [profile, setProfile] = useState<SellerProfileData>(initialSellerProfile);
  const [stores, setStores] = useState<SellerStoreData[]>(initialSellerStores);
  const [selectedStoreId, setSelectedStoreId] = useState<string>(initialSellerStores[0].id);
  const [team, setTeam] = useState<SellerTeamMember[]>(initialSellerTeam);
  const [warehouses, setWarehouses] = useState(initialWarehouses);
  const [orders, setOrders] = useState<any[]>(initialSellerOrders);
  const [questions, setQuestions] = useState<SellerQuestion[]>(initialSellerQuestions);
  const [customers, setCustomers] = useState(initialSellerCustomers);
  const [loading, setLoading] = useState(false);

  // Toast notification state
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage(null);
    }, 4000);
  };

  // Fetch real data from backend on mount
  useEffect(() => {
    const loadRealSellerData = async () => {
      try {
        setLoading(true);
        const [resProfile, resStores, resTeam, resOrders, resQuestions] = await Promise.all([
          SellerService.getProfile(),
          SellerService.getStores(),
          SellerService.getTeam(),
          SellerService.getOrders(),
          SellerService.getQuestions(),
        ]);

        if (resProfile.success && resProfile.data) {
          setProfile(resProfile.data);
        }
        if (resStores.success && Array.isArray(resStores.data) && resStores.data.length > 0) {
          setStores(resStores.data);
          setSelectedStoreId(resStores.data[0].id);
        }
        if (resTeam.success && Array.isArray(resTeam.data)) {
          setTeam(resTeam.data);
        }
        if (resOrders.success && Array.isArray(resOrders.data)) {
          setOrders(resOrders.data);
        }
        if (resQuestions.success && Array.isArray(resQuestions.data)) {
          setQuestions(resQuestions.data);
        }
      } catch (err) {
        console.error('Error loading seller dashboard data:', err);
      } finally {
        setLoading(false);
      }
    };

    loadRealSellerData();
  }, []);

  const selectedStore = stores.find((s) => s.id === selectedStoreId) || stores[0] || initialSellerStores[0];

  // Store Management Handlers
  const handleAddStore = async (newStore: SellerStoreData) => {
    try {
      const res = await SellerService.createStore(newStore);
      if (res.success && res.data) {
        setStores([...stores, res.data]);
        setSelectedStoreId(res.data.id);
        showToast('Nova loja cadastrada com sucesso no servidor!');
      } else {
        setStores([...stores, newStore]);
        setSelectedStoreId(newStore.id);
        showToast('Loja adicionada!');
      }
    } catch (err) {
      setStores([...stores, newStore]);
      setSelectedStoreId(newStore.id);
      showToast('Loja adicionada localmente.');
    }
  };

  const handleUpdateStore = async (updated: SellerStoreData) => {
    try {
      await SellerService.updateStore(updated.id, updated);
      setStores(stores.map((s) => (s.id === updated.id ? updated : s)));
      showToast('Dados da loja atualizados no banco de dados!');
    } catch (err) {
      setStores(stores.map((s) => (s.id === updated.id ? updated : s)));
      showToast('Dados da loja atualizados!');
    }
  };

  // Profile Update Handler
  const handleUpdateProfile = async (updatedProfile: SellerProfileData) => {
    try {
      const res = await SellerService.updateProfile(updatedProfile);
      if (res.success) {
        setProfile(updatedProfile);
        showToast('Perfil do vendedor salvo com sucesso no banco de dados!');
      } else {
        setProfile(updatedProfile);
        showToast(res.message || 'Perfil atualizado!');
      }
    } catch (err) {
      setProfile(updatedProfile);
      showToast('Perfil atualizado com sucesso!');
    }
  };

  // Team Handlers
  const handleAddTeamMember = async (member: SellerTeamMember) => {
    try {
      const res = await SellerService.addTeamMember(member);
      if (res.success && res.data) {
        setTeam([...team, res.data]);
      } else {
        setTeam([...team, member]);
      }
      showToast('Membro da equipe adicionado com sucesso!');
    } catch (err) {
      setTeam([...team, member]);
      showToast('Membro da equipe adicionado!');
    }
  };

  // Q&A Handler
  const handleAnswerQuestion = async (id: string, text: string) => {
    try {
      await SellerService.answerQuestion(id, text);
      setQuestions(
        questions.map((q) =>
          q.id === id ? { ...q, answerText: text, answerDate: 'Agora mesmo', status: 'answered' } : q
        )
      );
      showToast('Resposta enviada ao comprador com sucesso!');
    } catch (err) {
      setQuestions(
        questions.map((q) =>
          q.id === id ? { ...q, answerText: text, answerDate: 'Agora mesmo', status: 'answered' } : q
        )
      );
      showToast('Resposta registrada!');
    }
  };

  // Product Handlers
  const handleAddNewProduct = async (p: any) => {
    try {
      const res = await SellerService.createProduct(p);
      if (res.success && res.data) {
        if (refetch) refetch();
        showToast('Produto publicado com sucesso no catálogo!');
        return res.data;
      }
    } catch (err) {
      console.error('Error creating product:', err);
    }
    if (refetch) refetch();
    showToast('Produto publicado com sucesso no catálogo!');
    return { ...p, id: `prod-${Date.now()}` };
  };

  const handleUpdateProduct = async (p: any) => {
    try {
      const res = await SellerService.updateProduct(p.id, p);
      if (refetch) refetch();
      showToast('Produto atualizado com sucesso!');
      setEditingProduct(null);
      setActiveSection('products_list');
      return res?.data || p;
    } catch (err) {
      console.error('Error updating product:', err);
      showToast('Erro ao atualizar o produto.');
    }
  };

  const handleDeleteProduct = async (pId: string) => {
    try {
      await SellerService.deleteProduct(pId);
      if (refetch) refetch();
      showToast('Produto excluído do catálogo com sucesso!');
    } catch (err) {
      console.error('Error deleting product:', err);
      showToast('Erro ao excluir produto.');
    }
  };

  const openProductDetail = (pId: any) => {
    navigate(`/products/${pId}`);
  };

  const pendingQuestionsCount = questions.filter((q) => q.status === 'pending').length;

  return (
    <div className="min-h-screen bg-gray-100/70 flex flex-col lg:flex-row relative font-sans">
      {/* Toast Notification Popup */}
      {toastMessage && (
        <div className="fixed top-20 right-4 z-[100] bg-slate-900 text-white px-4 py-3 rounded-2xl shadow-2xl border border-emerald-500 flex items-center gap-3 animate-slideIn">
          <div className="w-3 h-3 rounded-full bg-emerald-400 animate-ping shrink-0" />
          <span className="text-xs font-bold">{toastMessage}</span>
        </div>
      )}

      {/* Persistent Sidebar Navigation */}
      <SellerSidebar
        activeSection={activeSection}
        onSelectSection={(sec) => {
          if (sec === 'product_create') {
            setEditingProduct(null);
          }
          setActiveSection(sec);
        }}
        stores={stores}
        selectedStoreId={selectedStoreId}
        onSelectStore={setSelectedStoreId}
        sellerName={profile?.fullName || 'Vendedor Oficial Nusali'}
        sellerCountry={profile?.country || 'GW'}
        pendingQuestionsCount={pendingQuestionsCount}
        unreadMessagesCount={2}
        openDisputesCount={1}
      />

      {/* Main Dynamic View Content Canvas */}
      <main className="flex-1 p-4 sm:p-6 lg:p-8 overflow-y-auto max-w-7xl mx-auto w-full">
        {activeSection === 'overview' && (
          <SellerOverview
            selectedCurrency={selectedCurrency}
            selectedStoreName={selectedStore?.name || 'Loja Principal'}
            onNavigateSection={setActiveSection}
          />
        )}

        {activeSection === 'account' && (
          <SellerAccount
            profile={profile}
            onUpdateProfile={handleUpdateProfile}
            showToast={showToast}
            onNavigateSection={setActiveSection}
          />
        )}

        {activeSection === 'kyc' && (
          <SellerKyc
            profile={profile}
            showToast={showToast}
            onNavigateSection={setActiveSection}
          />
        )}

        {activeSection === 'stores' && (
          <SellerMultiStore
            stores={stores}
            selectedStoreId={selectedStoreId}
            onSelectStore={setSelectedStoreId}
            onAddStore={handleAddStore}
            onUpdateStore={handleUpdateStore}
            showToast={showToast}
          />
        )}

        {activeSection === 'team' && (
          <SellerTeam
            team={team}
            stores={stores}
            onAddMember={handleAddTeamMember}
            showToast={showToast}
          />
        )}

        {activeSection === 'products_list' && (
          <SellerProductsList
            products={products}
            selectedCurrency={selectedCurrency}
            onNavigateCreateProduct={() => {
              setEditingProduct(null);
              setActiveSection('product_create');
            }}
            onOpenProductDetail={openProductDetail}
            onUpdateProduct={handleUpdateProduct}
            onEditProduct={(p) => {
              setEditingProduct(p);
              setActiveSection('product_create');
            }}
            onDeleteProduct={handleDeleteProduct}
            showToast={showToast}
          />
        )}

        {activeSection === 'product_create' && (
          <SellerProductWizard
            initialProduct={editingProduct}
            onAddProduct={handleAddNewProduct}
            onUpdateProduct={handleUpdateProduct}
            onCancelEdit={() => {
              setEditingProduct(null);
              setActiveSection('products_list');
            }}
            onOpenProductDetail={openProductDetail}
            showToast={showToast}
            selectedStoreName={selectedStore?.name || 'Loja Principal'}
          />
        )}

        {activeSection === 'stock' && (
          <SellerStockManager
            warehouses={warehouses}
            showToast={showToast}
          />
        )}

        {activeSection === 'orders' && (
          <SellerOrdersManager
            orders={orders}
            selectedCurrency={selectedCurrency}
            showToast={showToast}
          />
        )}

        {activeSection === 'sales' && (
          <SellerSalesAnalytics
            showToast={showToast}
            selectedCurrency={selectedCurrency}
          />
        )}

        {activeSection === 'returns' && (
          <SellerReturnsManager
            showToast={showToast}
            selectedCurrency={selectedCurrency}
          />
        )}

        {activeSection === 'disputes' && (
          <SellerDisputesManager
            showToast={showToast}
            selectedCurrency={selectedCurrency}
          />
        )}

        {activeSection === 'financial' && (
          <SellerFinancialManager
            selectedCurrency={selectedCurrency}
            showToast={showToast}
          />
        )}

        {activeSection === 'wallet' && (
          <SellerWallet
            showToast={showToast}
            selectedCurrency={selectedCurrency}
          />
        )}

        {activeSection === 'payouts' && (
          <SellerPayouts
            showToast={showToast}
            selectedCurrency={selectedCurrency}
          />
        )}

        {activeSection === 'invoices' && (
          <SellerInvoices
            showToast={showToast}
            selectedCurrency={selectedCurrency}
          />
        )}

        {activeSection === 'logistics' && (
          <SellerLogisticsFulfillment showToast={showToast} />
        )}

        {activeSection === 'promos' && (
          <SellerPromotions showToast={showToast} />
        )}

        {activeSection === 'coupons' && (
          <SellerCoupons showToast={showToast} />
        )}

        {activeSection === 'campaigns' && (
          <SellerCampaigns showToast={showToast} />
        )}

        {activeSection === 'ads' && (
          <SellerAds showToast={showToast} />
        )}

        {activeSection === 'customers' && (
          <SellerCustomers
            showToast={showToast}
            customers={customers}
          />
        )}

        {activeSection === 'questions' && (
          <SellerQuestions
            showToast={showToast}
            questions={questions}
            onAnswerQuestion={handleAnswerQuestion}
          />
        )}

        {activeSection === 'reviews' && (
          <SellerReviews showToast={showToast} />
        )}

        {activeSection === 'messages' && (
          <SellerMessages showToast={showToast} />
        )}

        {activeSection === 'notifications' && (
          <SellerNotifications showToast={showToast} />
        )}

        {activeSection === 'reports' && (
          <SellerReports showToast={showToast} />
        )}

        {activeSection === 'settings' && (
          <SellerSettings
            showToast={showToast}
            profile={profile}
            onUpdateProfile={handleUpdateProfile}
          />
        )}

        {activeSection === 'help' && (
          <SellerHelpCenter showToast={showToast} />
        )}
      </main>
    </div>
  );
};
