import React, { createContext, useContext, useState, useEffect } from 'react';
import {
  Product,
  CartItem,
  Order,
  FilterState,
  DeliveryAddress,
  PaymentDetails,
  ProductCondition,
  CountryCode,
  CurrencyCode,
  KycDocument,
  Store,
  Dispute,
  Warehouse,
  AppView,
  EscrowDetails,
} from '../types';
import { mockProducts } from '../data/mockData';
import { mockStores, mockKycDocuments, mockDisputes, mockWarehouses, mockInternationalProducts } from '../data/mockInternationalData';
import { countriesConfig } from '../utils/currencyUtils';
import { normalizeProduct } from '../utils/productUtils';
import { CartService } from '../services/cartService';
import { storageService } from '../services/storage/storageService';
import { useAuth } from './AuthContext';
import { useCountries } from '../hooks/useCountries';
import { resolveCurrencyForCountry as resolveCurrencyForCountryShared } from '../utils/countryResolution';

interface MarketplaceContextType {
  products: Product[];
  cart: CartItem[];
  favorites: string[];
  orders: Order[];
  stores: Store[];
  kycDocuments: KycDocument[];
  disputes: Dispute[];
  warehouses: Warehouse[];
  selectedCountry: CountryCode;
  selectedCurrency: CurrencyCode;
  userLocation: { zipCode: string; city: string; state: string; street: string; country: CountryCode };
  activeView: AppView;
  selectedProductId: string | null;
  selectedStoreId: string | null;
  activeOrder: Order | null;
  filterState: FilterState;
  isAiAssistantOpen: boolean;
  setIsAiAssistantOpen: (open: boolean) => void;
  // Country & Currency
  setSelectedCountry: (country: CountryCode) => void;
  setSelectedCurrency: (currency: CurrencyCode) => void;
  // Navigation & View Actions
  setActiveView: (view: AppView) => void;
  openProductDetail: (productId: string) => void;
  openStorePublic: (storeId: string) => void;
  openOrderDetail: (order: Order) => void;
  trackOrder: (order: Order) => void;
  setSearchQuery: (query: string) => void;
  selectCategory: (categorySlug: string) => void;
  updateFilterState: (updates: Partial<FilterState>) => void;
  resetFilters: () => void;
  updateLocation: (zipCode: string, city: string, state: string, street: string, country?: CountryCode) => void;
  // Cart Actions
  addToCart: (product: Product, quantity?: number, color?: string, storage?: string) => void;
  removeFromCart: (productId: string) => void;
  updateCartQuantity: (productId: string, quantity: number) => void;
  clearCart: () => void;
  cartTotal: number;
  cartItemCount: number;
  // Favorites
  toggleFavorite: (productId: string) => void;
  isFavorite: (productId: string) => boolean;
  // Orders & Escrow
  placeOrder: (deliveryAddress: DeliveryAddress, paymentDetails: PaymentDetails) => Order;
  setActiveOrder: (order: Order | null) => void;
  confirmOrderReceipt: (orderId: string) => void;
  // Seller & KYC & Stores
  addNewProduct: (product: Omit<Product, 'id' | 'rating' | 'reviewsCount' | 'questions' | 'reviews'>) => Product;
  addQuestionToProduct: (productId: string, questionText: string, answerText?: string) => void;
  submitKycDocument: (doc: Omit<KycDocument, 'id' | 'submittedAt' | 'status'>) => void;
  createNewStore: (store: Omit<Store, 'id' | 'rating' | 'followersCount' | 'status' | 'createdAt'>) => void;
  // Disputes
  openDispute: (orderId: string, reason: any, description: string) => Dispute;
  addDisputeMessage: (disputeId: string, text: string) => void;
  resolveDisputeAdmin: (disputeId: string, decision: 'refund' | 'release', note: string) => void;
  // Admin KYC
  reviewKycAdmin: (kycId: string, status: 'verified' | 'rejected', reason?: string) => void;
  // Toast
  toastMessage: string | null;
  showToast: (msg: string) => void;
}

const defaultFilterState: FilterState = {
  query: '',
  category: '',
  country: 'all',
  priceMin: undefined,
  priceMax: undefined,
  condition: 'all',
  freeShippingOnly: false,
  arrivesTomorrowOnly: false,
  fullOnly: false,
  sellerPlatinumOnly: false,
  internationalOnly: false,
  sortBy: 'relevance',
};

const MarketplaceContext = createContext<MarketplaceContextType | undefined>(undefined);

const LOCAL_STORAGE_KEY_CART = 'nusali_cart_v2';
const LOCAL_STORAGE_KEY_FAVS = 'nusali_favs_v2';
const LOCAL_STORAGE_KEY_ORDERS = 'nusali_orders_v2';
const LOCAL_STORAGE_KEY_PRODS = 'nusali_prods_v2';
const LOCAL_STORAGE_KEY_COUNTRY = 'nusali_country_v2';

export const MarketplaceProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [selectedCountry, setSelectedCountryState] = useState<CountryCode>(() => {
    return (localStorage.getItem(LOCAL_STORAGE_KEY_COUNTRY) as CountryCode) || 'GW';
  });

  // Países operacionais reais (GET /api/v1/countries) — fonte única de
  // verdade para moeda por país. countriesConfig só serve de fallback
  // seguro enquanto a lista real ainda não carregou (nunca trava a UI, e
  // nunca é usado para decidir QUAIS países existem).
  const { data: operationalCountries } = useCountries();

  const resolveCurrencyForCountry = (code: CountryCode): CurrencyCode => {
    const legacyMap: Record<string, string> = Object.fromEntries(
      Object.entries(countriesConfig).map(([k, v]) => [k, v.currency])
    );
    return (resolveCurrencyForCountryShared(code, operationalCountries, legacyMap) as CurrencyCode) || 'XOF';
  };

  const [selectedCurrency, setSelectedCurrency] = useState<CurrencyCode>(
    resolveCurrencyForCountry(selectedCountry)
  );

  // Se a lista real carrega DEPOIS da seleção inicial (ex.: país vindo do
  // localStorage), resincroniza a moeda assim que os dados reais chegarem —
  // sem isso, um país real como GM/SN ficaria preso na moeda de fallback.
  useEffect(() => {
    if (operationalCountries) {
      setSelectedCurrency(resolveCurrencyForCountry(selectedCountry));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [operationalCountries]);

  const setSelectedCountry = (country: CountryCode) => {
    setSelectedCountryState(country);
    localStorage.setItem(LOCAL_STORAGE_KEY_COUNTRY, country);
    setSelectedCurrency(resolveCurrencyForCountry(country));
  };

  const initialAllProducts = [...mockInternationalProducts, ...mockProducts.map(p => ({
    ...p,
    currency: (p.currency || 'BRL') as CurrencyCode,
    shipping: {
      ...p.shipping,
      isInternational: false,
      originCountry: 'BR' as CountryCode,
    },
    seller: {
      ...p.seller,
      kycStatus: 'verified' as const,
      country: 'BR' as CountryCode,
    }
  }))].map(normalizeProduct);

  const [products, setProducts] = useState<Product[]>(() => {
    try {
      const saved = localStorage.getItem(LOCAL_STORAGE_KEY_PRODS);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) {
          return parsed.map(normalizeProduct);
        }
      }
      return initialAllProducts;
    } catch {
      return initialAllProducts;
    }
  });

  const [cart, setCart] = useState<CartItem[]>(() => {
    try {
      const saved = localStorage.getItem(LOCAL_STORAGE_KEY_CART);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) {
          return parsed.map((item: any) => ({
            ...item,
            product: normalizeProduct(item.product),
          }));
        }
      }
      return [];
    } catch {
      return [];
    }
  });

  const [favorites, setFavorites] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem(LOCAL_STORAGE_KEY_FAVS);
      return saved ? JSON.parse(saved) : ['prod-int-1', 'prod-1'];
    } catch {
      return ['prod-int-1', 'prod-1'];
    }
  });

  const [stores, setStores] = useState<Store[]>(mockStores);
  const [kycDocuments, setKycDocuments] = useState<KycDocument[]>(mockKycDocuments);
  const [disputes, setDisputes] = useState<Dispute[]>(mockDisputes);
  const [warehouses] = useState<Warehouse[]>(mockWarehouses);

  const [orders, setOrders] = useState<Order[]>(() => {
    try {
      const saved = localStorage.getItem(LOCAL_STORAGE_KEY_ORDERS);
      if (saved) return JSON.parse(saved);
    } catch {}
    const initialOrder: Order = {
      id: 'NSL-8941203',
      date: new Date(Date.now() - 86400000 * 2).toLocaleDateString('pt-BR'),
      items: [
        {
          product: mockInternationalProducts[0],
          quantity: 2,
        },
      ],
      subtotal: 19000,
      shippingFee: 0,
      customsDuty: 0,
      discount: 0,
      total: 19000,
      currency: 'XOF',
      deliveryAddress: {
        recipientName: 'Alex Silva',
        cpfOrTaxId: 'NIF 8941203',
        zipCode: '1000',
        street: 'Avenida Amílcar Cabral',
        number: '12',
        complement: 'Bloco B',
        neighborhood: 'Praça dos Heróis',
        city: 'Bissau',
        state: 'Bissau',
        country: 'GW',
        phone: '+245 955123456',
      },
      paymentDetails: {
        method: 'orange_money',
        currency: 'XOF',
        phoneNumber: '+245 955123456',
        transactionRef: 'OM-GW-98124012',
      },
      status: 'shipped',
      escrow: {
        status: 'held',
        amountRetained: 19000,
        currency: 'XOF',
        retainedAt: '2026-07-29',
        releaseEligibleAt: '2026-08-05',
        notes: 'Pagamento seguro mantido em retenção Escrow até confirmação de recebimento pelo comprador.',
      },
      estimatedDelivery: 'Chega Quinta-feira via Nusali Express',
      trackingCode: 'GW8941203892NSL',
      carrierName: 'Nusali Express Logistics (Guiné-Bissau)',
      originCountry: 'GW',
      destinationCountry: 'GW',
      trackingSteps: [
        { status: 'confirmed', title: 'Pagamento aprovado via Orange Money', description: 'Dinheiro retido com segurança pelo sistema Escrow', timestamp: 'Há 2 dias', completed: true },
        { status: 'preparing', title: 'Separação no HUB Bissau-Bandim', description: 'Embalagem certificada para transporte local', timestamp: 'Ontem 14:20', completed: true },
        { status: 'shipped', title: 'Em trânsito urbano', description: 'A caminho do ponto de entrega em Bissau', timestamp: 'Hoje 08:30', completed: true },
        { status: 'out_for_delivery', title: 'Saiu para entrega', description: 'Estafeta em rota final', timestamp: 'Pendente', completed: false },
        { status: 'delivered', title: 'Entregue', description: 'Confirmação do comprador libera retenção', timestamp: 'Pendente', completed: false },
      ],
    };
    return [initialOrder];
  });

  const [userLocation, setUserLocation] = useState({
    zipCode: '1000',
    city: 'Bissau',
    state: 'Bissau',
    street: 'Av. Amílcar Cabral, 12',
    country: 'GW' as CountryCode,
  });

  const [activeView, setActiveView] = useState<AppView>('home');
  const [selectedProductId, setSelectedProductId] = useState<string | null>(null);
  const [selectedStoreId, setSelectedStoreId] = useState<string | null>('store-gw-1');
  const [activeOrder, setActiveOrder] = useState<Order | null>(null);
  const [filterState, setFilterState] = useState<FilterState>(defaultFilterState);
  const [isAiAssistantOpen, setIsAiAssistantOpen] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const { isAuthenticated, token } = useAuth();

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage(null);
    }, 3000);
  };

  // Fetch cart from PostgreSQL when user is authenticated; fallback to localStorage for visitor
  useEffect(() => {
    const activeToken = token || storageService.getToken();
    if (activeToken) {
      CartService.fetchServerCart()
        .then((serverItems) => {
          setCart(serverItems);
        })
        .catch((err) => {
          console.error('Erro ao carregar carrinho do servidor:', err);
          showToast(err?.message || 'Erro ao carregar seu carrinho do servidor.');
        });
    } else {
      setCart(CartService.getCart());
    }
  }, [isAuthenticated, token]);

  // LocalStorage sync MUST ONLY serve unauthenticated visitors
  useEffect(() => {
    if (!isAuthenticated && !storageService.getToken()) {
      localStorage.setItem(LOCAL_STORAGE_KEY_CART, JSON.stringify(cart));
    }
  }, [cart, isAuthenticated]);

  useEffect(() => {
    localStorage.setItem(LOCAL_STORAGE_KEY_FAVS, JSON.stringify(favorites));
  }, [favorites]);

  useEffect(() => {
    localStorage.setItem(LOCAL_STORAGE_KEY_ORDERS, JSON.stringify(orders));
  }, [orders]);

  useEffect(() => {
    localStorage.setItem(LOCAL_STORAGE_KEY_PRODS, JSON.stringify(products));
  }, [products]);

  const openProductDetail = (productId: string) => {
    setSelectedProductId(productId);
    setActiveView('product_detail');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const openStorePublic = (storeId: string) => {
    setSelectedStoreId(storeId);
    setActiveView('store_public');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const openOrderDetail = (order: Order) => {
    setActiveOrder(order);
    setActiveView('order_detail');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const trackOrder = (order: Order) => {
    setActiveOrder(order);
    setActiveView('tracking');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const setSearchQuery = (query: string) => {
    setFilterState(prev => ({ ...prev, query, category: '' }));
    setActiveView('search');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const selectCategory = (categorySlug: string) => {
    setFilterState(prev => ({ ...prev, category: categorySlug, query: '' }));
    setActiveView('search');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const updateFilterState = (updates: Partial<FilterState>) => {
    setFilterState(prev => ({ ...prev, ...updates }));
  };

  const resetFilters = () => {
    setFilterState(defaultFilterState);
  };

  const updateLocation = (zipCode: string, city: string, state: string, street: string, country: CountryCode = selectedCountry) => {
    setUserLocation({ zipCode, city, state, street, country });
    setSelectedCountry(country);
  };

  const addToCart = async (product: Product, quantity: number = 1, color?: string, storage?: string) => {
    const normalized = normalizeProduct(product);
    try {
      const updated = await CartService.addItem(product, quantity, { color, storage });
      setCart(updated);
      showToast(`"${normalized.title.slice(0, 28)}..." adicionado ao carrinho!`);
    } catch (err: any) {
      showToast(err?.message || 'Erro ao adicionar produto ao carrinho.');
      throw err;
    }
  };

  const removeFromCart = async (productIdOrItemId: string) => {
    try {
      const updated = await CartService.removeItem(productIdOrItemId);
      setCart(updated);
    } catch (err: any) {
      showToast(err?.message || 'Erro ao remover item do carrinho.');
      throw err;
    }
  };

  const updateCartQuantity = async (productIdOrItemId: string, quantity: number) => {
    try {
      const updated = await CartService.updateQuantity(productIdOrItemId, quantity);
      setCart(updated);
    } catch (err: any) {
      showToast(err?.message || 'Erro ao atualizar quantidade do carrinho.');
      throw err;
    }
  };

  const clearCart = async () => {
    try {
      const updated = await CartService.clearCart();
      setCart(updated);
    } catch (err: any) {
      showToast(err?.message || 'Erro ao limpar carrinho.');
      throw err;
    }
  };

  const cartTotal = cart.reduce((acc, item) => acc + item.product.price * item.quantity, 0);
  const cartItemCount = cart.reduce((acc, item) => acc + item.quantity, 0);

  const toggleFavorite = (productId: string) => {
    setFavorites(prev => {
      const isFav = prev.includes(productId);
      const updated = isFav ? prev.filter(id => id !== productId) : [...prev, productId];
      showToast(isFav ? 'Removido dos favoritos' : 'Adicionado aos favoritos!');
      return updated;
    });
  };

  const isFavorite = (productId: string) => favorites.includes(productId);

  const placeOrder = (_deliveryAddress: DeliveryAddress, _paymentDetails: PaymentDetails): Order => {
    throw new Error('LEGACY_CHECKOUT_DISABLED: O checkout local foi desativado. Utilize o CheckoutView com OrdersApi.');
  };

  const confirmOrderReceipt = (orderId: string) => {
    setOrders(prev =>
      prev.map(o => {
        if (o.id === orderId) {
          return {
            ...o,
            status: 'delivered',
            escrow: {
              ...o.escrow,
              status: 'released',
              releasedAt: new Date().toISOString().slice(0, 10),
              notes: 'Pagamento liberado ao vendedor após confirmação do comprador.',
            },
          };
        }
        return o;
      })
    );
    showToast('Recebimento confirmado! Pagamento liberado com sucesso ao vendedor.');
  };

  const addNewProduct = (
    productData: Omit<Product, 'id' | 'rating' | 'reviewsCount' | 'questions' | 'reviews'>
  ): Product => {
    const newProduct = normalizeProduct({
      ...productData,
      id: `prod-${Date.now()}`,
      currency: productData.currency || selectedCurrency,
      rating: 5.0,
      reviewsCount: 1,
      questions: [],
      reviews: [],
    });

    setProducts(prev => [newProduct, ...prev]);
    showToast('Novo produto anunciado com sucesso no Mercado Nusali!');
    return newProduct;
  };

  const addQuestionToProduct = (productId: string, questionText: string, answerText?: string) => {
    setProducts(prev =>
      prev.map(p => {
        if (p.id === productId) {
          const newQuestion = {
            id: `q-${Date.now()}`,
            user: 'Você',
            date: 'Agora',
            question: questionText,
            answer: answerText || 'Olá! Obrigado pela pergunta. Produto original com garantia e envio rápido.',
            answerDate: 'Agora mesmo',
          };
          return {
            ...p,
            questions: [newQuestion, ...p.questions],
          };
        }
        return p;
      })
    );
  };

  const submitKycDocument = (docData: Omit<KycDocument, 'id' | 'submittedAt' | 'status'>) => {
    const newDoc: KycDocument = {
      ...docData,
      id: `kyc-${Date.now()}`,
      submittedAt: new Date().toISOString().replace('T', ' ').slice(0, 16),
      status: 'under_review',
    };
    setKycDocuments(prev => [newDoc, ...prev]);
    showToast('Documentos KYC enviados para análise administrativa!');
  };

  const createNewStore = (
    storeData: Omit<Store, 'id' | 'rating' | 'followersCount' | 'status' | 'createdAt'>
  ) => {
    const newStore: Store = {
      ...storeData,
      id: `store-${Date.now()}`,
      rating: 5.0,
      followersCount: 1,
      status: 'active',
      createdAt: new Date().toISOString().slice(0, 10),
    };
    setStores(prev => [newStore, ...prev]);
    showToast(`Loja "${newStore.name}" criada com sucesso!`);
  };

  const openDispute = (orderId: string, reason: any, description: string): Dispute => {
    const targetOrder = orders.find(o => o.id === orderId);
    const newDispute: Dispute = {
      id: `disp-${Math.floor(100 + Math.random() * 900)}`,
      orderId,
      buyerName: targetOrder?.deliveryAddress.recipientName || 'Comprador Nusali',
      sellerName: targetOrder?.items[0]?.product.seller.name || 'Vendedor',
      productTitle: targetOrder?.items[0]?.product.title || 'Produto em disputa',
      productImage: targetOrder?.items[0]?.product.image || '',
      amount: targetOrder?.total || 0,
      currency: targetOrder?.currency || selectedCurrency,
      reason,
      description,
      evidenceUrls: [],
      createdAt: new Date().toISOString().replace('T', ' ').slice(0, 16),
      status: 'opened',
      messages: [
        {
          id: `msg-${Date.now()}`,
          sender: 'buyer',
          senderName: targetOrder?.deliveryAddress.recipientName || 'Comprador',
          text: description,
          timestamp: 'Agora',
        },
      ],
    };

    setDisputes(prev => [newDispute, ...prev]);
    setOrders(prev =>
      prev.map(o => (o.id === orderId ? { ...o, status: 'disputed', escrow: { ...o.escrow, status: 'disputed' } } : o))
    );
    showToast('Disputa aberta! O dinheiro permanecerá retido até a resolução.');
    return newDispute;
  };

  const addDisputeMessage = (disputeId: string, text: string) => {
    setDisputes(prev =>
      prev.map(d => {
        if (d.id === disputeId) {
          return {
            ...d,
            messages: [
              ...d.messages,
              {
                id: `msg-${Date.now()}`,
                sender: 'buyer',
                senderName: 'Você',
                text,
                timestamp: 'Agora',
              },
            ],
          };
        }
        return d;
      })
    );
  };

  const resolveDisputeAdmin = (disputeId: string, decision: 'refund' | 'release', note: string) => {
    const targetDispute = disputes.find(d => d.id === disputeId);
    if (!targetDispute) return;

    setDisputes(prev =>
      prev.map(d => {
        if (d.id === disputeId) {
          return {
            ...d,
            status: decision === 'refund' ? 'resolved_refunded' : 'resolved_released',
            adminDecision: note,
          };
        }
        return d;
      })
    );

    setOrders(prev =>
      prev.map(o => {
        if (o.id === targetDispute.orderId) {
          return {
            ...o,
            escrow: {
              ...o.escrow,
              status: decision === 'refund' ? 'refunded' : 'released',
              notes: `Decisão administrativa: ${note}`,
            },
          };
        }
        return o;
      })
    );

    showToast(`Disputa resolvida! Resultado: ${decision === 'refund' ? 'Reembolsado ao comprador' : 'Liberado ao vendedor'}`);
  };

  const reviewKycAdmin = (kycId: string, status: 'verified' | 'rejected', reason?: string) => {
    setKycDocuments(prev =>
      prev.map(k => (k.id === kycId ? { ...k, status, rejectionReason: reason, reviewedAt: new Date().toISOString() } : k))
    );
    showToast(`KYC ${status === 'verified' ? 'Aprovado' : 'Rejeitado'} com sucesso!`);
  };

  return (
    <MarketplaceContext.Provider
      value={{
        products,
        cart,
        favorites,
        orders,
        stores,
        kycDocuments,
        disputes,
        warehouses,
        selectedCountry,
        selectedCurrency,
        userLocation,
        activeView,
        selectedProductId,
        selectedStoreId,
        activeOrder,
        filterState,
        isAiAssistantOpen,
        setIsAiAssistantOpen,
        setSelectedCountry,
        setSelectedCurrency,
        setActiveView,
        openProductDetail,
        openStorePublic,
        openOrderDetail,
        trackOrder,
        setSearchQuery,
        selectCategory,
        updateFilterState,
        resetFilters,
        updateLocation,
        addToCart,
        removeFromCart,
        updateCartQuantity,
        clearCart,
        cartTotal,
        cartItemCount,
        toggleFavorite,
        isFavorite,
        placeOrder,
        setActiveOrder,
        confirmOrderReceipt,
        addNewProduct,
        addQuestionToProduct,
        submitKycDocument,
        createNewStore,
        openDispute,
        addDisputeMessage,
        resolveDisputeAdmin,
        reviewKycAdmin,
        toastMessage,
        showToast,
      }}
    >
      {children}
    </MarketplaceContext.Provider>
  );
};

export const useMarketplace = () => {
  const context = useContext(MarketplaceContext);
  if (!context) {
    throw new Error('useMarketplace must be used within a MarketplaceProvider');
  }
  return context;
};

