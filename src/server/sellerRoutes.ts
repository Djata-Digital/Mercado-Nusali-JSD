import { Router, Request, Response } from 'express';
import { getDb, checkDbConnection } from '../db/index.js';
import { products, orders, users, stores as storesTable } from '../db/schema.js';
import { getCache, setCache, delCache } from '../db/redis.js';
import { eq, desc } from 'drizzle-orm';
import { inMemoryStore } from './api.js';

export const sellerRouter = Router();

// ==========================================
// UNIFIED REAL STATE ENGINE FOR SELLER PANEL
// ==========================================

export interface SellerProfileData {
  id: string;
  fullName: string;
  commercialName: string;
  sellerType: 'pessoa_fisica' | 'empresa_individual' | 'sociedade' | 'marca_oficial' | 'vendedor_internacional';
  taxId: string;
  country: string;
  city: string;
  address: string;
  phone: string;
  email: string;
  kycStatus: 'verified' | 'under_review' | 'pending' | 'rejected';
  kycLevel: string;
  verificationDate: string;
  reputationLevel: 'platinum' | 'gold' | 'lider';
  reputationScore: number;
  authorizedCountries: string[];
  preferredCurrency: string;
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
  country: string;
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
  acceptedCurrencies: string[];
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

export interface SellerOrderData {
  id: string;
  orderNumber: string;
  storeId: string;
  storeName: string;
  buyerName: string;
  buyerEmail: string;
  buyerPhone: string;
  buyerCountry: string;
  deliveryCity: string;
  productTitle: string;
  productSku: string;
  productImage: string;
  quantity: number;
  unitPrice: number;
  totalAmount: number;
  commissionFee: number;
  netPayout: number;
  currency: string;
  paymentMethod: string;
  status: 'pending' | 'paid' | 'preparing' | 'shipped' | 'delivered' | 'cancelled';
  escrowStatus: 'held' | 'released' | 'refunded' | 'disputed';
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
  buyerCountry: string;
  questionText: string;
  questionDate: string;
  answerText?: string;
  answerDate?: string;
  status: 'pending' | 'answered';
}

export interface SellerReviewItem {
  id: string;
  orderId: string;
  productTitle: string;
  buyerName: string;
  rating: number;
  comment: string;
  createdAt: string;
  reply?: string;
  repliedAt?: string;
}

export interface SellerCouponItem {
  id: string;
  code: string;
  discountType: 'percentage' | 'fixed';
  discountValue: number;
  minPurchase: number;
  usageLimit: number;
  usageCount: number;
  expiresAt: string;
  status: 'active' | 'expired' | 'disabled';
}

export interface SellerCampaignItem {
  id: string;
  title: string;
  description: string;
  startDate: string;
  endDate: string;
  discountRequirement: string;
  status: 'active' | 'upcoming' | 'ended';
  isJoined: boolean;
  joinedProductsCount: number;
}

export interface SellerAdItem {
  id: string;
  productTitle: string;
  productImage: string;
  dailyBudget: number;
  clicks: number;
  impressions: number;
  spend: number;
  revenue: number;
  roas: number;
  status: 'active' | 'paused';
}

export interface SellerWalletData {
  available: number;
  retained: number;
  future: number;
  blocked: number;
  cashbackEarned: number;
  refundsProcessed: number;
  currency: string;
  transactions: {
    id: string;
    type: 'credit' | 'payout' | 'escrow' | 'refund';
    title: string;
    date: string;
    amount: number;
    currency: string;
    status: string;
  }[];
}

// In-Memory Database Store for Seller
let currentSellerProfile: SellerProfileData = {
  id: 'seller_001',
  fullName: 'Malam Bacai Sanhá',
  commercialName: 'Nusali Oficial Bissau',
  sellerType: 'empresa_individual',
  taxId: 'NIF-98421034',
  country: 'GW',
  city: 'Bissau',
  address: 'Avenida Amílcar Cabral, nº 42, Centro, Bissau',
  phone: '+245 955 88 12 00',
  email: 'comercial@nusali.gw',
  kycStatus: 'verified',
  kycLevel: 'Nível 3 - Vendedor Global Verificado',
  verificationDate: '15/01/2026',
  reputationLevel: 'platinum',
  reputationScore: 4.9,
  authorizedCountries: ['GW', 'PT', 'BR', 'AO', 'MZ', 'CV', 'ST', 'TL'],
  preferredCurrency: 'XOF',
  payoutMethods: [
    {
      id: 'pm-1',
      type: 'orange_money',
      name: 'Orange Money Guiné-Bissau',
      details: '+245 955 88 12 00 (Titular: Malam Bacai Sanhá)',
      isDefault: true,
    },
    {
      id: 'pm-2',
      type: 'bank_transfer',
      name: 'Banco da África Ocidental (BAO)',
      details: 'IBAN: GW66 0001 0000 9842 1034 0122 (Conta Corrente)',
      isDefault: false,
    },
  ],
  vacationMode: false,
};

let currentStores: SellerStoreData[] = [
  {
    id: 'store_001',
    name: 'Nusali MegaStore Bissau',
    slug: 'nusali-megastore-bissau',
    logo: 'https://images.unsplash.com/photo-1511707171634-5f897ff02aa9?auto=format&fit=crop&w=200&q=80',
    banner: 'https://images.unsplash.com/photo-1441986300917-64674bd600d8?auto=format&fit=crop&w=1200&q=80',
    description: 'A maior loja oficial de tecnologia, eletrônicos e produtos de alta qualidade em Bissau e na CPLP.',
    category: 'Eletrônicos & Tecnologia',
    country: 'GW',
    city: 'Bissau',
    address: 'Av. Combatentes da Liberdade da Pátria, Bissau',
    phone: '+245 955 88 12 00',
    email: 'contato@nusalistore.gw',
    openingHours: 'Segunda a Sábado: 08h às 19h',
    exchangePolicy: 'Troca garantida em até 7 dias úteis após o recebimento.',
    warrantyPolicy: '12 meses de garantia oficial pelo fabricante e assistência técnica local.',
    returnPolicy: 'Devolução gratuita via centros logísticos Nusali.',
    status: 'active',
    isOfficial: true,
    rating: 4.9,
    followersCount: 1420,
    salesCount: 890,
    acceptedCurrencies: ['XOF', 'EUR', 'BRL', 'AOA', 'USD'],
    acceptedPayments: ['Orange Money', 'MTN Money', 'Cartão Visa/Mastercard', 'PIX', 'MB Way'],
    shippingMethods: ['Nusali Logística Express (24h)', 'Retirada em Armazém Bissau', 'Envio Internacional CPLP'],
  },
];

let currentTeamMembers: SellerTeamMember[] = [
  {
    id: 'team_001',
    name: 'Malam Bacai Sanhá',
    email: 'malam@nusali.gw',
    phone: '+245 955 88 12 00',
    role: 'owner',
    assignedStoreId: 'store_001',
    status: 'active',
    lastAccess: 'Agora mesmo',
  },
  {
    id: 'team_002',
    name: 'Aissatu Embaló',
    email: 'aissatu.embalo@nusali.gw',
    phone: '+245 966 11 22 33',
    role: 'manager',
    assignedStoreId: 'store_001',
    status: 'active',
    lastAccess: 'Há 15 minutos',
  },
  {
    id: 'team_003',
    name: 'Carlos Biai',
    email: 'carlos.biai@nusali.gw',
    phone: '+245 955 44 33 22',
    role: 'order_operator',
    assignedStoreId: 'store_001',
    status: 'active',
    lastAccess: 'Há 2 horas',
  },
];

let currentSellerProducts: any[] = [
  {
    id: 'prod-10',
    title: 'Notebook Gamer Acer Nitro V15 15.6" Full HD 144Hz Intel Core i5 13ª Geração 16GB RAM SSD 512GB RTX 3050 Windows 11',
    price: 4599.00,
    currency: 'BRL',
    brand: 'Acer',
    categoryId: 'informatica-e-tablets',
    category: 'Informática e Tablets',
    image: 'https://images.unsplash.com/photo-1603302576837-37561b2e2302?auto=format&fit=crop&w=800&q=80',
    description: 'Notebook de alta performance com Intel Core i5-13420H, 16GB DDR5 5200MHz, placa de vídeo dedicada NVIDIA GeForce RTX 3050 6GB GDDR6, SSD 512GB NVMe PCIe 4.0 e tela IPS 144Hz Full HD.',
    stock: 85,
    status: 'aprovado',
    salesCount: 4230,
    rating: 4.8,
    freeShipping: true,
    full: true,
    countryCode: 'BR',
    sku: 'ACER-NITRO-V15-RTX3050',
    createdAt: new Date().toISOString(),
  },
  {
    id: 'prod-11',
    title: 'Fritadeira Elétrica Sem Óleo Air Fryer Philips Walita Digital Série 3000 4.1L 1400W Tecnologia RapidAir',
    price: 449.90,
    currency: 'BRL',
    brand: 'Philips Walita',
    categoryId: 'eletrodomesticos-e-casa',
    category: 'Eletrodomésticos e Casa',
    image: 'https://images.unsplash.com/photo-1584269600464-37b1b58a9fe7?auto=format&fit=crop&w=800&q=80',
    description: 'Air Fryer Digital 4.1L com tecnologia patenteada RapidAir (fluxo de ar ciclônico 360°), display touch screen com 7 receitas pré-definidas, cesto antiaderente QuickClean lavável em lava-louças.',
    stock: 140,
    status: 'aprovado',
    salesCount: 8900,
    rating: 4.9,
    freeShipping: true,
    full: true,
    countryCode: 'BR',
    sku: 'PHILIPS-AIRFRYER-S3000-TOUCH',
    createdAt: new Date().toISOString(),
  },
  {
    id: 'prod-12',
    title: 'Perfume Masculino Giorgio Armani Acqua Di Giò Eau de Toilette 100ml Original com Selo ADIPEC',
    price: 589.00,
    currency: 'BRL',
    brand: 'Giorgio Armani',
    categoryId: 'beleza-e-cuidado-pessoal',
    category: 'Beleza e Cuidado Pessoal',
    image: 'https://images.unsplash.com/photo-1523293182086-7651a899d37f?auto=format&fit=crop&w=800&q=80',
    description: 'Fragrância aquática aromática icônica com notas cítricas de bergamota da Calábria, acordes oceânicos puros e madeiras nobres de cedro e patchouli. 100% original importado com selo oficial ADIPEC.',
    stock: 95,
    status: 'aprovado',
    salesCount: 6100,
    rating: 5.0,
    freeShipping: true,
    full: true,
    countryCode: 'BR',
    sku: 'ARMANI-ACQUA-GIO-100ML-EDT',
    createdAt: new Date().toISOString(),
  },
  {
    id: 'p_seller_1',
    title: 'Smartphone Nusali 5G CPLP Dual SIM 256GB',
    price: 185000,
    currency: 'XOF',
    brand: 'Nusali Tech',
    categoryId: 'eletronicos',
    category: 'Eletrônicos',
    image: 'https://images.unsplash.com/photo-1511707171634-5f897ff02aa9?auto=format&fit=crop&q=80&w=800',
    description: 'Smartphone de alta performance com tela AMOLED de 120Hz, bateria de 5000mAh e câmera tripla de 64MP.',
    stock: 45,
    status: 'aprovado',
    salesCount: 88,
    rating: 4.9,
    freeShipping: true,
    full: true,
    countryCode: 'GW',
    sku: 'NUS-SP5G-256',
    createdAt: new Date().toISOString(),
  },
  {
    id: 'p_seller_2',
    title: 'Castanha de Caju Torrada Orgânica Selecionada 1kg',
    price: 12500,
    currency: 'XOF',
    brand: 'Nusali Agro',
    categoryId: 'alimentos',
    category: 'Alimentos',
    image: 'https://images.unsplash.com/photo-1559056199-641a0ac8b55e?auto=format&fit=crop&q=80&w=800',
    description: 'Castanha de caju nativa da Guiné-Bissau, assada artesanalmente sem aditivos químicos.',
    stock: 120,
    status: 'aprovado',
    salesCount: 310,
    rating: 5.0,
    freeShipping: false,
    full: true,
    countryCode: 'GW',
    sku: 'NUS-CAJU-1KG',
    createdAt: new Date().toISOString(),
  },
  {
    id: 'p_seller_3',
    title: 'Fone de Ouvido Bluetooth Noise Cancelling Pro',
    price: 28000,
    currency: 'XOF',
    brand: 'Nusali Audio',
    categoryId: 'eletronicos',
    category: 'Eletrônicos',
    image: 'https://images.unsplash.com/photo-1505740420928-5e560c06d30e?auto=format&fit=crop&q=80&w=800',
    description: 'Cancelamento ativo de ruído ANC com até 40h de autonomia e microfone integrado para chamadas.',
    stock: 24,
    status: 'aprovado',
    salesCount: 45,
    rating: 4.8,
    freeShipping: true,
    full: false,
    countryCode: 'GW',
    sku: 'NUS-HEAD-ANC',
    createdAt: new Date().toISOString(),
  },
];

let currentSellerOrders: SellerOrderData[] = [
  {
    id: 'ord_9102',
    orderNumber: 'ORD-9102',
    storeId: 'store_001',
    storeName: 'Nusali MegaStore Bissau',
    buyerName: 'Braima Camará',
    buyerEmail: 'braima.camara@gmail.com',
    buyerPhone: '+245 955 12 34 56',
    buyerCountry: 'GW',
    deliveryCity: 'Bissau (Bairro de Belém)',
    productTitle: 'Smartphone Nusali 5G CPLP Dual SIM 256GB',
    productSku: 'NUS-SP5G-256',
    productImage: 'https://images.unsplash.com/photo-1511707171634-5f897ff02aa9?auto=format&fit=crop&q=80&w=200',
    quantity: 1,
    unitPrice: 185000,
    totalAmount: 185000,
    commissionFee: 9250,
    netPayout: 175750,
    currency: 'XOF',
    paymentMethod: 'Orange Money',
    status: 'preparing',
    escrowStatus: 'held',
    escrowReleaseDate: 'Em até 48h após confirmação de entrega',
    shippingCarrier: 'Nusali Logística Express',
    trackingCode: 'NSL-GW-882193',
    createdAt: 'Hoje às 14:30',
    timeline: [
      { title: 'Pedido Realizado & Pago', date: 'Hoje às 14:30', done: true },
      { title: 'Pagamento Seguro em Custódia Escrow', date: 'Hoje às 14:32', done: true },
      { title: 'Separação e Embalagem no Armazém', date: 'Em andamento', done: false },
      { title: 'Despacho & Rastreamento', date: 'Pendente', done: false },
      { title: 'Entregue ao Comprador', date: 'Pendente', done: false },
    ],
  },
  {
    id: 'ord_9101',
    orderNumber: 'ORD-9101',
    storeId: 'store_001',
    storeName: 'Nusali MegaStore Bissau',
    buyerName: 'Maria João Ferreira',
    buyerEmail: 'maria.ferreira@sapo.pt',
    buyerPhone: '+351 912 345 678',
    buyerCountry: 'PT',
    deliveryCity: 'Lisboa (Avenidas Novas)',
    productTitle: 'Castanha de Caju Torrada Orgânica Selecionada 1kg',
    productSku: 'NUS-CAJU-1KG',
    productImage: 'https://images.unsplash.com/photo-1559056199-641a0ac8b55e?auto=format&fit=crop&q=80&w=200',
    quantity: 4,
    unitPrice: 12500,
    totalAmount: 50000,
    commissionFee: 2500,
    netPayout: 47500,
    currency: 'XOF',
    paymentMethod: 'Cartão de Crédito Internacional',
    status: 'shipped',
    escrowStatus: 'held',
    escrowReleaseDate: 'Previsão de liberação em 3 dias',
    shippingCarrier: 'Nusali Global Cross-Border CPLP',
    trackingCode: 'NSL-PT-994102',
    createdAt: 'Ontem às 10:15',
    timeline: [
      { title: 'Pedido Realizado & Pago', date: 'Ontem às 10:15', done: true },
      { title: 'Pagamento Seguro em Custódia Escrow', date: 'Ontem às 10:16', done: true },
      { title: 'Separado no HUB Bissau', date: 'Ontem às 16:00', done: true },
      { title: 'Despachado para Lisboa', date: 'Hoje às 08:30', done: true },
      { title: 'Entregue ao Destinatário', date: 'Pendente', done: false },
    ],
  },
  {
    id: 'ord_9088',
    orderNumber: 'ORD-9088',
    storeId: 'store_001',
    storeName: 'Nusali MegaStore Bissau',
    buyerName: 'António Silva',
    buyerEmail: 'antonio.silva@uol.com.br',
    buyerPhone: '+55 11 98765-4321',
    buyerCountry: 'BR',
    deliveryCity: 'São Paulo (Pinheiros)',
    productTitle: 'Fone de Ouvido Bluetooth Noise Cancelling Pro',
    productSku: 'NUS-HEAD-ANC',
    productImage: 'https://images.unsplash.com/photo-1505740420928-5e560c06d30e?auto=format&fit=crop&q=80&w=200',
    quantity: 1,
    unitPrice: 28000,
    totalAmount: 28000,
    commissionFee: 1400,
    netPayout: 26600,
    currency: 'XOF',
    paymentMethod: 'PIX Brasil',
    status: 'delivered',
    escrowStatus: 'released',
    escrowReleaseDate: 'Liberado em 28/07/2026',
    shippingCarrier: 'Nusali Brasil Express',
    trackingCode: 'NSL-BR-771822',
    createdAt: '25/07/2026',
    timeline: [
      { title: 'Pedido Realizado & Pago', date: '25/07/2026', done: true },
      { title: 'Pagamento Seguro em Custódia Escrow', date: '25/07/2026', done: true },
      { title: 'Despachado', date: '26/07/2026', done: true },
      { title: 'Entregue com Sucesso', date: '28/07/2026', done: true },
      { title: 'Saldo Escrow Autoliberado na Carteira', date: '28/07/2026', done: true },
    ],
  },
];

let currentWallet: SellerWalletData = {
  available: 1250000,
  retained: 450000,
  future: 320000,
  blocked: 0,
  cashbackEarned: 15000,
  refundsProcessed: 0,
  currency: 'XOF',
  transactions: [
    { id: 'TX-9901', type: 'credit', title: 'Venda Pedido #ORD-9088 (Saldo Escrow Liberado)', date: 'Hoje', amount: 26600, currency: 'XOF', status: 'Liberado' },
    { id: 'TX-9890', type: 'payout', title: 'Saque para Orange Money (+245 955 88 12 00)', date: 'Ontem', amount: 500000, currency: 'XOF', status: 'Concluído' },
    { id: 'TX-9820', type: 'escrow', title: 'Retenção em Custódia Pedido #ORD-9102', date: 'Hoje', amount: 175750, currency: 'XOF', status: 'Retido em Escrow' },
    { id: 'TX-9810', type: 'escrow', title: 'Retenção em Custódia Pedido #ORD-9101', date: 'Ontem', amount: 47500, currency: 'XOF', status: 'Retido em Escrow' },
  ],
};

let currentQuestions: SellerQuestion[] = [
  {
    id: 'q_001',
    productTitle: 'Smartphone Nusali 5G CPLP Dual SIM 256GB',
    productImage: 'https://images.unsplash.com/photo-1511707171634-5f897ff02aa9?auto=format&fit=crop&q=80&w=200',
    buyerName: 'Domingos Mendes',
    buyerCountry: 'GW',
    questionText: 'Olá, este smartphone vem com o carregador rápido na caixa e tem garantia válida em Bissau?',
    questionDate: 'Hoje às 11:20',
    status: 'pending',
  },
  {
    id: 'q_002',
    productTitle: 'Castanha de Caju Torrada Orgânica Selecionada 1kg',
    productImage: 'https://images.unsplash.com/photo-1559056199-641a0ac8b55e?auto=format&fit=crop&q=80&w=200',
    buyerName: 'Helena Carvalho',
    buyerCountry: 'PT',
    questionText: 'A embalagem é a vácuo para manter a crocância durante o envio para Portugal?',
    questionDate: 'Ontem às 16:45',
    answerText: 'Sim! Todas as nossas castanhas são embaladas a vácuo com dupla proteção térmica.',
    answerDate: 'Ontem às 17:10',
    status: 'answered',
  },
];

let currentReviews: SellerReviewItem[] = [
  {
    id: 'rev_001',
    orderId: 'ORD-9088',
    productTitle: 'Fone de Ouvido Bluetooth Noise Cancelling Pro',
    buyerName: 'António Silva (São Paulo, BR)',
    rating: 5,
    comment: 'Excelente fone de ouvido! O cancelamento de ruído é surreal e a entrega chegou antes do prazo previsto.',
    createdAt: '28/07/2026',
    reply: 'Muito obrigado pela preferência, António! A equipe Nusali agradece sua avaliação.',
    repliedAt: '28/07/2026',
  },
  {
    id: 'rev_002',
    orderId: 'ORD-8994',
    productTitle: 'Castanha de Caju Torrada Orgânica Selecionada 1kg',
    buyerName: 'Maria João Ferreira (Lisboa, PT)',
    rating: 5,
    comment: 'Castanhas maravilhosas, super frescas e muito crocantes. Com certeza voltarei a comprar.',
    createdAt: '22/07/2026',
  },
];

let currentCoupons: SellerCouponItem[] = [
  {
    id: 'coup_01',
    code: 'NUSALITECH10',
    discountType: 'percentage',
    discountValue: 10,
    minPurchase: 50000,
    usageLimit: 100,
    usageCount: 38,
    expiresAt: '31/12/2026',
    status: 'active',
  },
  {
    id: 'coup_02',
    code: 'FRETEGRATISGW',
    discountType: 'fixed',
    discountValue: 2500,
    minPurchase: 20000,
    usageLimit: 250,
    usageCount: 112,
    expiresAt: '15/11/2026',
    status: 'active',
  },
];

let currentCampaigns: SellerCampaignItem[] = [
  {
    id: 'camp_01',
    title: 'Festival da Lusofonia CPLP 2026',
    description: 'Campanha massiva com frete subsidiado para todos os países membros da CPLP.',
    startDate: '01/09/2026',
    endDate: '15/09/2026',
    discountRequirement: 'Mínimo de 10% de desconto em produtos selecionados',
    status: 'active',
    isJoined: true,
    joinedProductsCount: 3,
  },
  {
    id: 'camp_02',
    title: 'Mega Black Friday Africana',
    description: 'O maior evento de compras do ano com destaque nos banners principais do aplicativo.',
    startDate: '20/11/2026',
    endDate: '30/11/2026',
    discountRequirement: 'Mínimo de 15% de desconto',
    status: 'upcoming',
    isJoined: false,
    joinedProductsCount: 0,
  },
];

let currentAds: SellerAdItem[] = [
  {
    id: 'ad_01',
    productTitle: 'Smartphone Nusali 5G CPLP Dual SIM 256GB',
    productImage: 'https://images.unsplash.com/photo-1511707171634-5f897ff02aa9?auto=format&fit=crop&q=80&w=200',
    dailyBudget: 5000,
    clicks: 420,
    impressions: 8900,
    spend: 18500,
    revenue: 370000,
    roas: 20.0,
    status: 'active',
  },
];

let currentSettings = {
  notificationEmail: true,
  notificationWhatsapp: true,
  autoAcceptOrders: true,
  defaultCarrier: 'Nusali Logística Express',
  returnWindowDays: 7,
  warrantyTerms: '12 meses contra defeitos de fabricação',
  crossBorderShippingEnabled: true,
};

// ==========================================
// 1. OVERVIEW & ANALYTICS ENDPOINTS
// ==========================================

sellerRouter.get('/overview', async (req: Request, res: Response) => {
  const grossRevenue = currentSellerOrders.reduce((acc, o) => acc + o.totalAmount, 0);
  const netRevenue = currentSellerOrders.reduce((acc, o) => acc + o.netPayout, 0);
  const totalOrders = currentSellerOrders.length;
  const pendingOrders = currentSellerOrders.filter(o => o.status === 'preparing' || o.status === 'pending').length;
  const pendingQuestions = currentQuestions.filter(q => q.status === 'pending').length;

  return res.json({
    success: true,
    data: {
      profile: currentSellerProfile,
      store: currentStores[0],
      balances: {
        available: currentWallet.available,
        retained: currentWallet.retained,
        future: currentWallet.future,
        blocked: currentWallet.blocked,
        currency: currentWallet.currency,
      },
      metrics: {
        grossRevenue,
        netRevenue,
        totalOrders,
        pendingOrders,
        pendingQuestions,
        totalProducts: currentSellerProducts.length,
        averageRating: currentSellerProfile.reputationScore,
      },
      recentOrders: currentSellerOrders.slice(0, 5),
      topProducts: currentSellerProducts.slice(0, 4),
      salesHistory: [
        { label: 'Semana 1', vendas: 18, receita: 2800000 },
        { label: 'Semana 2', vendas: 24, receita: 3900000 },
        { label: 'Semana 3', vendas: 32, receita: 4850000 },
        { label: 'Semana 4', vendas: 28, receita: 3300000 },
      ],
      countryDistribution: [
        { country: '🇬🇼 Guiné-Bissau', pedidos: 62, percent: 65 },
        { country: '🇵🇹 Portugal', pedidos: 22, percent: 20 },
        { country: '🇧🇷 Brasil', pedidos: 12, percent: 10 },
        { country: '🇦🇴 Angola', pedidos: 6, percent: 5 },
      ],
    },
  });
});

sellerRouter.get('/analytics', async (req: Request, res: Response) => {
  const { period = '30days' } = req.query;
  const mult = period === 'today' ? 0.1 : period === '7days' ? 0.3 : period === '30days' ? 1.0 : 2.5;

  return res.json({
    success: true,
    data: {
      period,
      grossRevenue: Math.round(14850000 * mult),
      netRevenue: Math.round(14107500 * mult),
      totalOrders: Math.round(102 * mult),
      averageTicket: 145588,
      conversionRate: '3.8%',
      viewsCount: Math.round(14200 * mult),
      salesByDay: [
        { day: '01', vendas: Math.round(4 * mult), valor: Math.round(450000 * mult) },
        { day: '05', vendas: Math.round(8 * mult), valor: Math.round(980000 * mult) },
        { day: '10', vendas: Math.round(12 * mult), valor: Math.round(1650000 * mult) },
        { day: '15', vendas: Math.round(15 * mult), valor: Math.round(2100000 * mult) },
        { day: '20', vendas: Math.round(18 * mult), valor: Math.round(2900000 * mult) },
        { day: '25', vendas: Math.round(22 * mult), valor: Math.round(3400000 * mult) },
        { day: '30', vendas: Math.round(23 * mult), valor: Math.round(3370000 * mult) },
      ],
    },
  });
});

// ==========================================
// 2. PROFILE, STORES & TEAM
// ==========================================

sellerRouter.get('/profile', async (req: Request, res: Response) => {
  return res.json({
    success: true,
    data: currentSellerProfile,
  });
});

sellerRouter.patch('/profile', async (req: Request, res: Response) => {
  currentSellerProfile = {
    ...currentSellerProfile,
    ...req.body,
  };
  await delCache('seller_profile');
  return res.json({
    success: true,
    message: 'Perfil do vendedor atualizado com sucesso!',
    data: currentSellerProfile,
  });
});

sellerRouter.get('/stores', async (req: Request, res: Response) => {
  return res.json({
    success: true,
    data: currentStores,
  });
});

sellerRouter.post('/stores', async (req: Request, res: Response) => {
  const { name, category, country, city, address, phone, email, description } = req.body;
  const newStore: SellerStoreData = {
    id: `store_${Date.now()}`,
    name: name || 'Nova Filial Oficial',
    slug: (name || 'nova-filial').toLowerCase().replace(/\s+/g, '-'),
    logo: 'https://images.unsplash.com/photo-1511707171634-5f897ff02aa9?auto=format&fit=crop&w=200&q=80',
    banner: 'https://images.unsplash.com/photo-1441986300917-64674bd600d8?auto=format&fit=crop&w=1200&q=80',
    description: description || 'Filial autorizada Mercado Nusali.',
    category: category || 'Geral',
    country: country || 'GW',
    city: city || 'Bissau',
    address: address || '',
    phone: phone || '',
    email: email || '',
    openingHours: '08h às 18h',
    exchangePolicy: '7 dias úteis',
    warrantyPolicy: '12 meses de garantia',
    returnPolicy: 'Devolução gratuita',
    status: 'active',
    isOfficial: false,
    rating: 5.0,
    followersCount: 0,
    salesCount: 0,
    acceptedCurrencies: ['XOF', 'EUR', 'BRL'],
    acceptedPayments: ['Orange Money', 'PIX', 'Cartão'],
    shippingMethods: ['Nusali Express'],
  };

  currentStores.push(newStore);
  return res.json({
    success: true,
    message: `Filial "${newStore.name}" cadastrada com sucesso!`,
    data: newStore,
  });
});

sellerRouter.patch('/stores/:id', async (req: Request, res: Response) => {
  const { id } = req.params;
  const idx = currentStores.findIndex(s => s.id === id);
  if (idx === -1) {
    return res.status(404).json({ success: false, message: 'Loja não encontrada.' });
  }

  currentStores[idx] = { ...currentStores[idx], ...req.body };
  return res.json({
    success: true,
    message: 'Dados da loja atualizados com sucesso!',
    data: currentStores[idx],
  });
});

sellerRouter.get('/team', async (req: Request, res: Response) => {
  return res.json({
    success: true,
    data: currentTeamMembers,
  });
});

sellerRouter.post('/team', async (req: Request, res: Response) => {
  const { name, email, phone, role, assignedStoreId } = req.body;
  const newMember: SellerTeamMember = {
    id: `team_${Date.now()}`,
    name,
    email,
    phone: phone || '',
    role: role || 'attendant',
    assignedStoreId: assignedStoreId || currentStores[0].id,
    status: 'active',
    lastAccess: 'Nunca acessou',
  };

  currentTeamMembers.push(newMember);
  return res.json({
    success: true,
    message: `Membro ${name} convidado com sucesso para a equipe!`,
    data: newMember,
  });
});

sellerRouter.delete('/team/:id', async (req: Request, res: Response) => {
  const { id } = req.params;
  currentTeamMembers = currentTeamMembers.filter(m => m.id !== id);
  return res.json({
    success: true,
    message: 'Membro removido da equipe com sucesso.',
  });
});

// ==========================================
// 3. PRODUCTS & INVENTORY
// ==========================================

sellerRouter.get('/products', async (req: Request, res: Response) => {
  const { status, q } = req.query;
  let list = [...currentSellerProducts];

  if (q && typeof q === 'string') {
    const term = q.toLowerCase();
    list = list.filter(p => p.title?.toLowerCase().includes(term) || p.brand?.toLowerCase().includes(term));
  }

  if (status && typeof status === 'string' && status !== 'todos') {
    list = list.filter(p => p.status === status);
  }

  return res.json({
    success: true,
    data: list,
  });
});

sellerRouter.get('/products/:id', async (req: Request, res: Response) => {
  const { id } = req.params;
  const product = currentSellerProducts.find(p => p.id === id) || inMemoryStore.products.find(p => p.id === id);
  if (!product) {
    return res.status(404).json({ success: false, message: 'Produto não encontrado.' });
  }
  return res.json({ success: true, data: product });
});

sellerRouter.post('/products', async (req: Request, res: Response) => {
  const {
    title,
    price,
    originalPrice,
    discountPercentage,
    installmentsMax,
    installmentsInterestFree,
    currency,
    brand,
    model,
    category,
    categoryId,
    categorySlug,
    condition,
    image,
    galleryImages,
    videos,
    videoUrl,
    shortVideo,
    description,
    stock,
    freeShipping,
    full,
    countryCode,
    sku,
    variants,
    specs,
    seller,
    shipping,
    featured,
    offerOfDay,
  } = req.body;

  if (!title || price === undefined) {
    return res.status(400).json({ success: false, message: 'Título e preço são obrigatórios.' });
  }

  const id = req.body.id || `p_seller_${Date.now()}`;
  const newProduct = {
    id,
    title,
    price: Number(price),
    originalPrice: originalPrice ? Number(originalPrice) : undefined,
    discountPercentage: discountPercentage ? Number(discountPercentage) : undefined,
    installmentsMax: installmentsMax || 10,
    installmentsInterestFree: Boolean(installmentsInterestFree),
    currency: currency || 'XOF',
    brand: brand || 'Nusali',
    model: model || 'Edição Especial',
    category: category || 'Eletrônicos',
    categoryId: categoryId || 'eletronicos',
    categorySlug: categorySlug || 'eletronicos',
    condition: condition || 'novo',
    image: image || (galleryImages && galleryImages[0]) || 'https://images.unsplash.com/photo-1523275335684-37898b6baf30?auto=format&fit=crop&w=800&q=80',
    galleryImages: galleryImages && galleryImages.length > 0 ? galleryImages : [image || 'https://images.unsplash.com/photo-1523275335684-37898b6baf30?auto=format&fit=crop&w=800&q=80'],
    videos: videos || [],
    videoUrl: videoUrl || undefined,
    shortVideo: shortVideo || undefined,
    description: description || 'Produto de alta qualidade Mercado Nusali.',
    stock: Number(stock) || 10,
    status: 'aprovado',
    salesCount: 0,
    rating: 5.0,
    freeShipping: Boolean(freeShipping || shipping?.freeShipping),
    full: Boolean(full || shipping?.fullFulfilled),
    countryCode: countryCode || 'GW',
    sku: sku || `SKU-${Math.floor(10000 + Math.random() * 90000)}`,
    variants: variants || [],
    specs: specs || {},
    seller: seller || {
      id: 'sel_current',
      name: 'Vendedor Oficial Nusali',
      reputationLevel: 'platinum',
      reputationScore: 5,
      salesCount: 150,
      isOfficialStore: true,
      location: { city: 'Bissau', state: 'GW' },
      goodService: true,
      onTimeDelivery: true,
    },
    shipping: shipping || {
      freeShipping: true,
      arrivesTomorrow: true,
      shippingPrice: 0,
      fullFulfilled: true,
    },
    featured: Boolean(featured),
    offerOfDay: Boolean(offerOfDay),
    createdAt: new Date().toISOString(),
  };

  currentSellerProducts.unshift(newProduct);
  const memIdx = inMemoryStore.products.findIndex(p => p.id === id);
  if (memIdx !== -1) {
    inMemoryStore.products[memIdx] = newProduct;
  } else {
    inMemoryStore.products.unshift(newProduct);
  }
  await delCache('products_list_all');

  return res.json({
    success: true,
    message: `Produto "${title}" publicado com sucesso no catálogo oficial!`,
    data: newProduct,
  });
});

sellerRouter.patch('/products/:id', async (req: Request, res: Response) => {
  const { id } = req.params;
  const idx = currentSellerProducts.findIndex(p => p.id === id);
  if (idx !== -1) {
    currentSellerProducts[idx] = { ...currentSellerProducts[idx], ...req.body };
  }

  const memIdx = inMemoryStore.products.findIndex(p => p.id === id);
  if (memIdx !== -1) {
    inMemoryStore.products[memIdx] = { ...inMemoryStore.products[memIdx], ...req.body };
  } else if (idx !== -1) {
    inMemoryStore.products.unshift(currentSellerProducts[idx]);
  }

  await delCache('products_list_all');

  const updated = idx !== -1 ? currentSellerProducts[idx] : inMemoryStore.products[memIdx];

  if (!updated) {
    return res.status(404).json({ success: false, message: 'Produto não encontrado.' });
  }

  return res.json({
    success: true,
    message: 'Produto atualizado com sucesso!',
    data: updated,
  });
});

sellerRouter.delete('/products/:id', async (req: Request, res: Response) => {
  const { id } = req.params;
  currentSellerProducts = currentSellerProducts.filter(p => p.id !== id);
  inMemoryStore.products = inMemoryStore.products.filter(p => p.id !== id);
  await delCache('products_list_all');

  return res.json({
    success: true,
    message: 'Produto excluído do catálogo.',
  });
});

sellerRouter.patch('/products/:id/stock', async (req: Request, res: Response) => {
  const { id } = req.params;
  const { stock } = req.body;
  const product = currentSellerProducts.find(p => p.id === id);
  if (!product) {
    return res.status(404).json({ success: false, message: 'Produto não encontrado.' });
  }

  product.stock = Number(stock);
  return res.json({
    success: true,
    message: `Estoque do produto "${product.title}" atualizado para ${product.stock} unidades.`,
    data: product,
  });
});

sellerRouter.patch('/products/:id/status', async (req: Request, res: Response) => {
  const { id } = req.params;
  const { status } = req.body;
  const product = currentSellerProducts.find(p => p.id === id);
  if (!product) {
    return res.status(404).json({ success: false, message: 'Produto não encontrado.' });
  }

  product.status = status;
  return res.json({
    success: true,
    message: `Status do anúncio alterado para: ${status}`,
    data: product,
  });
});

// ==========================================
// 4. ORDERS & FULFILLMENT
// ==========================================

sellerRouter.get('/orders', async (req: Request, res: Response) => {
  const { status } = req.query;
  let list = [...currentSellerOrders];

  if (status && status !== 'todos') {
    list = list.filter(o => o.status === status);
  }

  return res.json({
    success: true,
    data: list,
  });
});

sellerRouter.patch('/orders/:id/status', async (req: Request, res: Response) => {
  const { id } = req.params;
  const { status, trackingCode, shippingCarrier } = req.body;

  const order = currentSellerOrders.find(o => o.id === id || o.orderNumber === id);
  if (!order) {
    return res.status(404).json({ success: false, message: 'Pedido não encontrado.' });
  }

  order.status = status || order.status;
  if (trackingCode) order.trackingCode = trackingCode;
  if (shippingCarrier) order.shippingCarrier = shippingCarrier;

  if (status === 'shipped') {
    order.timeline.push({ title: 'Despachado para Envio', date: 'Hoje', done: true });
  } else if (status === 'delivered') {
    order.timeline.push({ title: 'Entregue com Sucesso', date: 'Hoje', done: true });
    order.escrowStatus = 'released';
    currentWallet.available += order.netPayout;
    currentWallet.retained = Math.max(0, currentWallet.retained - order.netPayout);
  }

  return res.json({
    success: true,
    message: `Pedido #${order.orderNumber} atualizado para "${status}".`,
    data: order,
  });
});

// ==========================================
// 5. FINANCIALS, WALLET & PAYOUTS
// ==========================================

sellerRouter.get('/wallet', async (req: Request, res: Response) => {
  return res.json({
    success: true,
    data: currentWallet,
  });
});

sellerRouter.post('/payouts/request', async (req: Request, res: Response) => {
  const { amount, method, accountDetail, currency } = req.body;
  const payoutAmount = Number(amount);

  if (!payoutAmount || payoutAmount <= 0) {
    return res.status(400).json({ success: false, message: 'Informe um valor válido para saque.' });
  }

  if (payoutAmount > currentWallet.available) {
    return res.status(400).json({ success: false, message: 'Saldo disponível insuficiente para este saque.' });
  }

  currentWallet.available -= payoutAmount;

  const newTx = {
    id: `SAQUE-${Date.now()}`,
    type: 'payout' as const,
    title: `Saque via ${method} (${accountDetail || 'Conta Principal'})`,
    date: 'Agora mesmo',
    amount: payoutAmount,
    currency: currency || 'XOF',
    status: 'Concluído',
  };

  currentWallet.transactions.unshift(newTx);

  return res.json({
    success: true,
    message: `Saque de ${payoutAmount.toLocaleString()} ${currency || 'XOF'} processado com sucesso!`,
    data: newTx,
  });
});

// ==========================================
// 6. KYC VERIFICATION
// ==========================================

sellerRouter.get('/kyc', async (req: Request, res: Response) => {
  return res.json({
    success: true,
    data: {
      kycStatus: currentSellerProfile.kycStatus,
      kycLevel: currentSellerProfile.kycLevel,
      verificationDate: currentSellerProfile.verificationDate,
      taxId: currentSellerProfile.taxId,
      documents: [
        { name: 'Passaporte CPLP / BI', status: 'aprovado' },
        { name: 'Comprovante de Residência', status: 'aprovado' },
        { name: 'Certidão de Registro Comercial (NIF)', status: 'aprovado' },
        { name: 'Selfie Biométrica Facial', status: 'aprovado' },
      ],
    },
  });
});

sellerRouter.post('/kyc/submit', async (req: Request, res: Response) => {
  const { docType, docNumber } = req.body;
  currentSellerProfile.kycStatus = 'verified';
  currentSellerProfile.kycLevel = 'Nível 3 - Vendedor Global Verificado';
  currentSellerProfile.verificationDate = new Date().toLocaleDateString('pt-BR');

  return res.json({
    success: true,
    message: 'Documentação KYC enviada e validada com sucesso!',
    data: currentSellerProfile,
  });
});

// ==========================================
// 7. QUESTIONS & REVIEWS
// ==========================================

sellerRouter.get('/questions', async (req: Request, res: Response) => {
  return res.json({
    success: true,
    data: currentQuestions,
  });
});

sellerRouter.post('/questions/:id/answer', async (req: Request, res: Response) => {
  const { id } = req.params;
  const { answerText } = req.body;

  const question = currentQuestions.find(q => q.id === id);
  if (!question) {
    return res.status(404).json({ success: false, message: 'Pergunta não encontrada.' });
  }

  question.answerText = answerText;
  question.answerDate = 'Agora mesmo';
  question.status = 'answered';

  return res.json({
    success: true,
    message: 'Resposta enviada com sucesso ao cliente!',
    data: question,
  });
});

sellerRouter.get('/reviews', async (req: Request, res: Response) => {
  return res.json({
    success: true,
    data: currentReviews,
  });
});

sellerRouter.post('/reviews/:id/reply', async (req: Request, res: Response) => {
  const { id } = req.params;
  const { reply } = req.body;

  const review = currentReviews.find(r => r.id === id);
  if (!review) {
    return res.status(404).json({ success: false, message: 'Avaliação não encontrada.' });
  }

  review.reply = reply;
  review.repliedAt = 'Agora mesmo';

  return res.json({
    success: true,
    message: 'Resposta publicada na avaliação com sucesso!',
    data: review,
  });
});

// ==========================================
// 8. MARKETING, COUPONS, CAMPAIGNS & ADS
// ==========================================

sellerRouter.get('/coupons', async (req: Request, res: Response) => {
  return res.json({
    success: true,
    data: currentCoupons,
  });
});

sellerRouter.post('/coupons', async (req: Request, res: Response) => {
  const { code, discountType, discountValue, minPurchase, usageLimit, expiresAt } = req.body;
  const newCoupon: SellerCouponItem = {
    id: `coup_${Date.now()}`,
    code: (code || 'DESCONTO').toUpperCase(),
    discountType: discountType || 'percentage',
    discountValue: Number(discountValue) || 10,
    minPurchase: Number(minPurchase) || 0,
    usageLimit: Number(usageLimit) || 100,
    usageCount: 0,
    expiresAt: expiresAt || '31/12/2026',
    status: 'active',
  };

  currentCoupons.unshift(newCoupon);
  return res.json({
    success: true,
    message: `Cupom de desconto "${newCoupon.code}" criado com sucesso!`,
    data: newCoupon,
  });
});

sellerRouter.delete('/coupons/:id', async (req: Request, res: Response) => {
  const { id } = req.params;
  currentCoupons = currentCoupons.filter(c => c.id !== id);
  return res.json({
    success: true,
    message: 'Cupom removido.',
  });
});

sellerRouter.get('/campaigns', async (req: Request, res: Response) => {
  return res.json({
    success: true,
    data: currentCampaigns,
  });
});

sellerRouter.post('/campaigns/:id/join', async (req: Request, res: Response) => {
  const { id } = req.params;
  const camp = currentCampaigns.find(c => c.id === id);
  if (!camp) {
    return res.status(404).json({ success: false, message: 'Campanha não encontrada.' });
  }

  camp.isJoined = true;
  camp.joinedProductsCount = currentSellerProducts.length;

  return res.json({
    success: true,
    message: `Sua loja aderiu com sucesso à campanha "${camp.title}"!`,
    data: camp,
  });
});

sellerRouter.get('/ads', async (req: Request, res: Response) => {
  return res.json({
    success: true,
    data: currentAds,
  });
});

sellerRouter.post('/ads', async (req: Request, res: Response) => {
  const { productTitle, dailyBudget } = req.body;
  const newAd: SellerAdItem = {
    id: `ad_${Date.now()}`,
    productTitle: productTitle || currentSellerProducts[0]?.title || 'Anúncio Patrocinado',
    productImage: currentSellerProducts[0]?.image || 'https://images.unsplash.com/photo-1511707171634-5f897ff02aa9?auto=format&fit=crop&q=80&w=200',
    dailyBudget: Number(dailyBudget) || 5000,
    clicks: 0,
    impressions: 0,
    spend: 0,
    revenue: 0,
    roas: 0,
    status: 'active',
  };

  currentAds.unshift(newAd);
  return res.json({
    success: true,
    message: 'Campanha de anúncio patrocinado ativada!',
    data: newAd,
  });
});

// ==========================================
// 9. SETTINGS
// ==========================================

sellerRouter.get('/settings', async (req: Request, res: Response) => {
  return res.json({
    success: true,
    data: currentSettings,
  });
});

sellerRouter.patch('/settings', async (req: Request, res: Response) => {
  currentSettings = { ...currentSettings, ...req.body };
  return res.json({
    success: true,
    message: 'Configurações operacionais salvas com sucesso!',
    data: currentSettings,
  });
});
