export const QUERY_KEYS = {
  products: {
    all: ['products'] as const,
    list: (filters?: any) => ['products', 'list', filters] as const,
    detail: (id: string) => ['products', 'detail', id] as const,
    byCategory: (category: string) => ['products', 'category', category] as const,
    bySeller: (sellerId: string) => ['products', 'seller', sellerId] as const,
  },
  orders: {
    all: ['orders'] as const,
    list: (filters?: any) => ['orders', 'list', filters] as const,
    detail: (id: string) => ['orders', 'detail', id] as const,
    buyer: (buyerId?: string) => ['orders', 'buyer', buyerId] as const,
    seller: (sellerId?: string) => ['orders', 'seller', sellerId] as const,
  },
  stores: {
    all: ['stores'] as const,
    list: (filters?: any) => ['stores', 'list', filters] as const,
    detail: (id: string) => ['stores', 'detail', id] as const,
  },
  categories: {
    all: ['categories'] as const,
    detail: (idOrSlug: string) => ['categories', 'detail', idOrSlug] as const,
  },
  seller: {
    all: ['seller'] as const,
    overview: (sellerId?: string) => ['seller', 'overview', sellerId] as const,
    analytics: (sellerId?: string) => ['seller', 'analytics', sellerId] as const,
    products: (sellerId?: string) => ['seller', 'products', sellerId] as const,
    orders: (sellerId?: string) => ['seller', 'orders', sellerId] as const,
  },
  wallet: {
    all: ['wallet'] as const,
    balance: (userId?: string) => ['wallet', 'balance', userId] as const,
    transactions: (userId?: string) => ['wallet', 'transactions', userId] as const,
  },
  payments: {
    all: ['payments'] as const,
    methods: ['payments', 'methods'] as const,
    history: ['payments', 'history'] as const,
  },
  notifications: {
    all: ['notifications'] as const,
    unread: ['notifications', 'unread'] as const,
  },
  countries: {
    all: ['countries'] as const,
    active: ['countries', 'active'] as const,
  },
  cart: {
    current: ['cart'] as const,
  },
  auth: {
    user: ['auth', 'user'] as const,
  },
  disputes: {
    all: ['disputes'] as const,
    detail: (id: string) => ['disputes', 'detail', id] as const,
  },
  escrow: {
    all: ['escrow'] as const,
    detail: (id: string) => ['escrow', 'detail', id] as const,
  },
  returns: {
    all: ['returns'] as const,
    detail: (id: string) => ['returns', 'detail', id] as const,
  },
  reviews: {
    all: ['reviews'] as const,
    byProduct: (productId: string) => ['reviews', 'product', productId] as const,
  },
  support: {
    tickets: ['support', 'tickets'] as const,
  },
  admin: {
    all: ['admin'] as const,
    dashboard: ['admin', 'dashboard'] as const,
    users: ['admin', 'users'] as const,
    kyc: ['admin', 'kyc'] as const,
  },
};
