export interface PaginatedResponse<T> {
  items: T[];
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export interface PaginationParams {
  page?: number;
  limit?: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

export interface ProductFilters extends PaginationParams {
  category?: string;
  country?: string;
  // FASE D16-G1 — filtro OPCIONAL de país de ORIGEM, independente de
  // `country` (destino/elegibilidade) — nunca o substitui.
  originCountryFilter?: string;
  minPrice?: number;
  maxPrice?: number;
  freeShipping?: boolean;
  sellerId?: string;
  search?: string;
  badge?: string;
}

export interface OrderFilters extends PaginationParams {
  status?: string;
  buyerId?: string;
  sellerId?: string;
  startDate?: string;
  endDate?: string;
  escrowStatus?: string;
}

export interface SellerFilters extends PaginationParams {
  country?: string;
  isVerified?: boolean;
  isOfficial?: boolean;
  category?: string;
  search?: string;
}

export interface PaymentFilters extends PaginationParams {
  method?: string;
  status?: string;
  currency?: string;
}

export interface NotificationFilters extends PaginationParams {
  type?: string;
  isRead?: boolean;
}

export interface DisputeFilters extends PaginationParams {
  status?: string;
  orderId?: string;
}

// ============================================================================
// Fase M1-D1 — contrato explícito de checkout (legacy vs purchase_group).
// Espelha à mão o shape real de OrderService.createOrderFromCart
// (orderService.ts) — sem import cruzado frontend->server (convenção já
// existente neste projeto: nenhum arquivo em src/components|services|api
// importa de src/server). Mudar um lado exige atualizar o outro à mão.
// ============================================================================

export interface CheckoutOrderItem {
  productId: string;
  variantId: string | null;
  productTitle: string;
  productSku: string | null;
  variantTitle: string | null;
  quantity: number;
  unitPrice: number;
  subtotal: number;
  sellerId: string | null;
  storeId: string | null;
  productImage: string | null;
  inventoryId: string;
  warehouseId: string | null;
  fulfillmentMode: string;
}

export interface CheckoutOrder {
  id: string;
  orderNumber: string;
  buyerId: string;
  sellerId: string | null;
  subtotal: number;
  shippingFee: number;
  shippingCost: number;
  shippingSellerSubsidy: number;
  shippingMarketplaceSubsidy: number;
  marketplaceCommission: number;
  sellerNetAmount: number;
  totalAmount: number;
  currency: string;
  status: string;
  paymentMethod: string | null;
  paymentStatus: string;
  escrowStatus: string;
  purchaseGroupId: string | null;
  createdAt: string;
  items: CheckoutOrderItem[];
}

export interface CheckoutPurchaseGroup {
  id: string;
  buyerId: string;
  currency: string;
  totalAmount: number;
  status: string;
}

// Discriminante `mode` reaproveita o MESMO nome/valores já usados no backend
// (paymentService.ts: `mode: 'legacy' | 'purchase_group'`) para a idêntica
// distinção — nenhum nome novo inventado (ex.: "checkoutType"). Contrato
// ADITIVO: todo campo de CheckoutOrder no nível raiz continua presente em
// AMBOS os modos, exatamente como o backend já retorna hoje — nenhum
// consumidor legado que lê `result.id`/`result.totalAmount` direto quebra.
// Em `mode: 'purchase_group'`, os campos de raiz continuam sendo os do
// PRIMEIRO child (compatibilidade retroativa) — mas nenhum consumidor NOVO
// deve tratar isso como identidade financeira do group: a identidade real é
// `purchaseGroup.id` (== `purchaseGroupId`), e a lista completa de child
// orders é `orders`.
export interface LegacyCheckoutResult extends CheckoutOrder {
  mode: 'legacy';
}

export interface PurchaseGroupCheckoutResult extends CheckoutOrder {
  mode: 'purchase_group';
  purchaseGroup: CheckoutPurchaseGroup;
  orders: CheckoutOrder[];
}

export type CreateOrderFromCartResult = LegacyCheckoutResult | PurchaseGroupCheckoutResult;

export interface PixPaymentDetails {
  encodedImage?: string;
  payload?: string;
  expirationDate?: string;
}

// Resposta de POST /payments/initiate (legacy, 1 order = 1 payment).
export interface OrderPaymentInitiationResult {
  id: string;
  orderId: string;
  provider?: string;
  providerPaymentId?: string;
  method: string;
  status: string;
  processing?: boolean;
  amount: number;
  currency: string;
  pix?: PixPaymentDetails;
  qrCode?: string;
  qrCodeBase64?: string;
}

// Resposta de POST /payments/purchase-groups/:purchaseGroupId/initiate —
// mesmo formato do legacy, mas com `purchaseGroupId` no lugar de `orderId`
// (nunca os dois juntos: um pagamento financia OU um order OU um group,
// nunca ambos ao mesmo tempo — refletido pelas duas interfaces distintas em
// vez de um único tipo com os dois campos opcionais).
export interface PurchaseGroupPaymentInitiationResult {
  id: string;
  purchaseGroupId: string;
  provider?: string;
  providerPaymentId?: string;
  method: string;
  status: string;
  processing?: boolean;
  amount: number;
  currency: string;
  pix?: PixPaymentDetails;
  qrCode?: string;
  qrCodeBase64?: string;
}

// Resposta de GET /buyer/purchase-groups/:id (leitura para reload da tela de
// confirmação multi-seller). Deliberadamente NÃO inclui QR/pix/providerRaw —
// esses só existem na resposta de initiatePurchaseGroupPayment, que é
// idempotente e re-chamável em caso de reload.
export interface PurchaseGroupDetailOrderItem {
  id: string;
  productId: string;
  productTitle: string;
  productImage: string | null;
  quantity: number;
  unitPrice: number;
  subtotal: number;
}

export interface PurchaseGroupDetailOrder {
  id: string;
  orderNumber: string;
  sellerId: string | null;
  sellerName: string | null;
  status: string;
  paymentStatus: string;
  escrowStatus: string;
  // Fase M1-D3 — status de entrega consolidado do child (PREPARING /
  // READY_TO_SHIP / SHIPPED / IN_TRANSIT / OUT_FOR_DELIVERY / DELIVERED),
  // rastreio e disputa ativa. Cada child tem fulfillment independente.
  logisticsStatus: string;
  trackingCode: string | null;
  hasActiveDispute: boolean;
  totalAmount: number;
  currency: string;
  createdAt: string;
  items: PurchaseGroupDetailOrderItem[];
}

export interface PurchaseGroupDetailPayment {
  status: string;
  provider: string | null;
  method: string;
  processing: boolean;
}

export interface PurchaseGroupDetail {
  id: string;
  buyerId: string;
  currency: string;
  totalAmount: number;
  status: string;
  createdAt: string;
  orders: PurchaseGroupDetailOrder[];
  payment: PurchaseGroupDetailPayment | null;
}
