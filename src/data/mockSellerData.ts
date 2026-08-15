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
  kycLevel: 'Nível 3 - Vendedor Global Verificado';
  verificationDate: string;
  reputationLevel: 'platinum' | 'gold' | 'lider';
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

export interface SellerOrderData {
  id: string;
  orderNumber: string;
  storeId: string;
  storeName: string;
  buyerName: string;
  buyerEmail: string;
  buyerPhone: string;
  buyerCountry: CountryCode;
  deliveryCity: string;
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
  commissionFee: number;
  netPayout: number;
  currency: CurrencyCode;
  paymentMethod: string;
  status: OrderStatus;
  escrowStatus: EscrowStatus;
  escrowReleaseDate: string;
  shippingCarrier: string;
  trackingCode: string;
  createdAt: string;
  timeline: { title: string; date: string; done: boolean }[];
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
  id: 'sel-8941203',
  fullName: 'Alex Silva',
  commercialName: 'Silva Tech & Global Trading Lda',
  sellerType: 'sociedade',
  taxId: 'NIF 894120392',
  country: 'GW',
  city: 'Bissau',
  address: 'Avenida Amílcar Cabral, Nº 140, Centro Commercial Nusali',
  phone: '+245 955123456',
  email: 'comercial@silvatech.gw',
  kycStatus: 'verified',
  kycLevel: 'Nível 3 - Vendedor Global Verificado',
  verificationDate: '15/01/2026',
  reputationLevel: 'platinum',
  reputationScore: 4.95,
  authorizedCountries: ['GW', 'BR', 'PT', 'AO', 'US'],
  preferredCurrency: 'XOF',
  payoutMethods: [
    {
      id: 'pay-1',
      type: 'orange_money',
      name: 'Orange Money Guiné-Bissau',
      details: '+245 955123456 (Alex Silva)',
      isDefault: true,
    },
    {
      id: 'pay-2',
      type: 'mtn',
      name: 'MTN Mobile Money',
      details: '+245 966123456 (Silva Tech)',
      isDefault: false,
    },
    {
      id: 'pay-3',
      type: 'bank_transfer',
      name: 'BAO - Banco da África Ocidental',
      details: 'IBAN GW66 0001 0002 9841 2039 01',
      isDefault: false,
    },
  ],
  vacationMode: false,
};

export const initialSellerStores: SellerStoreData[] = [
  {
    id: 'store-1',
    name: 'Silva Eletrônicos & Tech Bissau',
    slug: 'silva-tech-bissau',
    logo: 'https://images.unsplash.com/photo-1531297484001-80022131f5a1?auto=format&fit=crop&w=300&q=80',
    banner: 'https://images.unsplash.com/photo-1526374965328-7f61d4dc18c5?auto=format&fit=crop&w=1200&q=80',
    description: 'Loja Oficial líder em Smartphones, Acessórios e Eletrodomésticos com garantia na Guiné-Bissau e envio Lusófono.',
    category: 'Eletrônicos e Tecnologia',
    country: 'GW',
    city: 'Bissau',
    address: 'Av. Amílcar Cabral, 140',
    phone: '+245 955123456',
    email: 'bissau@silvatech.gw',
    openingHours: 'Seg - Sáb: 08:00 - 19:00',
    exchangePolicy: 'Troca garantida em até 14 dias para produtos com defeito.',
    warrantyPolicy: '12 Meses de garantia oficial do fabricante com assistência local.',
    returnPolicy: 'Devolução grátis em até 7 dias sem custos de frete.',
    status: 'active',
    isOfficial: true,
    rating: 4.9,
    followersCount: 3840,
    salesCount: 1420,
    acceptedCurrencies: ['XOF', 'EUR', 'USD'],
    acceptedPayments: ['Orange Money', 'MTN Money', 'Nusali Pay', 'Cartão Visa'],
    shippingMethods: ['Nusali Express Local', 'Retirada na Loja Bissau', 'Envio Internacional Cross-Border'],
  },
  {
    id: 'store-2',
    name: 'Nusali Cross-Border Lisboa',
    slug: 'nusali-crossborder-lisboa',
    logo: 'https://images.unsplash.com/photo-1516321318423-f06f85e504b3?auto=format&fit=crop&w=300&q=80',
    banner: 'https://images.unsplash.com/photo-1441986300917-64674bd600d8?auto=format&fit=crop&w=1200&q=80',
    description: 'Produtos importados da Europa diretamente para a África Ocidental e Brasil com faturamento em Euro/CFA.',
    category: 'Moda & Utensílios Importados',
    country: 'PT',
    city: 'Lisboa',
    address: 'Avenida da Liberdade, 220',
    phone: '+351 912345678',
    email: 'lisboa@silvatech.gw',
    openingHours: 'Seg - Sex: 09:00 - 18:00',
    exchangePolicy: 'Troca rápida internacional em 30 dias.',
    warrantyPolicy: '24 Meses norma União Europeia.',
    returnPolicy: 'Devolução simples com etiqueta de logística reversa.',
    status: 'active',
    isOfficial: false,
    rating: 4.8,
    followersCount: 1250,
    salesCount: 680,
    acceptedCurrencies: ['EUR', 'XOF', 'BRL'],
    acceptedPayments: ['MB WAY', 'PIX', 'Cartão Visa/Mastercard', 'Nusali Pay'],
    shippingMethods: ['Nusali Express Aéreo', 'HUB Lisboa Transit'],
  },
];

export const initialSellerTeam: SellerTeamMember[] = [
  {
    id: 'tm-1',
    name: 'Alex Silva',
    email: 'alex.silva@silvatech.gw',
    phone: '+245 955123456',
    role: 'owner',
    assignedStoreId: 'all',
    status: 'active',
    lastAccess: 'Hoje às 12:45',
  },
  {
    id: 'tm-2',
    name: 'Mariama Djalo',
    email: 'mariama@silvatech.gw',
    phone: '+245 955987654',
    role: 'manager',
    assignedStoreId: 'store-1',
    status: 'active',
    lastAccess: 'Hoje às 11:20',
  },
  {
    id: 'tm-3',
    name: 'Carlos Mendes',
    email: 'carlos.mendes@silvatech.gw',
    phone: '+351 912987654',
    role: 'order_operator',
    assignedStoreId: 'store-2',
    status: 'active',
    lastAccess: 'Ontem às 18:00',
  },
];

export const initialWarehouses: SellerWarehouseStock[] = [
  {
    id: 'wh-1',
    warehouseName: 'HUB Central Bissau (Nusali Express)',
    warehouseCode: 'HUB-GW-01',
    country: 'GW',
    type: 'hub_fulfillment',
    totalUnits: 450,
    availableUnits: 380,
    reservedUnits: 45,
    inTransitUnits: 25,
    capacityPercentage: 68,
    monthlyStorageFee: 0,
  },
  {
    id: 'wh-2',
    warehouseName: 'HUB Logístico Lisboa',
    warehouseCode: 'HUB-PT-02',
    country: 'PT',
    type: 'cross_border_gateway',
    totalUnits: 220,
    availableUnits: 190,
    reservedUnits: 20,
    inTransitUnits: 10,
    capacityPercentage: 42,
    monthlyStorageFee: 15000,
  },
  {
    id: 'wh-3',
    warehouseName: 'HUB São Paulo Guarulhos',
    warehouseCode: 'HUB-BR-03',
    country: 'BR',
    type: 'cross_border_gateway',
    totalUnits: 180,
    availableUnits: 160,
    reservedUnits: 15,
    inTransitUnits: 5,
    capacityPercentage: 35,
    monthlyStorageFee: 12000,
  },
];

export const initialSellerOrders: SellerOrderData[] = [
  {
    id: 'ord-101',
    orderNumber: 'NSL-8941203',
    storeId: 'store-1',
    storeName: 'Silva Eletrônicos & Tech Bissau',
    buyerName: 'Mamadou Baldé',
    buyerEmail: 'mamadou.balde@gmail.com',
    buyerPhone: '+245 955333222',
    buyerCountry: 'GW',
    deliveryCity: 'Bissau',
    productTitle: 'Smartphone Samsung Galaxy A55 5G 256GB Dual SIM',
    productSku: 'SAM-A55-256GB',
    productImage: 'https://images.unsplash.com/photo-1511707171634-5f897ff02aa9?auto=format&fit=crop&w=400&q=80',
    selectedColor: 'Azul Escuro Metálico',
    selectedSize: '256 GB / 8 GB RAM',
    selectedVariantSku: 'SAM-A55-BLU-256GB',
    selectedVariantImage: 'https://images.unsplash.com/photo-1511707171634-5f897ff02aa9?auto=format&fit=crop&w=400&q=80',
    quantity: 1,
    unitPrice: 190000,
    totalAmount: 190000,
    commissionFee: 9500,
    netPayout: 180500,
    currency: 'XOF',
    paymentMethod: 'Orange Money (Garantia Escrow)',
    status: 'preparing',
    escrowStatus: 'retained',
    escrowReleaseDate: 'Em até 48h após confirmação de entrega',
    shippingCarrier: 'Nusali Express Bissau',
    trackingCode: 'NSL-GW-98214-EXP',
    createdAt: 'Hoje às 10:15',
    timeline: [
      { title: 'Pedido Confirmado & Pagamento Retido em Escrow', date: 'Hoje 10:15', done: true },
      { title: 'Aguardando Separação e Etiqueta na Loja', date: 'Hoje 10:20', done: true },
      { title: 'Embalado e Pronto para Coleta Nusali Express', date: 'Em andamento', done: false },
      { title: 'Entregue ao Comprador & Liberação do Pagamento', date: 'Pendente', done: false },
    ],
  },
  {
    id: 'ord-102',
    orderNumber: 'NSL-9982310',
    storeId: 'store-1',
    storeName: 'Silva Eletrônicos & Tech Bissau',
    buyerName: 'João Pedro Santos',
    buyerEmail: 'jpsantos@hotmail.com',
    buyerPhone: '+351 912000111',
    buyerCountry: 'PT',
    deliveryCity: 'Lisboa',
    productTitle: 'Castanha de Caju Torrada Orgânica da Guiné-Bissau',
    productSku: 'CAJU-GW-1KG',
    productImage: 'https://images.unsplash.com/photo-1509358211563-f0945952d7ee?auto=format&fit=crop&w=400&q=80',
    selectedColor: 'Torrada com Sal Marinho',
    selectedSize: 'Pacote 1 kg Especial Exportação',
    selectedVariantSku: 'CAJU-SAL-1000G',
    selectedVariantImage: 'https://images.unsplash.com/photo-1509358211563-f0945952d7ee?auto=format&fit=crop&w=400&q=80',
    quantity: 5,
    unitPrice: 12000,
    totalAmount: 60000,
    commissionFee: 3000,
    netPayout: 57000,
    currency: 'XOF',
    paymentMethod: 'MB WAY (Escrow Internacional)',
    status: 'shipped',
    escrowStatus: 'releasing_soon',
    escrowReleaseDate: 'Estimativa: 03/08/2026',
    shippingCarrier: 'Nusali Air Cargo Express',
    trackingCode: 'NSL-INT-33019-AIR',
    createdAt: 'Ontem às 14:30',
    timeline: [
      { title: 'Pedido Pago e Verificado em Lisboa', date: 'Ontem 14:30', done: true },
      { title: 'Coletado no HUB Bissau', date: 'Ontem 17:00', done: true },
      { title: 'Em Trânsito Aéreo para Lisboa', date: 'Hoje 06:00', done: true },
      { title: 'Liberação do Saldo após Inspeção do Cliente', date: 'Pendente', done: false },
    ],
  },
];

export const initialSellerQuestions: SellerQuestion[] = [
  {
    id: 'q-101',
    productTitle: 'Smartphone Samsung Galaxy A55 5G 256GB Dual SIM',
    productImage: 'https://images.unsplash.com/photo-1511707171634-5f897ff02aa9?auto=format&fit=crop&w=400&q=80',
    buyerName: 'Fatoumata Kante',
    buyerCountry: 'GW',
    questionText: 'Olá! O aparelho acompanha carregador original na caixa e tem nota fiscal da Guiné-Bissau?',
    questionDate: 'Hoje às 11:40',
    status: 'pending',
  },
  {
    id: 'q-102',
    productTitle: 'Castanha de Caju Torrada Orgânica da Guiné-Bissau 1kg',
    productImage: 'https://images.unsplash.com/photo-1509358211563-f0945952d7ee?auto=format&fit=crop&w=400&q=80',
    buyerName: 'Carlos Eduardo Silva',
    buyerCountry: 'BR',
    questionText: 'Qual o prazo médio de entrega para São Paulo via Nusali Express?',
    questionDate: 'Ontem às 16:20',
    answerText: 'Olá Carlos! O envio aéreo para o Brasil leva entre 4 a 7 dias úteis com rastreamento completo.',
    answerDate: 'Ontem às 16:45',
    status: 'answered',
  },
];

export const initialSellerCustomers: SellerCustomer[] = [
  {
    id: 'cust-1',
    name: 'Mamadou Baldé',
    email: 'mamadou.balde@gmail.com',
    country: 'GW',
    city: 'Bissau',
    totalOrders: 6,
    totalSpentUSD: 1450,
    lastPurchaseDate: 'Hoje',
    loyaltyTag: 'VIP Global',
    internalNotes: 'Cliente corporativo com alta frequência de compra de eletrônicos.',
  },
  {
    id: 'cust-2',
    name: 'João Pedro Santos',
    email: 'jpsantos@hotmail.com',
    country: 'PT',
    city: 'Lisboa',
    totalOrders: 3,
    totalSpentUSD: 520,
    lastPurchaseDate: 'Ontem',
    loyaltyTag: 'Recorrente',
    internalNotes: 'Comprador recorrente de produtos agrícolas e alimentos secos.',
  },
];

export const mockSellerProfile = initialSellerProfile;
export const mockSellerProducts = mockProducts.slice(0, 5);
export const mockSellerOrders = initialSellerOrders;
export const mockSellerFinancialStats = {
  totalRevenueUSD: 145000,
  pendingEscrowUSD: 18500,
  availableBalanceUSD: 126500,
  grossRevenueByCurrency: { XOF: 85000000, EUR: 45000, BRL: 120000 },
  payoutHistory: [
    { id: 'PAY-001', date: '25/07/2026', amount: 5000000, currency: 'XOF', method: 'Orange Money Bissau', status: 'completed' },
    { id: 'PAY-002', date: '18/07/2026', amount: 1200, currency: 'EUR', method: 'Transferência SEPA Lisboa', status: 'completed' },
  ],
};


