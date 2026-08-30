import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Lock, ShieldCheck, Loader2 } from 'lucide-react';
import { useProducts } from '../hooks/useProducts';
import { usePreferences } from '../context/PreferencesContext';
import { isSellerKycApproved } from '../utils/kycUtils';
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
  const [selectedStoreId, setSelectedStoreId] = useState<string>(initialSellerStores[0]?.id || '');
  const [team, setTeam] = useState<SellerTeamMember[]>(initialSellerTeam);
  const [warehouses, setWarehouses] = useState(initialWarehouses);
  const [orders, setOrders] = useState<any[]>(initialSellerOrders);
  const [questions, setQuestions] = useState<SellerQuestion[]>(initialSellerQuestions);
  const [customers, setCustomers] = useState(initialSellerCustomers);
  const [sellerProducts, setSellerProducts] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  // Toast notification state
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage(null);
    }, 4000);
  };

  const fetchSellerProducts = async () => {
    try {
      const res = await SellerService.getProducts();
      if (res.success && Array.isArray(res.data)) {
        setSellerProducts(res.data);
      }
    } catch (err) {
      console.error('Error fetching seller products:', err);
    }
  };

  // Correção crítica (pedido pago não aparece em "Pedidos de Venda" sem F5):
  // não existe WebSocket real conectado no cliente hoje — broadcastToUser
  // (backend) é enviado, mas src/services/socketService.ts nunca é
  // instanciado/conectado em nenhum lugar do app (auditado: zero usos de
  // socketService.connect()/.on() em todo o src/). O mecanismo que JÁ
  // funciona hoje para refletir mudanças de servidor sem F5 é polling (o
  // próprio PixPaymentModal.tsx do comprador já faz isso a cada 4s). Reusa
  // o mesmo padrão aqui: refetch leve (só orders, não o dashboard inteiro)
  // enquanto o vendedor está na aba "Pedidos de Venda". Sempre lê a API
  // autoritativa de novo — nunca insere/edita o pedido no estado local.
  const fetchSellerOrders = async () => {
    try {
      const res = await SellerService.getOrders();
      if (res.success && Array.isArray(res.data)) {
        setOrders(res.data);
      }
    } catch (err) {
      console.error('Error polling seller orders:', err);
    }
  };

  const [needsOnboarding, setNeedsOnboarding] = useState(false);
  const [isOnboardingLoading, setIsOnboardingLoading] = useState(false);

  const loadRealSellerData = async () => {
    try {
      setLoading(true);
      const [resProfile, resStores, resTeam, resOrders, resQuestions, resProd] = await Promise.all([
        SellerService.getProfile(),
        SellerService.getStores(),
        SellerService.getTeam(),
        SellerService.getOrders(),
        SellerService.getQuestions(),
        SellerService.getProducts(),
      ]);

      if (resProfile.success && resProfile.data) {
        setProfile(resProfile.data);
        setNeedsOnboarding(false);
      } else {
        setNeedsOnboarding(true);
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
      if (resProd.success && Array.isArray(resProd.data)) {
        setSellerProducts(resProd.data);
      }
    } catch (err) {
      console.error('Error loading seller dashboard data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadRealSellerData();
  }, [activeSection]);

  // Correção crítica: enquanto o vendedor está com "Pedidos de Venda"
  // aberto (sem trocar de aba, sem F5), um pagamento confirmado pelo
  // comprador precisa aparecer sozinho. loadRealSellerData() já roda uma
  // vez ao entrar na aba (efeito acima); este intervalo mantém a lista
  // atualizada enquanto o vendedor permanece nela. Para de rodar assim que
  // ele sai da aba ou o componente desmonta.
  useEffect(() => {
    if (activeSection !== 'orders') return;
    const interval = setInterval(fetchSellerOrders, 8000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeSection]);

  const handleStartOnboarding = async () => {
    setIsOnboardingLoading(true);
    try {
      const res = await SellerService.onboard();
      if (res.success) {
        setNeedsOnboarding(false);
        showToast('Cadastro de vendedor ativado com sucesso! Agora conclua a verificação KYC.');
        await loadRealSellerData();
      } else {
        showToast(res.message || 'Erro ao realizar onboarding.');
      }
    } catch (err: any) {
      showToast(err?.message || 'Erro ao ativar cadastro de vendedor.');
    } finally {
      setIsOnboardingLoading(false);
    }
  };

  const selectedStore = stores.find((s) => s.id === selectedStoreId) || stores[0] || null;

  // Store Management Handlers (NO FAKE FALLBACK IF API FAILS)
  const handleAddStore = async (newStore: SellerStoreData) => {
    try {
      const res = await SellerService.createStore(newStore);
      if (res.success && res.data) {
        setStores((prev) => [...prev, res.data]);
        setSelectedStoreId(res.data.id);
        showToast(`Loja "${res.data.name}" cadastrada com sucesso!`);
      } else {
        const errMsg = res.error?.message || res.message || 'Erro ao cadastrar loja.';
        if (errMsg.includes('KYC') || res.error?.code === 'SELLER_KYC_REQUIRED') {
          showToast('Você precisa concluir e ter o KYC aprovado para criar uma loja.');
        } else {
          showToast(errMsg);
        }
      }
    } catch (err: any) {
      const errMsg = err?.message || 'Erro ao comunicar com o servidor para criar loja.';
      if (errMsg.includes('KYC') || err?.code === 'SELLER_KYC_REQUIRED') {
        showToast('Você precisa concluir e ter o KYC aprovado para criar uma loja.');
      } else {
        showToast(errMsg);
      }
    }
  };

  const handleUpdateStore = async (updated: SellerStoreData) => {
    try {
      const res = await SellerService.updateStore(updated.id, updated);
      if (res.success) {
        setStores((prev) => prev.map((s) => (s.id === updated.id ? { ...s, ...updated } : s)));
        showToast('Dados da loja atualizados com sucesso!');
      } else {
        const errMsg = res.error?.message || res.message || 'Erro ao atualizar loja.';
        showToast(errMsg);
      }
    } catch (err: any) {
      showToast(err?.message || 'Erro ao comunicar com o servidor para atualizar loja.');
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
        showToast(res.message || 'Erro ao atualizar perfil.');
      }
    } catch (err: any) {
      showToast(err?.message || 'Erro ao atualizar perfil.');
    }
  };

  // Team Handlers (NO FAKE FALLBACK IF API FAILS)
  const handleAddTeamMember = async (member: SellerTeamMember) => {
    try {
      const res = await SellerService.addTeamMember(member);
      if (res.success && res.data) {
        setTeam((prev) => [...prev, res.data]);
        showToast('Membro da equipe adicionado com sucesso!');
      } else {
        const errMsg = res.error?.message || res.message || 'Erro ao adicionar membro à equipe.';
        showToast(errMsg);
      }
    } catch (err: any) {
      showToast(err?.message || 'Erro ao adicionar membro da equipe.');
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
      if (!res.success || !res.data?.id) {
        throw new Error(res.error?.message || res.message || 'Não foi possível cadastrar o produto.');
      }
      fetchSellerProducts();
      if (refetch) refetch();
      showToast(res.message || 'Produto publicado com sucesso no catálogo!');
      return res.data;
    } catch (err: any) {
      console.error('Error creating product:', err);
      const errMsg = err?.message || 'Falha ao cadastrar produto no catálogo.';
      showToast(errMsg);
      throw new Error(errMsg);
    }
  };

  const handleUpdateProduct = async (p: any) => {
    try {
      const res = await SellerService.updateProduct(p.id, p);
      fetchSellerProducts();
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
      fetchSellerProducts();
      if (refetch) refetch();
      showToast('Produto excluído do catálogo com sucesso!');
    } catch (err) {
      console.error('Error deleting product:', err);
      showToast('Erro ao excluir produto.');
    }
  };

  const openProductDetail = (pId: any) => {
    if (!pId || typeof pId !== 'string' || pId === 'undefined' || pId.trim() === '') {
      console.error('Tentativa de navegação com ID de produto inválido:', pId);
      showToast('Erro: ID do produto é inválido.');
      return;
    }
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
        unreadMessagesCount={0}
        openDisputesCount={0}
        ordersCount={0}
        taxId={profile?.taxId}
      />

      {/* Main Dynamic View Content Canvas */}
      <main className="flex-1 p-4 sm:p-6 lg:p-8 overflow-y-auto max-w-7xl mx-auto w-full">
        {/* Onboarding Activation Banner if Seller Record is Missing */}
        {needsOnboarding && (
          <div className="bg-purple-50 border-2 border-purple-300 rounded-2xl p-6 shadow-xs mb-6 flex flex-col md:flex-row items-center justify-between gap-4 animate-fadeIn">
            <div className="flex items-center gap-3">
              <div className="p-3 bg-purple-100 text-purple-800 rounded-2xl shrink-0">
                <ShieldCheck className="w-6 h-6" />
              </div>
              <div>
                <h3 className="font-black text-sm text-purple-950 flex items-center gap-2">
                  🚀 Cadastro de Vendedor Pendente de Ativação
                </h3>
                <p className="text-xs text-purple-800 mt-1">
                  Seu usuário possui acesso ao portal do vendedor, mas o seu perfil de vendedor ainda não foi ativado no banco de dados. Clique no botão ao lado para ativar seu perfil e iniciar a verificação de documentos.
                </p>
              </div>
            </div>
            <button
              onClick={handleStartOnboarding}
              disabled={isOnboardingLoading}
              className="bg-purple-700 hover:bg-purple-800 text-white font-bold px-4 py-2.5 rounded-xl text-xs transition shrink-0 cursor-pointer flex items-center gap-2 shadow-xs"
            >
              {isOnboardingLoading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" /> Ativando...
                </>
              ) : (
                'Ativar Cadastro de Vendedor'
              )}
            </button>
          </div>
        )}

        {/* Unverified Seller Lock Banner for Restricted Features */}
        {!isSellerKycApproved(profile?.kycStatus) && ['stores', 'team', 'product_create'].includes(activeSection) && (
          <div className="bg-amber-50 border-2 border-amber-300 rounded-2xl p-6 shadow-xs mb-6 flex flex-col md:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="p-3 bg-amber-100 text-amber-800 rounded-2xl shrink-0">
                <Lock className="w-6 h-6" />
              </div>
              <div>
                <h3 className="font-black text-sm text-amber-950 flex items-center gap-2">
                  🔒 Recurso Bloqueado: Verificação KYC Necessária
                </h3>
                <p className="text-xs text-amber-800 mt-1">
                  Sua conta de vendedor precisa ter a verificação de identidade e documentos (KYC) enviada e aprovada pelo Administrador para liberar a criação de lojas, cadastro de produtos e gestão de equipe.
                </p>
              </div>
            </div>
            <button
              onClick={() => setActiveSection('kyc')}
              className="bg-amber-600 hover:bg-amber-700 text-white font-bold px-4 py-2.5 rounded-xl text-xs transition shrink-0 cursor-pointer flex items-center gap-2 shadow-xs"
            >
              <ShieldCheck className="w-4 h-4" /> Ir para Verificação KYC
            </button>
          </div>
        )}

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
            profile={profile}
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
            products={sellerProducts}
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
            selectedStore={selectedStore}
            stores={stores}
            onSelectStore={(stId) => setSelectedStoreId(stId)}
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
            onRefreshOrders={loadRealSellerData}
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
