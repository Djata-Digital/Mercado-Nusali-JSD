import { CountryCode, CurrencyCode, OrderStatus, EscrowStatus } from '../types';
import { mockProducts } from './mockData';

export interface SellerProfileData {
  id: string;
  fullName: string;
  commercialName: string;
  sellerType: 'pessoa_fisica' | 'empresa_individual' | 'sociedade' | 'marca_oficial' | 'vendedor_internacional';
  taxId: string; // NIF / CNPJ / NIF PT
  country: CountryCode;
  city: string;
  address: string;
  phone: string;
  email: string;
  kycStatus: 'verified' | 'under_review' | 'pending' | 'rejected';
  kycLevel: string;
  verificationDate: string;
  reputationLevel: 'platinum' | 'gold' | 'lider' | 'novo';
  reputationScore: number;
  authorizedCountries: CountryCode[];
  preferredCurrency: CurrencyCode;
  payoutMethods: {
    id: string;
    type: 'orange_money' | 'mtn' | 'pix' | 'bank_transfer';
    name: string;
    details: string;
    isDefault: boolean;
  }[];
  vacationMode: boolean;
}

export interface SellerStoreData {
  id: string;
  name: string;
  slug: string;
  logo: string;
  banner: string;
  description: string;
  category: string;
  country: CountryCode;
  city: string;
  address: string;
  phone: string;
  email: string;
  openingHours: string;
  exchangePolicy: string;
  warrantyPolicy: string;
  returnPolicy: string;
  status: 'active' | 'suspended' | 'pending_approval';
  isOfficial: boolean;
  rating: number;
  followersCount: number;
  salesCount: number;
  acceptedCurrencies: CurrencyCode[];
  acceptedPayments: string[];
  shippingMethods: string[];
  categoryId?: string;
  businessHoursJson?: any;
  addressJson?: any;
}

export interface SellerTeamMember {
  id: string;
  name: string;
  email: string;
  phone: string;
  role: 'owner' | 'manager' | 'attendant' | 'order_operator' | 'inventory_manager' | 'financial' | 'marketing';
  assignedStoreId: string;
  status: 'active' | 'pending' | 'suspended';
  lastAccess: string;
}

export interface SellerWarehouseStock {
  id: string;
  warehouseName: string;
  warehouseCode: string;
  country: CountryCode;
  type: 'hub_fulfillment' | 'local_store' | 'cross_border_gateway';
  totalUnits: number;
  availableUnits: number;
  reservedUnits: number;
  inTransitUnits: number;
  capacityPercentage: number;
  monthlyStorageFee: number;
}

// Correção crítica (Pedidos de Venda quebrando a página): este tipo
// descrevia um shape que GET /seller/orders nunca devolveu de verdade
// (netPayout/commissionFee/storeName/trackingCode/shippingCarrier/timeline
// nunca existiram na resposta real — .map()/.toLocaleString() em undefined
// derrubava a página inteira). Campos que o backend realmente NUNCA envia
// agora são opcionais; nomenclatura financeira alinhada com o banco real
// (sellerNetAmount/marketplaceCommission, nunca dois nomes para a mesma
// coisa); campos financeiros novos e reais adicionados.
export interface SellerOrderData {
  id: string;
  orderNumber: string;
  storeId?: string;
  storeName?: string; // nunca enviado pelo backend hoje — sempre trate como ausente
  buyerName: string;
  buyerEmail?: string;
  buyerPhone: string;
  buyerCountry: CountryCode;
  deliveryCity: string;
  deliveryAddress?: string;
  productTitle: string;
  productSku: string;
  productImage: string;
  selectedColor?: string;
  selectedSize?: string;
  selectedVariantSku?: string;
  selectedVariantImage?: string;
  quantity: number;
  unitPrice: number;
  totalAmount: number;
  /** Comissão real do marketplace sobre o pedido (orders.marketplace_commission). Nomenclatura canônica — nunca "commissionFee". */
  marketplaceCommission?: number | null;
  /** Percentual de comissão aplicado no momento do pedido (orders.commission_rate_snapshot). null = não registrado (pedido legado). */
  commissionRateSnapshot?: number | null;
  /** Subsídio de frete pago pelo vendedor (orders.shipping_seller_subsidy). */
  shippingSellerSubsidy?: number | null;
  /** Valor líquido real do vendedor (orders.seller_net_amount). Nomenclatura canônica única — nunca "netPayout". */
  sellerNetAmount?: number | null;
  currency: CurrencyCode;
  paymentMethod: string;
  /** orders.payment_status real: pending | paid | failed | refunded. Nunca confundir com `status` (operacional). */
  paymentStatus?: string;
  status: OrderStatus;
  escrowStatus: EscrowStatus;
  escrowReleaseDate?: string; // nunca enviado pelo backend hoje
  shippingCarrier?: string; // nunca enviado pelo backend hoje
  trackingCode?: string;
  createdAt: string;
  /** Histórico estruturado de eventos — o backend real nunca envia isso hoje. Sempre trate como [] quando ausente, nunca invente eventos. */
  timeline?: { title: string; date: string; done: boolean }[];

  // --- Fase 1 Operacional (logística/frete) ---
  /** order_items.fulfillment_mode real: SELLER_FULFILLMENT | NUSALI_FULFILLMENT. Determinado na criação do pedido a partir de inventory.locationType — nunca escolhido pelo seller. */
  fulfillmentMode?: 'SELLER_FULFILLMENT' | 'NUSALI_FULFILLMENT';
  /** Custo operacional real do frete (orders.shipping_cost). */
  shippingCost?: number | null;
  /** Parcela do frete cobrada do comprador (orders.shipping_charged_to_buyer). */
  shippingChargedToBuyer?: number | null;
  /** Parcela do frete absorvida pela Nusali (orders.shipping_marketplace_subsidy) — nunca deduzida do vendedor. */
  shippingMarketplaceSubsidy?: number | null;
  /** order_items.shipment_id — presença determina se a etiqueta já existe. */
  shipmentId?: string | null;
  /** shipments.status do envio vinculado a este item, quando existir. */
  shipmentStatus?: string | null;
  /** shipments.tracking_number do envio vinculado a este item. */
  trackingNumber?: string | null;
  /** true quando já existe shipment+etiqueta para este item (independente do status físico). */
  labelAvailable?: boolean;
  /** Rótulo operacional já ciente do fulfillmentMode (ver deriveOperationalLabel no backend). */
  operationalLabel?: string;
  /** Única ação física que o PRÓPRIO seller pode executar neste item, ou null se nenhuma (ex.: item em HUB Nusali). */
  availableAction?: 'mark_ready_for_pickup' | null;
}

export interface SellerQuestion {
  id: string;
  productTitle: string;
  productImage: string;
  buyerName: string;
  buyerCountry: CountryCode;
  questionText: string;
  questionDate: string;
  answerText?: string;
  answerDate?: string;
  status: 'pending' | 'answered';
}

export interface SellerCustomer {
  id: string;
  name: string;
  email: string;
  country: CountryCode;
  city: string;
  totalOrders: number;
  totalSpentUSD: number;
  lastPurchaseDate: string;
  loyaltyTag: 'VIP Global' | 'Recorrente' | 'Novo Comprador';
  internalNotes: string;
}

export const initialSellerProfile: SellerProfileData = {
  id: '',
  fullName: 'Novo Vendedor',
  commercialName: 'Minha Loja',
  sellerType: 'empresa_individual',
  taxId: '',
  country: 'GW',
  city: '',
  address: '',
  phone: '',
  email: '',
  kycStatus: 'pending',
  kycLevel: 'Nível 1 - Pendente de Verificação',
  verificationDate: '',
  reputationLevel: 'novo',
  reputationScore: 0,
  authorizedCountries: ['GW'],
  preferredCurrency: 'XOF',
  payoutMethods: [],
  vacationMode: false,
};

export const initialSellerStores: SellerStoreData[] = [];

export const initialSellerTeam: SellerTeamMember[] = [];

export const initialWarehouses: SellerWarehouseStock[] = [];

export const initialSellerOrders: SellerOrderData[] = [];

export const initialSellerQuestions: SellerQuestion[] = [];

export const initialSellerCustomers: SellerCustomer[] = [];

export const mockSellerProfile = initialSellerProfile;
export const mockSellerProducts: any[] = [];
export const mockSellerOrders = initialSellerOrders;
export const mockSellerFinancialStats = {
  totalRevenueUSD: 0,
  pendingEscrowUSD: 0,
  availableBalanceUSD: 0,
  grossRevenueByCurrency: { XOF: 0, EUR: 0, BRL: 0 },
  payoutHistory: [],
};


