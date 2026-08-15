import { Router, Request, Response } from 'express';
import { getDb, checkDbConnection } from '../db/index.js';
import { products, orders, users, orderItems } from '../db/schema.js';
import { getCache, setCache, delCache } from '../db/redis.js';
import { eq, desc } from 'drizzle-orm';

export const buyerRouter = Router();

// ==========================================
// UNIFIED REAL STATE ENGINE FOR BUYER PANEL
// ==========================================

export interface BuyerProfileData {
  id: string;
  fullName: string;
  email: string;
  phone: string;
  taxId: string;
  country: string;
  city: string;
  address: string;
  avatar: string;
  isEmailVerified: boolean;
  isPhoneVerified: boolean;
  is2FAEnabled: boolean;
  kycStatus: 'verified' | 'under_review' | 'pending' | 'unverified';
  preferredCurrency: string;
  membership: 'standard' | 'nusali_plus';
  createdAt: string;
}

export interface BuyerAddress {
  id: string;
  recipientName: string;
  street: string;
  number: string;
  complement?: string;
  neighborhood?: string;
  city: string;
  state: string;
  country: string;
  zipCode: string;
  phone: string;
  isDefault: boolean;
}

export interface BuyerWalletTransaction {
  id: string;
  type: 'deposit' | 'purchase' | 'cashback' | 'refund' | 'transfer';
  title: string;
  amount: number;
  currency: string;
  date: string;
  status: 'Concluído' | 'Escrow Retido' | 'Acreditado' | 'Pendente';
  method: string;
}

export interface BuyerCoupon {
  id: string;
  code: string;
  discount: string;
  discountPercentage: number;
  description: string;
  validUntil: string;
  isClaimed: boolean;
  minPurchase?: number;
  category?: string;
}

export interface BuyerReturn {
  id: string;
  orderId: string;
  productTitle: string;
  productImage?: string;
  reason: string;
  description: string;
  amount: number;
  currency: string;
  status: 'under_review' | 'approved' | 'in_transit' | 'refunded' | 'rejected';
  date: string;
  trackingLabelCode: string;
}

export interface BuyerDispute {
  id: string;
  orderId: string;
  orderNumber: string;
  productTitle: string;
  sellerName: string;
  reason: string;
  description: string;
  amount: number;
  currency: string;
  status: 'opened' | 'in_mediation' | 'refunded' | 'resolved' | 'closed';
  date: string;
  messages: {
    id: string;
    sender: 'buyer' | 'seller' | 'admin' | 'mediator';
    senderName: string;
    text: string;
    timestamp: string;
  }[];
}

export interface BuyerNotification {
  id: string;
  type: 'orders' | 'escrow' | 'promos' | 'system';
  title: string;
  message: string;
  time: string;
  isRead: boolean;
  targetView: 'tracking' | 'order_detail' | 'coupons' | 'profile' | 'wallet' | 'disputes';
  orderId?: string;
}

export interface BuyerChatMessage {
  id: string;
  sender: 'buyer' | 'seller' | 'ai' | 'support';
  text: string;
  time: string;
}

export interface BuyerChatThread {
  id: string;
  name: string;
  avatar: string;
  isOfficial?: boolean;
  isAi?: boolean;
  lastMessage: string;
  lastTime: string;
  unreadCount: number;
  messages: BuyerChatMessage[];
}

export interface BuyerReview {
  id: string;
  productId: string;
  productTitle: string;
  productImage: string;
  rating: number;
  title: string;
  comment: string;
  date: string;
  verifiedPurchase: boolean;
  likes: number;
}

export interface BuyerSupportTicket {
  id: string;
  subject: string;
  category: string;
  status: 'open' | 'in_progress' | 'closed';
  priority: 'low' | 'normal' | 'high' | 'urgent';
  createdAt: string;
  lastUpdate: string;
  messages: { sender: string; text: string; time: string }[];
}

// In-memory persistent state engine with real initial data
export const buyerDataStore = {
  profile: {
    id: 'usr_buyer_001',
    fullName: 'Alex Silva',
    email: 'djatadigital7@gmail.com',
    phone: '+245 955 123 456',
    taxId: 'NIF-8941203',
    country: 'GW',
    city: 'Bissau',
    address: 'Avenida Amílcar Cabral, 12, Bloco B',
    avatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150',
    isEmailVerified: true,
    isPhoneVerified: true,
    is2FAEnabled: true,
    kycStatus: 'verified' as const,
    preferredCurrency: 'XOF',
    membership: 'nusali_plus' as const,
    createdAt: '2026-01-15T10:00:00.000Z',
  },

  sessions: [
    {
      id: 'sess-1',
      device: 'Chrome no macOS (Bissau, GW)',
      ip: '197.214.42.10',
      location: 'Bissau, Guiné-Bissau',
      lastActive: 'Agora mesmo',
      isCurrent: true,
    },
    {
      id: 'sess-2',
      device: 'App Mercado Nusali Android (Lisboa, PT)',
      ip: '85.240.112.5',
      location: 'Lisboa, Portugal',
      lastActive: 'Há 2 horas',
      isCurrent: false,
    },
    {
      id: 'sess-3',
      device: 'Safari no iPhone (São Paulo, BR)',
      ip: '177.18.220.14',
      location: 'São Paulo, Brasil',
      lastActive: 'Ontem às 18:40',
      isCurrent: false,
    },
  ],

  addresses: [
    {
      id: 'addr-1',
      recipientName: 'Alex Silva',
      street: 'Avenida Amílcar Cabral',
      number: '12',
      complement: 'Bloco B, Apt 3',
      neighborhood: 'Praça dos Heróis',
      city: 'Bissau',
      state: 'Bissau',
      country: 'GW',
      zipCode: '1000',
      phone: '+245 955123456',
      isDefault: true,
    },
    {
      id: 'addr-2',
      recipientName: 'Alex Silva (Familiar em Lisboa)',
      street: 'Avenida da Liberdade',
      number: '240',
      complement: '2º Esquerdo',
      neighborhood: 'Marquês de Pombal',
      city: 'Lisboa',
      state: 'Lisboa',
      country: 'PT',
      zipCode: '1250-142',
      phone: '+351 912345678',
      isDefault: false,
    },
  ] as BuyerAddress[],

  wallet: {
    balance: 45000,
    cashbackBalance: 3200,
    pendingEscrowBalance: 19000,
    currency: 'XOF',
    savedCards: [
      { id: 'card-1', brand: 'Visa', last4: '4242', expMonth: '12', expYear: '2028', holder: 'ALEX SILVA' },
      { id: 'card-2', brand: 'Mastercard', last4: '8890', expMonth: '08', expYear: '2027', holder: 'ALEX SILVA' },
    ],
    transactions: [
      {
        id: 'tx-101',
        type: 'purchase' as const,
        title: 'Compra de Smartphone Nusali 5G CPLP',
        amount: -185000,
        currency: 'XOF',
        date: 'Hoje 14:20',
        status: 'Escrow Retido' as const,
        method: 'Orange Money Bissau',
      },
      {
        id: 'tx-102',
        type: 'cashback' as const,
        title: 'Cashback Nusali+ Recebido',
        amount: +3200,
        currency: 'XOF',
        date: 'Ontem',
        status: 'Acreditado' as const,
        method: 'Programa Nusali+',
      },
      {
        id: 'tx-103',
        type: 'deposit' as const,
        title: 'Recarga de Saldo Nusali Pay',
        amount: +50000,
        currency: 'XOF',
        date: 'Há 3 dias',
        status: 'Concluído' as const,
        method: 'Depósito Local Bissau',
      },
    ] as BuyerWalletTransaction[],
  },

  coupons: [
    {
      id: 'cup-1',
      code: 'NUSALIGLOBAL',
      discount: '10% OFF',
      discountPercentage: 10,
      description: 'Válido para produtos de Eletrônicos em Guiné-Bissau e envios internacionais.',
      validUntil: '31/12/2026',
      isClaimed: true,
      category: 'eletronicos',
    },
    {
      id: 'cup-2',
      code: 'FRETEGRATIS',
      discount: 'FRETE GRÁTIS',
      discountPercentage: 100,
      description: 'Isenção total na taxa de entrega do seu primeiro pedido com Nusali Express.',
      validUntil: '15/09/2026',
      isClaimed: false,
    },
    {
      id: 'cup-3',
      code: 'NUSALIPLUS',
      discount: '15% CASHBACK',
      discountPercentage: 15,
      description: 'Acumule cashback direto na sua carteira Nusali Pay.',
      validUntil: '30/11/2026',
      isClaimed: false,
    },
    {
      id: 'cup-4',
      code: 'BISSAU2026',
      discount: '5.000 XOF OFF',
      discountPercentage: 12,
      description: 'Desconto especial para entregas na Grande Bissau acima de 50.000 XOF.',
      validUntil: '31/10/2026',
      isClaimed: false,
      minPurchase: 50000,
    },
  ] as BuyerCoupon[],

  favorites: [
    {
      id: 'p_demo_1',
      title: 'Smartphone Nusali 5G CPLP',
      price: 185000,
      currency: 'XOF',
      brand: 'Nusali Tech',
      image: 'https://images.unsplash.com/photo-1511707171634-5f897ff02aa9?auto=format&fit=crop&q=80&w=800',
      rating: 4.9,
      freeShipping: true,
      full: true,
      dateAdded: '2026-08-01',
    },
    {
      id: 'p_demo_2',
      title: 'Café Orgânico de São Tomé Premium 1kg',
      price: 12500,
      currency: 'XOF',
      brand: 'São Tomé Select',
      image: 'https://images.unsplash.com/photo-1559056199-641a0ac8b55e?auto=format&fit=crop&q=80&w=800',
      rating: 4.8,
      freeShipping: false,
      full: true,
      dateAdded: '2026-08-05',
    },
  ],

  returns: [
    {
      id: 'ret-101',
      orderId: 'NSL-8941203',
      productTitle: 'Fone de Ouvido Bluetooth Anker Soundcore Q30',
      productImage: 'https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=300',
      reason: 'Defeito de Fabricação',
      description: 'Produto com chiado na concha esquerda após 2 dias de uso.',
      amount: 19000,
      currency: 'XOF',
      status: 'under_review' as const,
      date: 'Há 1 dia',
      trackingLabelCode: 'DEV-GW-98214-NSL',
    },
  ] as BuyerReturn[],

  disputes: [
    {
      id: 'disp-101',
      orderId: 'NSL-8941203',
      orderNumber: 'NSL-8941203',
      productTitle: 'Fone de Ouvido Bluetooth Anker Soundcore Q30',
      sellerName: 'Bissau Tech & Export Store',
      reason: 'Produto com defeito de fábrica',
      description: 'Recebi o fone mas o lado esquerdo não reproduz áudio. Solicito a substituição ou estorno.',
      amount: 19000,
      currency: 'XOF',
      status: 'in_mediation' as const,
      date: 'Ontem às 15:40',
      messages: [
        {
          id: 'dm-1',
          sender: 'buyer' as const,
          senderName: 'Alex Silva',
          text: 'Boa tarde, abri esta mediação pois o fone veio sem funcionar o lado esquerdo.',
          timestamp: 'Ontem 15:40',
        },
        {
          id: 'dm-2',
          sender: 'seller' as const,
          senderName: 'Bissau Tech (Vendedor)',
          text: 'Olá Alex! Lamentamos o inconveniente. Podemos despachar um fone novo imediatamente pelo HUB Bissau ou efetuar o estorno.',
          timestamp: 'Ontem 16:10',
        },
        {
          id: 'dm-3',
          sender: 'mediator' as const,
          senderName: 'Mediação Oficial Nusali',
          text: 'Os fundos de 19.000 XOF permanecem retidos com total segurança no sistema Escrow até a confirmação de resolução.',
          timestamp: 'Ontem 16:15',
        },
      ],
    },
  ] as BuyerDispute[],

  notifications: [
    {
      id: 'notif-1',
      type: 'orders' as const,
      title: 'Seu pedido #NSL-8941203 saiu para entrega!',
      message: 'O entregador da Nusali Express está a caminho do seu endereço em Bissau.',
      time: 'Há 15 minutos',
      isRead: false,
      targetView: 'tracking' as const,
      orderId: 'NSL-8941203',
    },
    {
      id: 'notif-2',
      type: 'escrow' as const,
      title: 'Pagamento mantido com Segurança Escrow',
      message: 'O valor está protegido no sistema de retenção até que você confirme o recebimento do pacote.',
      time: 'Há 2 horas',
      isRead: false,
      targetView: 'order_detail' as const,
      orderId: 'NSL-8941203',
    },
    {
      id: 'notif-3',
      type: 'promos' as const,
      title: 'Cupom de 10% OFF ativado para compras de Eletrônicos!',
      message: 'Use o código NUSALIGLOBAL no seu próximo checkout.',
      time: 'Ontem 18:30',
      isRead: true,
      targetView: 'coupons' as const,
    },
    {
      id: 'notif-4',
      type: 'system' as const,
      title: 'Verificação de Identidade Concluída',
      message: 'Sua conta está 100% verificada e apta a compras sem limites no Mercado Nusali.',
      time: 'Há 3 dias',
      isRead: true,
      targetView: 'profile' as const,
    },
  ] as BuyerNotification[],

  chats: [
    {
      id: 'chat-1',
      name: 'Nusali Bissau Eletrônicos (Vendedor Oficial)',
      avatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=100&auto=format&fit=crop&q=80',
      isOfficial: true,
      lastMessage: 'Olá! O produto já foi despachado e você pode rastrear pelo código.',
      lastTime: '10:45',
      unreadCount: 0,
      messages: [
        { id: 'm1', sender: 'seller' as const, text: 'Olá! Obrigado pela sua compra no Mercado Nusali.', time: '10:30' },
        { id: 'm2', sender: 'buyer' as const, text: 'Boa tarde! Gostaria de saber quando será entregue em Bissau.', time: '10:35' },
        { id: 'm3', sender: 'seller' as const, text: 'Olá! O produto já foi despachado e você pode rastrear pelo código.', time: '10:45' },
      ],
    },
    {
      id: 'chat-2',
      name: 'Nusali Assistente de Vendas AI',
      avatar: 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=100&auto=format&fit=crop&q=80',
      isAi: true,
      lastMessage: 'Posso tirar suas dúvidas sobre frete e garantia Escrow.',
      lastTime: 'Ontem',
      unreadCount: 1,
      messages: [
        { id: 'm20', sender: 'ai' as const, text: 'Olá! Eu sou o Nusali Assistente. Como posso ajudar nas suas compras internacionais hoje?', time: 'Ontem' },
      ],
    },
  ] as BuyerChatThread[],

  reviews: [
    {
      id: 'rev-101',
      productId: 'p_demo_1',
      productTitle: 'Smartphone Nusali 5G CPLP',
      productImage: 'https://images.unsplash.com/photo-1511707171634-5f897ff02aa9?auto=format&fit=crop&q=80&w=800',
      rating: 5,
      title: 'Desempenho incrível e entrega muito rápida!',
      comment: 'Chegou em 24h em Bissau através da Nusali Express. O sinal 5G e a bateria duram o dia inteiro.',
      date: '28 de Julho de 2026',
      verifiedPurchase: true,
      likes: 14,
    },
  ] as BuyerReview[],

  orders: [
    {
      id: 'NSL-8941203',
      orderNumber: 'NSL-8941203',
      date: '10 de Agosto de 2026',
      status: 'shipped',
      estimatedDelivery: 'Chega amanhã até às 18:00 (Nusali Express)',
      total: 185000,
      currency: 'XOF',
      escrowStatus: 'held',
      escrowAmount: 185000,
      escrowReleaseDate: 'Previsto após confirmação de entrega',
      paymentMethod: 'Orange Money Bissau',
      paymentDetails: {
        method: 'Orange Money Bissau',
        currency: 'XOF',
        total: 185000,
      },
      trackingCode: 'NSL-GW-89412-EXPRESS',
      deliveryAddress: {
        recipientName: 'Alex Silva',
        street: 'Avenida Amílcar Cabral',
        number: '12, Bloco B',
        neighborhood: 'Centro',
        city: 'Bissau',
        state: 'Bissau',
        country: 'GW',
        zipCode: '1000',
        phone: '+245 955123456',
      },
      seller: {
        id: 'seller_001',
        name: 'Bissau Tech & Export Store',
        rating: 4.9,
        badge: 'Loja Oficial',
      },
      items: [
        {
          quantity: 1,
          unitPrice: 185000,
          product: {
            id: 'p_demo_1',
            title: 'Smartphone Nusali 5G CPLP',
            price: 185000,
            currency: 'XOF',
            brand: 'Nusali Tech',
            image: 'https://images.unsplash.com/photo-1511707171634-5f897ff02aa9?auto=format&fit=crop&q=80&w=800',
            seller: { name: 'Bissau Tech & Export Store' },
            full: true,
          },
        },
      ],
      trackingSteps: [
        { status: 'confirmed', title: 'Pagamento Aprovado', description: 'Retido no Escrow Nusali', timestamp: '10/08 09:30', completed: true },
        { status: 'preparing', title: 'Separado no HUB Central', description: 'HUB Bissau (Av. Amílcar Cabral)', timestamp: '10/08 14:15', completed: true },
        { status: 'shipped', title: 'Em Rota com Nusali Express', description: 'Veículo de entrega em trânsito', timestamp: 'Hoje 08:30', completed: true },
        { status: 'out_for_delivery', title: 'Saiu para Entrega', description: 'A caminho do endereço final', timestamp: 'Em breve', completed: false },
        { status: 'delivered', title: 'Entrega Concluída', description: 'Liberação do saldo Escrow ao vendedor', timestamp: 'Amanhã', completed: false },
      ],
      trackingEvents: [
        { status: 'Pedido Criado & Pago', date: '10/08 às 09:30', location: 'Plataforma Mercado Nusali', done: true },
        { status: 'Separado no HUB Central Bissau', date: '10/08 às 14:15', location: 'HUB Bissau (Av. Amílcar Cabral)', done: true },
        { status: 'Em Rota de Entrega com Nusali Express', date: 'Hoje às 08:30', location: 'Região de Bissau e Entornos', done: true },
        { status: 'Entrega Final & Liberação Escrow', date: 'Previsto: Amanhã às 14:00', location: 'Endereço do Comprador', done: false },
      ],
    },
    {
      id: 'NSL-7721901',
      orderNumber: 'NSL-7721901',
      date: '25 de Julho de 2026',
      status: 'delivered',
      estimatedDelivery: 'Entregue em 26 de Julho',
      total: 25000,
      currency: 'XOF',
      escrowStatus: 'released',
      escrowAmount: 25000,
      escrowReleaseDate: '26/07/2026 16:30',
      paymentMethod: 'Nusali Pay (Carteira Digital)',
      paymentDetails: {
        method: 'Nusali Pay (Carteira Digital)',
        currency: 'XOF',
        total: 25000,
      },
      trackingCode: 'NSL-GW-77219-DELIV',
      deliveryAddress: {
        recipientName: 'Alex Silva',
        street: 'Avenida Amílcar Cabral',
        number: '12, Bloco B',
        neighborhood: 'Centro',
        city: 'Bissau',
        state: 'Bissau',
        country: 'GW',
        zipCode: '1000',
        phone: '+245 955123456',
      },
      seller: {
        id: 'seller_002',
        name: 'São Tomé Select Cafés',
        rating: 4.8,
        badge: 'Produtor Certificado',
      },
      items: [
        {
          quantity: 2,
          unitPrice: 12500,
          product: {
            id: 'p_demo_2',
            title: 'Café Orgânico de São Tomé Premium 1kg',
            price: 12500,
            currency: 'XOF',
            brand: 'São Tomé Select',
            image: 'https://images.unsplash.com/photo-1559056199-641a0ac8b55e?auto=format&fit=crop&q=80&w=800',
            seller: { name: 'São Tomé Select Cafés' },
            full: true,
          },
        },
      ],
      trackingSteps: [
        { status: 'confirmed', title: 'Pagamento Aprovado', description: 'Protegido por Escrow', timestamp: '25/07 10:00', completed: true },
        { status: 'preparing', title: 'Separado na Origem', description: 'São Tomé Export HUB', timestamp: '25/07 14:00', completed: true },
        { status: 'shipped', title: 'Trânsito Internacional', description: 'Voo STP -> Bissau', timestamp: '25/07 18:00', completed: true },
        { status: 'out_for_delivery', title: 'Saiu para Entrega', description: 'HUB Central Bissau', timestamp: '26/07 09:00', completed: true },
        { status: 'delivered', title: 'Entregue com Sucesso', description: 'Saldo Escrow liberado', timestamp: '26/07 16:30', completed: true },
      ],
      trackingEvents: [
        { status: 'Pedido Criado & Pago', date: '25/07 às 10:00', location: 'Plataforma Mercado Nusali', done: true },
        { status: 'Despachado de São Tomé para Bissau', date: '25/07 às 18:00', location: 'Aeroporto Internacional São Tomé', done: true },
        { status: 'Recebido no HUB Central Bissau', date: '26/07 às 09:00', location: 'HUB Bissau', done: true },
        { status: 'Entregue com Sucesso', date: '26/07 às 16:30', location: 'Bissau, Guiné-Bissau', done: true },
      ],
    },
  ],

  tickets: [
    {
      id: 'tkt-101',
      subject: 'Dúvida sobre prazo de entrega em Bafatá',
      category: 'Entrega & Prazos',
      status: 'closed' as const,
      priority: 'normal' as const,
      createdAt: '01/08/2026 11:20',
      lastUpdate: '01/08/2026 14:00',
      messages: [
        { sender: 'Alex Silva', text: 'Gostaria de saber quantos dias demora o frete para a região de Bafatá.', time: '11:20' },
        { sender: 'Suporte Nusali', text: 'Olá Alex! Para a região de Bafatá e Gabú, o prazo da Nusali Logística é de 24 a 48 horas úteis.', time: '14:00' },
      ],
    },
  ] as BuyerSupportTicket[],
};

// ==========================================
// 1. BUYER PROFILE & OVERVIEW STATS
// ==========================================

buyerRouter.get('/profile', async (req: Request, res: Response) => {
  try {
    const isConnected = await checkDbConnection();
    if (isConnected) {
      const db = getDb();
      if (db) {
        const dbUsers = await db.select().from(users).where(eq(users.id, buyerDataStore.profile.id));
        if (dbUsers.length > 0) {
          const u = dbUsers[0];
          buyerDataStore.profile.fullName = u.fullName;
          buyerDataStore.profile.email = u.email;
          buyerDataStore.profile.country = u.countryCode;
          if (u.phone) buyerDataStore.profile.phone = u.phone;
          if (u.avatarUrl) buyerDataStore.profile.avatar = u.avatarUrl;
        }
      }
    }
  } catch {
    // fallback
  }

  return res.json({
    success: true,
    data: buyerDataStore.profile,
  });
});

buyerRouter.put('/profile', async (req: Request, res: Response) => {
  const updates = req.body;
  buyerDataStore.profile = {
    ...buyerDataStore.profile,
    ...updates,
  };

  try {
    const isConnected = await checkDbConnection();
    if (isConnected) {
      const db = getDb();
      if (db) {
        await db.update(users)
          .set({
            fullName: buyerDataStore.profile.fullName,
            phone: buyerDataStore.profile.phone,
            countryCode: buyerDataStore.profile.country,
            updatedAt: new Date(),
          })
          .where(eq(users.id, buyerDataStore.profile.id));
      }
    }
  } catch {
    // fallback
  }

  return res.json({
    success: true,
    message: 'Perfil do comprador atualizado com sucesso no banco de dados!',
    data: buyerDataStore.profile,
  });
});

buyerRouter.get('/overview', async (req: Request, res: Response) => {
  const activeOrdersCount = buyerDataStore.orders.filter(o => o.status !== 'delivered' && o.status !== 'cancelled').length;
  const totalOrdersCount = buyerDataStore.orders.length;
  const claimedCouponsCount = buyerDataStore.coupons.filter(c => c.isClaimed).length;
  const unreadNotificationsCount = buyerDataStore.notifications.filter(n => !n.isRead).length;

  return res.json({
    success: true,
    data: {
      profile: buyerDataStore.profile,
      metrics: {
        activeOrdersCount,
        totalOrdersCount,
        walletBalance: buyerDataStore.wallet.balance,
        cashbackBalance: buyerDataStore.wallet.cashbackBalance,
        pendingEscrowBalance: buyerDataStore.wallet.pendingEscrowBalance,
        favoritesCount: buyerDataStore.favorites.length,
        claimedCouponsCount,
        totalCouponsCount: buyerDataStore.coupons.length,
        openDisputesCount: buyerDataStore.disputes.filter(d => d.status === 'opened' || d.status === 'in_mediation').length,
        activeReturnsCount: buyerDataStore.returns.filter(r => r.status === 'under_review' || r.status === 'in_transit').length,
        unreadNotificationsCount,
      },
      recentOrders: buyerDataStore.orders.slice(0, 3),
      recentTransactions: buyerDataStore.wallet.transactions.slice(0, 3),
    },
  });
});

// ==========================================
// 2. SECURITY & SESSIONS
// ==========================================

buyerRouter.get('/security', (req: Request, res: Response) => {
  return res.json({
    success: true,
    data: {
      is2FAEnabled: buyerDataStore.profile.is2FAEnabled,
      email: buyerDataStore.profile.email,
      phone: buyerDataStore.profile.phone,
      sessions: buyerDataStore.sessions,
    },
  });
});

buyerRouter.post('/security/password', (req: Request, res: Response) => {
  const { currentPassword, newPassword } = req.body;
  if (!newPassword || newPassword.length < 8) {
    return res.status(400).json({ success: false, message: 'A nova senha deve ter no mínimo 8 caracteres.' });
  }

  return res.json({
    success: true,
    message: 'Senha de acesso alterada com sucesso!',
  });
});

buyerRouter.post('/security/2fa', (req: Request, res: Response) => {
  const { enabled } = req.body;
  buyerDataStore.profile.is2FAEnabled = Boolean(enabled);
  return res.json({
    success: true,
    message: enabled ? 'Autenticação em 2 fatores (2FA) ativada com sucesso!' : '2FA desativada.',
    data: { is2FAEnabled: buyerDataStore.profile.is2FAEnabled },
  });
});

buyerRouter.get('/security/sessions', (req: Request, res: Response) => {
  return res.json({
    success: true,
    data: buyerDataStore.sessions,
  });
});

buyerRouter.delete('/security/sessions/:id', (req: Request, res: Response) => {
  const { id } = req.params;
  buyerDataStore.sessions = buyerDataStore.sessions.filter(s => s.id !== id);
  return res.json({
    success: true,
    message: 'Sessão encerrada com sucesso.',
    data: buyerDataStore.sessions,
  });
});

// ==========================================
// 3. ADDRESSES (CRUD)
// ==========================================

buyerRouter.get('/addresses', (req: Request, res: Response) => {
  return res.json({
    success: true,
    data: buyerDataStore.addresses,
  });
});

buyerRouter.post('/addresses', (req: Request, res: Response) => {
  const { recipientName, street, number, complement, neighborhood, city, state, country, zipCode, phone, isDefault } = req.body;

  if (!recipientName || !street || !city) {
    return res.status(400).json({ success: false, message: 'Nome, rua e cidade são obrigatórios.' });
  }

  const newAddress: BuyerAddress = {
    id: `addr-${Date.now()}`,
    recipientName,
    street,
    number: number || 'S/N',
    complement: complement || '',
    neighborhood: neighborhood || 'Centro',
    city,
    state: state || city,
    country: country || buyerDataStore.profile.country || 'GW',
    zipCode: zipCode || '1000',
    phone: phone || buyerDataStore.profile.phone,
    isDefault: Boolean(isDefault) || buyerDataStore.addresses.length === 0,
  };

  if (newAddress.isDefault) {
    buyerDataStore.addresses.forEach(a => { a.isDefault = false; });
  }

  buyerDataStore.addresses.unshift(newAddress);

  return res.json({
    success: true,
    message: 'Endereço cadastrado com sucesso!',
    data: newAddress,
  });
});

buyerRouter.put('/addresses/:id', (req: Request, res: Response) => {
  const { id } = req.params;
  const idx = buyerDataStore.addresses.findIndex(a => a.id === id);
  if (idx === -1) {
    return res.status(404).json({ success: false, message: 'Endereço não encontrado.' });
  }

  if (req.body.isDefault) {
    buyerDataStore.addresses.forEach(a => { a.isDefault = false; });
  }

  buyerDataStore.addresses[idx] = {
    ...buyerDataStore.addresses[idx],
    ...req.body,
  };

  return res.json({
    success: true,
    message: 'Endereço atualizado com sucesso!',
    data: buyerDataStore.addresses[idx],
  });
});

buyerRouter.delete('/addresses/:id', (req: Request, res: Response) => {
  const { id } = req.params;
  buyerDataStore.addresses = buyerDataStore.addresses.filter(a => a.id !== id);

  if (buyerDataStore.addresses.length > 0 && !buyerDataStore.addresses.some(a => a.isDefault)) {
    buyerDataStore.addresses[0].isDefault = true;
  }

  return res.json({
    success: true,
    message: 'Endereço removido com sucesso.',
    data: buyerDataStore.addresses,
  });
});

buyerRouter.patch('/addresses/:id/default', (req: Request, res: Response) => {
  const { id } = req.params;
  buyerDataStore.addresses.forEach(a => {
    a.isDefault = a.id === id;
  });

  return res.json({
    success: true,
    message: 'Endereço padrão de entrega definido com sucesso!',
    data: buyerDataStore.addresses,
  });
});

// ==========================================
// 4. ORDERS & TRACKING
// ==========================================

buyerRouter.get('/orders', async (req: Request, res: Response) => {
  return res.json({
    success: true,
    data: buyerDataStore.orders,
  });
});

buyerRouter.get('/orders/:id', (req: Request, res: Response) => {
  const { id } = req.params;
  const order = buyerDataStore.orders.find(o => o.id === id || o.orderNumber === id);
  if (!order) {
    return res.status(404).json({ success: false, message: 'Pedido não encontrado.' });
  }

  return res.json({
    success: true,
    data: order,
  });
});

buyerRouter.post('/orders', async (req: Request, res: Response) => {
  const { items, totalAmount, currency, paymentMethod, deliveryAddress, couponCode } = req.body;

  const orderId = `NSL-${Math.floor(1000000 + Math.random() * 9000000)}`;
  const newOrder = {
    id: orderId,
    orderNumber: orderId,
    date: 'Hoje às ' + new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    status: 'paid',
    estimatedDelivery: 'Previsão de 24 a 48h (Nusali Logística Express)',
    total: Number(totalAmount) || 185000,
    currency: currency || buyerDataStore.profile.preferredCurrency || 'XOF',
    escrowStatus: 'held',
    escrowAmount: Number(totalAmount) || 185000,
    escrowReleaseDate: 'Garantido até confirmação de entrega',
    paymentMethod: paymentMethod || 'Orange Money Bissau',
    paymentDetails: {
      method: paymentMethod || 'Orange Money Bissau',
      currency: currency || buyerDataStore.profile.preferredCurrency || 'XOF',
      total: Number(totalAmount) || 185000,
    },
    trackingCode: `NSL-GW-${Math.floor(10000 + Math.random() * 90000)}-EXP`,
    deliveryAddress: deliveryAddress || buyerDataStore.addresses[0] || {
      recipientName: buyerDataStore.profile.fullName,
      street: buyerDataStore.profile.address,
      number: '12',
      neighborhood: 'Centro',
      city: 'Bissau',
      state: 'Bissau',
      country: 'GW',
      zipCode: '1000',
    },
    seller: {
      id: 'seller_001',
      name: 'Bissau Tech & Export Store',
      rating: 4.9,
      badge: 'Loja Oficial',
    },
    items: Array.isArray(items) && items.length > 0 ? items : [
      {
        quantity: 1,
        unitPrice: Number(totalAmount) || 185000,
        product: {
          id: 'p_demo_1',
          title: 'Smartphone Nusali 5G CPLP',
          price: Number(totalAmount) || 185000,
          currency: currency || 'XOF',
          brand: 'Nusali Tech',
          image: 'https://images.unsplash.com/photo-1511707171634-5f897ff02aa9?auto=format&fit=crop&q=80&w=800',
          seller: { name: 'Bissau Tech & Export Store' },
          full: true,
        },
      },
    ],
    trackingSteps: [
      { status: 'confirmed', title: 'Pagamento Aprovado', description: 'Protegido por Escrow Nusali', timestamp: 'Agora', completed: true },
      { status: 'preparing', title: 'Em Separação no HUB', description: 'HUB Central Nusali Logística', timestamp: 'Em andamento', completed: false },
      { status: 'shipped', title: 'Em Trânsito com Nusali Express', description: 'Veículo em rota de entrega', timestamp: 'A caminho', completed: false },
      { status: 'out_for_delivery', title: 'Saiu para Entrega', description: 'Entregador a caminho do endereço', timestamp: 'Em breve', completed: false },
      { status: 'delivered', title: 'Entrega Concluída', description: 'Liberação de saldo ao vendedor', timestamp: 'Final', completed: false },
    ],
    trackingEvents: [
      { status: 'Pedido Criado & Pago', date: 'Agora mesmo', location: 'Plataforma Mercado Nusali', done: true },
      { status: 'Separando no HUB Bissau', date: 'Em andamento', location: 'HUB Bissau Central', done: false },
      { status: 'Em Trânsito com Nusali Express', date: 'Próxima etapa', location: 'Rota de Entrega', done: false },
      { status: 'Entrega Final & Liberação Escrow', date: 'Aguardando', location: 'Endereço do Comprador', done: false },
    ],
  };

  buyerDataStore.orders.unshift(newOrder);

  // Add wallet transaction record
  buyerDataStore.wallet.transactions.unshift({
    id: `tx-${Date.now()}`,
    type: 'purchase',
    title: `Compra Pedido #${orderId}`,
    amount: -Number(totalAmount || 185000),
    currency: currency || 'XOF',
    date: 'Agora mesmo',
    status: 'Escrow Retido',
    method: paymentMethod || 'Orange Money',
  });

  // Add notification
  buyerDataStore.notifications.unshift({
    id: `notif-${Date.now()}`,
    type: 'orders',
    title: `Pedido #${orderId} confirmado!`,
    message: 'Seu pedido foi registrado e o pagamento está 100% protegido pelo sistema Escrow.',
    time: 'Agora mesmo',
    isRead: false,
    targetView: 'tracking',
    orderId,
  });

  return res.json({
    success: true,
    message: 'Pedido realizado com sucesso com Garantia Escrow!',
    data: newOrder,
  });
});

buyerRouter.post('/orders/:id/confirm-delivery', (req: Request, res: Response) => {
  const { id } = req.params;
  const order = buyerDataStore.orders.find(o => o.id === id || o.orderNumber === id);
  if (!order) {
    return res.status(404).json({ success: false, message: 'Pedido não encontrado.' });
  }

  order.status = 'delivered';
  order.escrowStatus = 'released';
  order.escrowReleaseDate = new Date().toISOString();
  if (Array.isArray(order.trackingEvents)) {
    order.trackingEvents.forEach((ev: any) => { ev.done = true; });
  }

  // Credit cashback in Nusali Pay
  const cashbackVal = Math.round(order.total * 0.02);
  buyerDataStore.wallet.cashbackBalance += cashbackVal;

  buyerDataStore.notifications.unshift({
    id: `notif-${Date.now()}`,
    type: 'escrow',
    title: `Recebimento Confirmado do Pedido #${order.id}`,
    message: `Você liberou os fundos com sucesso e recebeu ${cashbackVal} ${order.currency} de Cashback no Nusali+!`,
    time: 'Agora mesmo',
    isRead: false,
    targetView: 'wallet',
  });

  return res.json({
    success: true,
    message: 'Recebimento confirmado com sucesso! Fundos de custódia liberados para o vendedor e cashback creditado.',
    data: order,
  });
});

buyerRouter.post('/orders/:id/cancel', (req: Request, res: Response) => {
  const { id } = req.params;
  const order = buyerDataStore.orders.find(o => o.id === id || o.orderNumber === id);
  if (!order) {
    return res.status(404).json({ success: false, message: 'Pedido não encontrado.' });
  }

  if (order.status === 'delivered') {
    return res.status(400).json({ success: false, message: 'Pedido já entregue não pode ser cancelado. Solicite uma Devolução.' });
  }

  order.status = 'cancelled';
  order.escrowStatus = 'refunded';

  // Refund to wallet
  buyerDataStore.wallet.balance += order.total;
  buyerDataStore.wallet.transactions.unshift({
    id: `tx-${Date.now()}`,
    type: 'refund',
    title: `Estorno Pedido #${order.id}`,
    amount: +order.total,
    currency: order.currency,
    date: 'Agora mesmo',
    status: 'Concluído',
    method: 'Reembolso Imediato Nusali Pay',
  });

  return res.json({
    success: true,
    message: 'Pedido cancelado e valor integralmente estornado para sua Carteira Nusali Pay!',
    data: order,
  });
});

buyerRouter.get('/orders/:id/track', (req: Request, res: Response) => {
  const { id } = req.params;
  const order = buyerDataStore.orders.find(o => o.id === id || o.orderNumber === id);
  if (!order) {
    return res.status(404).json({ success: false, message: 'Pedido não encontrado.' });
  }

  return res.json({
    success: true,
    data: {
      orderId: order.id,
      trackingCode: order.trackingCode,
      status: order.status,
      estimatedDelivery: order.estimatedDelivery,
      carrier: 'Nusali Express Logística CPLP',
      origin: 'HUB Central Bissau - Armazém Bandim',
      destination: `${order.deliveryAddress.city}, ${order.deliveryAddress.country}`,
      timeline: order.trackingEvents,
    },
  });
});

// ==========================================
// 5. WALLET & NUSALI PAY
// ==========================================

buyerRouter.get('/wallet', (req: Request, res: Response) => {
  return res.json({
    success: true,
    data: {
      userId: buyerDataStore.profile.id,
      balance: buyerDataStore.wallet.balance,
      cashbackBalance: buyerDataStore.wallet.cashbackBalance,
      pendingEscrowBalance: buyerDataStore.wallet.pendingEscrowBalance,
      currency: buyerDataStore.wallet.currency,
      savedCards: buyerDataStore.wallet.savedCards,
      transactions: buyerDataStore.wallet.transactions,
    },
  });
});

buyerRouter.post('/wallet/deposit', (req: Request, res: Response) => {
  const { amount, method, currency } = req.body;
  const val = Number(amount);
  if (!val || val <= 0) {
    return res.status(400).json({ success: false, message: 'Valor de depósito inválido.' });
  }

  buyerDataStore.wallet.balance += val;

  const newTx: BuyerWalletTransaction = {
    id: `tx-${Date.now()}`,
    type: 'deposit',
    title: `Recarga de Saldo Nusali Pay (${(method || 'Depósito Local').toUpperCase()})`,
    amount: val,
    currency: currency || buyerDataStore.wallet.currency,
    date: 'Agora mesmo',
    status: 'Concluído',
    method: (method || 'orange_money').toUpperCase(),
  };

  buyerDataStore.wallet.transactions.unshift(newTx);

  buyerDataStore.notifications.unshift({
    id: `notif-${Date.now()}`,
    type: 'escrow',
    title: 'Recarga Nusali Pay Confirmada!',
    message: `Seu saldo foi recarregado em +${val.toLocaleString()} ${currency || 'XOF'}.`,
    time: 'Agora mesmo',
    isRead: false,
    targetView: 'wallet',
  });

  return res.json({
    success: true,
    message: `Depósito de ${val.toLocaleString()} ${currency || 'XOF'} creditado com sucesso na sua carteira!`,
    data: {
      balance: buyerDataStore.wallet.balance,
      cashbackBalance: buyerDataStore.wallet.cashbackBalance,
      transaction: newTx,
    },
  });
});

buyerRouter.post('/wallet/transfer', (req: Request, res: Response) => {
  const { recipientEmailOrPhone, amount } = req.body;
  const val = Number(amount);
  if (!val || val <= 0 || val > buyerDataStore.wallet.balance) {
    return res.status(400).json({ success: false, message: 'Saldo insuficiente para realizar a transferência.' });
  }

  buyerDataStore.wallet.balance -= val;

  const newTx: BuyerWalletTransaction = {
    id: `tx-${Date.now()}`,
    type: 'transfer',
    title: `Transferência enviada para ${recipientEmailOrPhone}`,
    amount: -val,
    currency: buyerDataStore.wallet.currency,
    date: 'Agora mesmo',
    status: 'Concluído',
    method: 'Nusali Pay Transfer',
  };

  buyerDataStore.wallet.transactions.unshift(newTx);

  return res.json({
    success: true,
    message: `Transferência de ${val.toLocaleString()} ${buyerDataStore.wallet.currency} enviada com sucesso!`,
    data: {
      balance: buyerDataStore.wallet.balance,
      transaction: newTx,
    },
  });
});

// ==========================================
// 6. COUPONS & PROMOTIONS
// ==========================================

buyerRouter.get('/coupons', (req: Request, res: Response) => {
  return res.json({
    success: true,
    data: buyerDataStore.coupons,
  });
});

buyerRouter.post('/coupons/claim', (req: Request, res: Response) => {
  const { couponId, code } = req.body;
  const coupon = buyerDataStore.coupons.find(c => c.id === couponId || c.code.toUpperCase() === (code || '').toUpperCase());
  if (!coupon) {
    return res.status(404).json({ success: false, message: 'Cupom não encontrado.' });
  }

  coupon.isClaimed = true;

  return res.json({
    success: true,
    message: `Cupom ${coupon.code} resgatado com sucesso!`,
    data: coupon,
  });
});

buyerRouter.post('/coupons/validate', (req: Request, res: Response) => {
  const { code } = req.body;
  const coupon = buyerDataStore.coupons.find(c => c.code.toUpperCase() === (code || '').trim().toUpperCase());
  if (!coupon) {
    return res.status(400).json({ success: false, message: 'Cupom inválido ou expirado.' });
  }

  return res.json({
    success: true,
    message: `Cupom "${coupon.code}" aplicado com sucesso! (${coupon.discount})`,
    data: coupon,
  });
});

// ==========================================
// 7. FAVORITES / WISHLIST
// ==========================================

buyerRouter.get('/favorites', (req: Request, res: Response) => {
  return res.json({
    success: true,
    data: buyerDataStore.favorites,
  });
});

buyerRouter.post('/favorites', (req: Request, res: Response) => {
  const product = req.body;
  if (!product || !product.id) {
    return res.status(400).json({ success: false, message: 'Produto inválido.' });
  }

  const existing = buyerDataStore.favorites.find(f => f.id === product.id);
  if (!existing) {
    buyerDataStore.favorites.unshift({
      ...product,
      dateAdded: new Date().toISOString().split('T')[0],
    });
  }

  return res.json({
    success: true,
    message: 'Produto adicionado aos seus favoritos!',
    data: buyerDataStore.favorites,
  });
});

buyerRouter.delete('/favorites/:productId', (req: Request, res: Response) => {
  const { productId } = req.params;
  buyerDataStore.favorites = buyerDataStore.favorites.filter(f => f.id !== productId);

  return res.json({
    success: true,
    message: 'Produto removido dos favoritos.',
    data: buyerDataStore.favorites,
  });
});

// ==========================================
// 8. RETURNS & REFUNDS
// ==========================================

buyerRouter.get('/returns', (req: Request, res: Response) => {
  return res.json({
    success: true,
    data: buyerDataStore.returns,
  });
});

buyerRouter.post('/returns', (req: Request, res: Response) => {
  const { orderId, reason, description, productTitle } = req.body;

  if (!orderId || !description) {
    return res.status(400).json({ success: false, message: 'ID do pedido e descrição do motivo são obrigatórios.' });
  }

  const newReturn: BuyerReturn = {
    id: `ret-${Date.now()}`,
    orderId,
    productTitle: productTitle || 'Produto do Pedido #' + orderId,
    reason: reason || 'Defeito de Fabricação',
    description,
    amount: 19000,
    currency: buyerDataStore.profile.preferredCurrency || 'XOF',
    status: 'under_review',
    date: 'Agora mesmo',
    trackingLabelCode: `DEV-GW-${Math.floor(10000 + Math.random() * 90000)}-NSL`,
  };

  buyerDataStore.returns.unshift(newReturn);

  buyerDataStore.notifications.unshift({
    id: `notif-${Date.now()}`,
    type: 'orders',
    title: 'Solicitação de Devolução Registrada',
    message: `A etiqueta de frete reverso ${newReturn.trackingLabelCode} foi gerada. Apresente no HUB Nusali mais próximo.`,
    time: 'Agora mesmo',
    isRead: false,
    targetView: 'profile',
  });

  return res.json({
    success: true,
    message: 'Solicitação de devolução gratuita enviada com sucesso! Etiqueta de frete reverso gerada.',
    data: newReturn,
  });
});

// ==========================================
// 9. DISPUTES & ESCROW MEDIATION
// ==========================================

buyerRouter.get('/disputes', (req: Request, res: Response) => {
  return res.json({
    success: true,
    data: buyerDataStore.disputes,
  });
});

buyerRouter.get('/disputes/:id', (req: Request, res: Response) => {
  const { id } = req.params;
  const dispute = buyerDataStore.disputes.find(d => d.id === id);
  if (!dispute) {
    return res.status(404).json({ success: false, message: 'Disputa não encontrada.' });
  }

  return res.json({
    success: true,
    data: dispute,
  });
});

buyerRouter.post('/disputes', (req: Request, res: Response) => {
  const { orderId, reason, description } = req.body;

  if (!orderId || !description) {
    return res.status(400).json({ success: false, message: 'ID do pedido e descrição são obrigatórios.' });
  }

  const order = buyerDataStore.orders.find(o => o.id === orderId || o.orderNumber === orderId);

  const newDispute: BuyerDispute = {
    id: `disp-${Date.now()}`,
    orderId,
    orderNumber: order ? order.orderNumber : orderId,
    productTitle: order && order.items[0] ? order.items[0].product.title : 'Item em Disputa',
    sellerName: order && order.seller ? order.seller.name : 'Vendedor Oficial',
    reason: reason || 'Produto divergente ou com avaria',
    description,
    amount: order ? order.total : 19000,
    currency: order ? order.currency : 'XOF',
    status: 'opened',
    date: 'Agora mesmo',
    messages: [
      {
        id: `dm-${Date.now()}`,
        sender: 'buyer',
        senderName: buyerDataStore.profile.fullName,
        text: description,
        timestamp: 'Agora mesmo',
      },
      {
        id: `dm-${Date.now() + 1}`,
        sender: 'mediator',
        senderName: 'Mediação Oficial Nusali',
        text: 'Disputa aberta. Os fundos de pagamento encontram-se bloqueados em custódia segura até o desfecho da mediação.',
        timestamp: 'Agora mesmo',
      },
    ],
  };

  buyerDataStore.disputes.unshift(newDispute);

  buyerDataStore.notifications.unshift({
    id: `notif-${Date.now()}`,
    type: 'escrow',
    title: `Disputa aberta para o Pedido #${orderId}`,
    message: 'A mediação do Mercado Nusali foi acionada. O valor segue protegido sob custódia Escrow.',
    time: 'Agora mesmo',
    isRead: false,
    targetView: 'disputes',
  });

  return res.json({
    success: true,
    message: 'Disputa aberta com sucesso! O pagamento permanece protegido sob custódia Escrow.',
    data: newDispute,
  });
});

buyerRouter.post('/disputes/:id/messages', (req: Request, res: Response) => {
  const { id } = req.params;
  const { text } = req.body;

  if (!text || !text.trim()) {
    return res.status(400).json({ success: false, message: 'Texto da mensagem é obrigatório.' });
  }

  const dispute = buyerDataStore.disputes.find(d => d.id === id);
  if (!dispute) {
    return res.status(404).json({ success: false, message: 'Disputa não encontrada.' });
  }

  const newMsg = {
    id: `dm-${Date.now()}`,
    sender: 'buyer' as const,
    senderName: buyerDataStore.profile.fullName,
    text: text.trim(),
    timestamp: 'Agora mesmo',
  };

  dispute.messages.push(newMsg);

  return res.json({
    success: true,
    message: 'Mensagem enviada na sala de mediação!',
    data: newMsg,
  });
});

// ==========================================
// 10. NOTIFICATIONS
// ==========================================

buyerRouter.get('/notifications', (req: Request, res: Response) => {
  return res.json({
    success: true,
    data: buyerDataStore.notifications,
  });
});

buyerRouter.patch('/notifications/:id/read', (req: Request, res: Response) => {
  const { id } = req.params;
  const notif = buyerDataStore.notifications.find(n => n.id === id);
  if (notif) {
    notif.isRead = true;
  }

  return res.json({
    success: true,
    message: 'Notificação marcada como lida.',
    data: buyerDataStore.notifications,
  });
});

buyerRouter.post('/notifications/read-all', (req: Request, res: Response) => {
  buyerDataStore.notifications.forEach(n => { n.isRead = true; });

  return res.json({
    success: true,
    message: 'Todas as notificações foram marcadas como lidas!',
    data: buyerDataStore.notifications,
  });
});

buyerRouter.delete('/notifications', (req: Request, res: Response) => {
  buyerDataStore.notifications = [];

  return res.json({
    success: true,
    message: 'Histórico de notificações limpo.',
    data: [],
  });
});

// ==========================================
// 11. MESSAGES & LIVE CHAT
// ==========================================

buyerRouter.get('/messages', (req: Request, res: Response) => {
  return res.json({
    success: true,
    data: buyerDataStore.chats,
  });
});

buyerRouter.get('/messages/:chatId', (req: Request, res: Response) => {
  const { chatId } = req.params;
  const chat = buyerDataStore.chats.find(c => c.id === chatId);
  if (!chat) {
    return res.status(404).json({ success: false, message: 'Conversa não encontrada.' });
  }

  return res.json({
    success: true,
    data: chat,
  });
});

buyerRouter.post('/messages/:chatId', async (req: Request, res: Response) => {
  const { chatId } = req.params;
  const { text } = req.body;

  if (!text || !text.trim()) {
    return res.status(400).json({ success: false, message: 'Texto da mensagem é obrigatório.' });
  }

  const chat = buyerDataStore.chats.find(c => c.id === chatId);
  if (!chat) {
    return res.status(404).json({ success: false, message: 'Conversa não encontrada.' });
  }

  const userMsg: BuyerChatMessage = {
    id: `m-${Date.now()}`,
    sender: 'buyer',
    text: text.trim(),
    time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
  };

  chat.messages.push(userMsg);
  chat.lastMessage = userMsg.text;
  chat.lastTime = userMsg.time;

  // If chat is with AI, generate automatic assistant answer
  if (chat.isAi) {
    const aiReply: BuyerChatMessage = {
      id: `m-${Date.now() + 1}`,
      sender: 'ai',
      text: `Nusali Assistente: Compreendido! Sobre "${text.trim().substring(0, 30)}...", posso te confirmar que nossas entregas são garantidas por proteção Escrow e você pode acompanhar o status pelo painel em Minhas Compras.`,
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    };
    chat.messages.push(aiReply);
    chat.lastMessage = aiReply.text;
    chat.lastTime = aiReply.time;
  }

  return res.json({
    success: true,
    message: 'Mensagem enviada!',
    data: chat,
  });
});

// ==========================================
// 12. REVIEWS & RATINGS
// ==========================================

buyerRouter.get('/reviews', (req: Request, res: Response) => {
  return res.json({
    success: true,
    data: buyerDataStore.reviews,
  });
});

buyerRouter.post('/reviews', (req: Request, res: Response) => {
  const { productId, productTitle, rating, title, comment } = req.body;

  if (!productId || !rating) {
    return res.status(400).json({ success: false, message: 'Produto e nota (rating) são obrigatórios.' });
  }

  const newReview: BuyerReview = {
    id: `rev-${Date.now()}`,
    productId,
    productTitle: productTitle || 'Produto Nusali',
    productImage: 'https://images.unsplash.com/photo-1511707171634-5f897ff02aa9?auto=format&fit=crop&q=80&w=800',
    rating: Number(rating) || 5,
    title: title || 'Excelente produto',
    comment: comment || '',
    date: 'Hoje',
    verifiedPurchase: true,
    likes: 0,
  };

  buyerDataStore.reviews.unshift(newReview);

  return res.json({
    success: true,
    message: 'Avaliação publicada com sucesso! Obrigado pelo feedback.',
    data: newReview,
  });
});

// ==========================================
// 13. SUPPORT TICKETS & HELP
// ==========================================

buyerRouter.get('/tickets', (req: Request, res: Response) => {
  return res.json({
    success: true,
    data: buyerDataStore.tickets,
  });
});

buyerRouter.post('/tickets', (req: Request, res: Response) => {
  const { subject, category, message, priority } = req.body;

  if (!subject || !message) {
    return res.status(400).json({ success: false, message: 'Assunto e mensagem são obrigatórios.' });
  }

  const newTicket: BuyerSupportTicket = {
    id: `tkt-${Math.floor(100 + Math.random() * 900)}`,
    subject,
    category: category || 'Geral',
    status: 'open',
    priority: priority || 'normal',
    createdAt: new Date().toLocaleDateString() + ' ' + new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    lastUpdate: 'Agora mesmo',
    messages: [
      {
        sender: buyerDataStore.profile.fullName,
        text: message,
        time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      },
    ],
  };

  buyerDataStore.tickets.unshift(newTicket);

  return res.json({
    success: true,
    message: 'Chamado de suporte aberto com sucesso! Nosso time responderá em até 2 horas úteis.',
    data: newTicket,
  });
});
