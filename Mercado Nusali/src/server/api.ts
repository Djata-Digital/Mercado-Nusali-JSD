import { Router, Request, Response } from 'express';
import { adminRouter } from './adminRoutes.js';
import { sellerRouter } from './sellerRoutes.js';
import { buyerRouter } from './buyerRoutes.js';
import { pixRouter } from './pixRoutes.js';
import { ratesRouter } from './ratesRoutes.js';
import { authRouter } from './modules/auth/authRoutes.js';
import { catalogRouter } from './modules/catalog/catalogRoutes.js';
import { orderRouter } from './modules/orders/orderRoutes.js';
import { paymentRouter } from './modules/payments/paymentRoutes.js';
import { walletRouter } from './modules/wallet/walletRoutes.js';
import { getQueuesHealth } from './infra/queues.js';
import { getStorageHealth } from './infra/storage.js';
import { getDb, getDbPool, checkDbConnection } from '../db/index.js';
import { products, regions, warehouses, users, orders, orderItems } from '../db/schema.js';
import { getCache, setCache, delCache, getRedisHealth } from '../db/redis.js';
import { runDatabaseInitAndSeed } from '../db/seed.js';
import { eq, desc } from 'drizzle-orm';
import { searchProductsIntelligent } from '../utils/searchEngine.js';
import { ProductCreationService } from './modules/catalog/productCreationService.js';
import { uploadRouter } from './uploadRoutes.js';
import { ShipmentService } from './modules/logistics/shipmentService.js';
import { asaasWebhookRouter } from './modules/payments/asaasWebhookRoutes.js';

export const apiRouter = Router();

// Mount V1 Modular Architecture Sub-routers
apiRouter.use('/auth', authRouter);
apiRouter.use('/catalog', catalogRouter);
apiRouter.use('/orders', orderRouter);
apiRouter.use('/payments', paymentRouter);
apiRouter.use('/wallet', walletRouter);
apiRouter.use('/webhooks', asaasWebhookRouter);
apiRouter.use('/admin', adminRouter);
apiRouter.use('/seller', sellerRouter);
apiRouter.use('/buyer', buyerRouter);
apiRouter.use('/pix', pixRouter);
apiRouter.use('/rates', ratesRouter);
apiRouter.use('/upload', uploadRouter);

// Public Tracking Route (Requirement 29)
apiRouter.get('/tracking/:trackingCode', async (req: Request, res: Response) => {
  try {
    const tracking = await ShipmentService.getPublicTracking(req.params.trackingCode);
    return res.json({ success: true, data: tracking });
  } catch (err: any) {
    return res.status(404).json({
      success: false,
      error: { code: 'TRACKING_NOT_FOUND', message: err?.message || 'Rastreamento não encontrado.' },
    });
  }
});

// Direct top-level route proxies for buyer resources
apiRouter.use('/orders', (req, res, next) => {
  req.url = req.url === '/' ? '/orders' : `/orders${req.url}`;
  buyerRouter(req, res, next);
});
apiRouter.use('/wallet', (req, res, next) => {
  req.url = req.url === '/' ? '/wallet' : `/wallet${req.url}`;
  buyerRouter(req, res, next);
});
apiRouter.use('/coupons', (req, res, next) => {
  req.url = req.url === '/' ? '/coupons' : `/coupons${req.url}`;
  buyerRouter(req, res, next);
});
apiRouter.use('/favorites', (req, res, next) => {
  req.url = req.url === '/' ? '/favorites' : `/favorites${req.url}`;
  buyerRouter(req, res, next);
});
apiRouter.use('/returns', (req, res, next) => {
  req.url = req.url === '/' ? '/returns' : `/returns${req.url}`;
  buyerRouter(req, res, next);
});
apiRouter.use('/disputes', (req, res, next) => {
  req.url = req.url === '/' ? '/disputes' : `/disputes${req.url}`;
  buyerRouter(req, res, next);
});
apiRouter.use('/addresses', (req, res, next) => {
  req.url = req.url === '/' ? '/addresses' : `/addresses${req.url}`;
  buyerRouter(req, res, next);
});
apiRouter.use('/notifications', (req, res, next) => {
  req.url = req.url === '/' ? '/notifications' : `/notifications${req.url}`;
  buyerRouter(req, res, next);
});
apiRouter.use('/messages', (req, res, next) => {
  req.url = req.url === '/' ? '/messages' : `/messages${req.url}`;
  buyerRouter(req, res, next);
});
apiRouter.use('/reviews', (req, res, next) => {
  req.url = req.url === '/' ? '/reviews' : `/reviews${req.url}`;
  buyerRouter(req, res, next);
});
apiRouter.use('/cart', (req, res, next) => {
  req.url = req.url === '/' ? '/cart' : `/cart${req.url}`;
  buyerRouter(req, res, next);
});
apiRouter.use('/categories', (req, res, next) => {
  req.url = req.url === '/' ? '/categories' : `/categories${req.url}`;
  catalogRouter(req, res, next);
});

// Auto-run seed on initial server setup if DB is connected
let isDbInitialized = false;

async function ensureDbInitialized() {
  if (isDbInitialized) return;
  try {
    const isConnected = await checkDbConnection();
    if (isConnected) {
      await runDatabaseInitAndSeed();
      isDbInitialized = true;
    }
  } catch {
    // DB offline
  }
}

// 1. Health & Infrastructure Status Endpoint
apiRouter.get('/health', async (req: Request, res: Response) => {
  await ensureDbInitialized();

  let dbStatus = 'disconnected';
  let dbMessage = 'No active PostgreSQL connection';
  let poolStats = null;

  try {
    const isConnected = await checkDbConnection();
    const pool = getDbPool();
    if (isConnected && pool) {
      const dbRes = await pool.query('SELECT NOW() as current_time, version()');
      dbStatus = 'connected';
      dbMessage = 'Cloud SQL PostgreSQL Operational';
      poolStats = {
        totalCount: pool.totalCount,
        idleCount: pool.idleCount,
        waitingCount: pool.waitingCount,
        serverTime: dbRes.rows[0].current_time,
      };
    }
  } catch (err: any) {
    dbStatus = 'offline';
    dbMessage = 'PostgreSQL Server Offline (Using In-Memory Fallback)';
  }

  const redisHealth = await getRedisHealth();
  const queuesHealth = await getQueuesHealth();
  const storageHealth = getStorageHealth();

  return res.json({
    success: true,
    data: {
      status: 'online',
      environment: process.env.NODE_ENV || 'development',
      timestamp: new Date().toISOString(),
      database: {
        engine: 'PostgreSQL (Cloud SQL)',
        status: dbStatus,
        message: dbMessage,
        poolStats,
      },
      cache: {
        engine: 'Redis',
        status: redisHealth.status,
        type: redisHealth.type,
        cachedKeys: redisHealth.cachedKeysCount,
      },
      queues: queuesHealth,
      storage: storageHealth,
    },
  });
});

// 2. Trigger Database Seed Endpoint
apiRouter.post('/db/seed', async (req: Request, res: Response) => {
  try {
    await runDatabaseInitAndSeed();
    await delCache('products_list_all');
    await delCache('regions_list_all');
    await delCache('warehouses_list_all');

    return res.json({
      success: true,
      message: 'PostgreSQL database seeded successfully and Redis cache invalidated.',
    });
  } catch (err: any) {
    return res.status(500).json({
      success: false,
      message: 'Failed to seed database: ' + err.message,
    });
  }
});

// In-memory fallback stores when DB is not reachable
export const inMemoryStore = {
  products: [
    {
      id: 'prod-10',
      title: 'Notebook Gamer Acer Nitro V15 15.6" Full HD 144Hz Intel Core i5 13ª Geração 16GB RAM SSD 512GB RTX 3050 Windows 11',
      price: 4599.00,
      currency: 'BRL',
      brand: 'Acer',
      categoryId: 'informatica-e-tablets',
      category: 'Informática e Tablets',
      image: 'https://images.unsplash.com/photo-1603302576837-37561b2e2302?auto=format&fit=crop&q=80&w=800',
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
      image: 'https://images.unsplash.com/photo-1584269600464-37b1b58a9fe7?auto=format&fit=crop&q=80&w=800',
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
      image: 'https://images.unsplash.com/photo-1523293182086-7651a899d37f?auto=format&fit=crop&q=80&w=800',
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
    {
      id: 'p_demo_1',
      title: 'Café Orgânico de São Tomé Premium 1kg',
      price: 12500,
      currency: 'XOF',
      brand: 'São Tomé Select',
      categoryId: 'alimentos',
      category: 'Alimentos',
      image: 'https://images.unsplash.com/photo-1559056199-641a0ac8b55e?auto=format&fit=crop&q=80&w=800',
      description: 'Grãos selecionados das plantações montanhosas de São Tomé e Príncipe.',
      stock: 120,
      freeShipping: false,
      full: true,
      countryCode: 'ST',
      createdAt: new Date().toISOString(),
    }
  ],
  regions: [],
  warehouses: [],
  users: [
    { id: 'u_001', email: 'admin@nusali.com', fullName: 'Super Administrador CPLP', role: 'admin', countryCode: 'GW', phone: '+245 955000000' },
    { id: 'u_002', email: 'vendedor@nusali.com', fullName: 'Loja Oficial Bissau', role: 'seller', countryCode: 'GW', phone: '+245 955111111' },
  ]
};

// 3. Products Endpoints (PostgreSQL + Redis Cache + In-Memory Fallback)
apiRouter.get('/products', async (req: Request, res: Response) => {
  await ensureDbInitialized();
  const cacheKey = 'products_list_all';

  // Check Redis Cache
  const cachedProducts = await getCache(cacheKey);
  if (cachedProducts) {
    return res.json({
      success: true,
      source: 'redis_cache',
      data: cachedProducts,
    });
  }

  try {
    const isConnected = await checkDbConnection();
    if (isConnected) {
      const db = getDb();
      if (db) {
        const productList = await db.select().from(products).orderBy(desc(products.createdAt));
        await setCache(cacheKey, productList, 60);

        return res.json({
          success: true,
          source: 'postgresql',
          data: productList,
        });
      }
    }
  } catch {
    // DB offline
  }

  return res.json({
    success: true,
    source: 'in_memory_fallback',
    data: inMemoryStore.products,
  });
});

apiRouter.get('/products/search', async (req: Request, res: Response) => {
  await ensureDbInitialized();
  const query = (req.query.q as string) || '';

  let allProductsList: any[] = inMemoryStore.products;

  try {
    const isConnected = await checkDbConnection();
    if (isConnected) {
      const db = getDb();
      if (db) {
        allProductsList = await db.select().from(products).orderBy(desc(products.createdAt));
      }
    }
  } catch {
    // DB fallback
  }

  const searchResult = searchProductsIntelligent(allProductsList, query);

  return res.json({
    success: true,
    query,
    total: searchResult.results.length,
    suggestedCorrection: searchResult.suggestedCorrection,
    synonymApplied: searchResult.synonymApplied,
    data: searchResult.results,
  });
});

apiRouter.get('/products/:id', async (req: Request, res: Response) => {
  const { id } = req.params;
  const found = inMemoryStore.products.find((p) => p.id === id);
  if (found) {
    return res.json({ success: true, data: found });
  }

  try {
    const isConnected = await checkDbConnection();
    if (isConnected) {
      const db = getDb();
      if (db) {
        const [dbProduct] = await db.select().from(products).where(eq(products.id, id));
        if (dbProduct) {
          return res.json({ success: true, data: dbProduct });
        }
      }
    }
  } catch {
    // DB fallback
  }

  return res.status(404).json({ success: false, message: 'Produto não encontrado' });
});

apiRouter.patch('/products/:id', async (req: Request, res: Response) => {
  const { id } = req.params;
  const idx = inMemoryStore.products.findIndex((p) => p.id === id);
  if (idx !== -1) {
    inMemoryStore.products[idx] = { ...inMemoryStore.products[idx], ...req.body };
    await delCache('products_list_all');
    return res.json({
      success: true,
      message: 'Produto atualizado com sucesso!',
      data: inMemoryStore.products[idx],
    });
  }

  return res.status(404).json({ success: false, message: 'Produto não encontrado' });
});

apiRouter.delete('/products/:id', async (req: Request, res: Response) => {
  const { id } = req.params;
  inMemoryStore.products = inMemoryStore.products.filter((p) => p.id !== id);
  await delCache('products_list_all');
  return res.json({
    success: true,
    message: 'Produto excluído com sucesso!',
  });
});

apiRouter.post('/products', async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.id;
    if (!userId) {
      return res.status(401).json({
        success: false,
        message: 'Usuário não autenticado.',
        error: { code: 'UNAUTHORIZED', message: 'Usuário não autenticado.' },
      });
    }

    const createdProduct = await ProductCreationService.createProduct(userId, req.body);
    return res.status(201).json({
      success: true,
      message: `Produto "${createdProduct.title}" cadastrado com sucesso!`,
      data: createdProduct,
    });
  } catch (err: any) {
    return res.status(400).json({
      success: false,
      message: err.message || 'Erro ao publicar produto.',
      error: { code: 'CREATE_PRODUCT_FAILED', message: err.message },
    });
  }
});

// 4. Regions Endpoints
apiRouter.get('/regions', async (req: Request, res: Response) => {
  await ensureDbInitialized();
  const cacheKey = 'regions_list_all';

  const cached = await getCache(cacheKey);
  if (cached) {
    return res.json({ success: true, source: 'redis_cache', data: cached });
  }

  try {
    const isConnected = await checkDbConnection();
    if (isConnected) {
      const db = getDb();
      if (db) {
        const regionList = await db.select().from(regions).orderBy(desc(regions.createdAt));
        await setCache(cacheKey, regionList, 300);
        return res.json({ success: true, source: 'postgresql', data: regionList });
      }
    }
  } catch {
    // DB offline
  }

  return res.json({ success: true, source: 'in_memory_fallback', data: inMemoryStore.regions });
});

apiRouter.post('/regions', async (req: Request, res: Response) => {
  await ensureDbInitialized();
  const { id, name, countryCode, supervisorName, supervisorEmail, deliveryCoverageDays, freightBaseRate } = req.body;

  const regId = id || `REG-${countryCode || 'GW'}-${Date.now().toString().slice(-4)}`;
  const newRegion = {
    id: regId,
    name,
    countryCode: countryCode || 'GW',
    supervisorName: supervisorName || 'A definir',
    supervisorEmail: supervisorEmail || 'supervisor@nusali.com',
    deliveryCoverageDays: deliveryCoverageDays || '24-48h',
    freightBaseRate: freightBaseRate || '1.500 XOF',
  };

  try {
    const isConnected = await checkDbConnection();
    if (isConnected) {
      const db = getDb();
      if (db) {
        await db.insert(regions).values(newRegion);
        await delCache('regions_list_all');
        return res.json({ success: true, message: 'Região gravada no PostgreSQL com sucesso!', data: newRegion });
      }
    }
  } catch {
    // fallback
  }

  inMemoryStore.regions.unshift(newRegion);
  return res.json({ success: true, message: 'Região cadastrada com sucesso!', data: newRegion });
});

// 5. Warehouses Endpoints
apiRouter.get('/warehouses', async (req: Request, res: Response) => {
  await ensureDbInitialized();
  const cacheKey = 'warehouses_list_all';

  const cached = await getCache(cacheKey);
  if (cached) {
    return res.json({ success: true, source: 'redis_cache', data: cached });
  }

  try {
    const isConnected = await checkDbConnection();
    if (isConnected) {
      const db = getDb();
      if (db) {
        const whList = await db.select().from(warehouses).orderBy(desc(warehouses.createdAt));
        await setCache(cacheKey, whList, 300);
        return res.json({ success: true, source: 'postgresql', data: whList });
      }
    }
  } catch {
    // DB offline
  }

  return res.json({ success: true, source: 'in_memory_fallback', data: inMemoryStore.warehouses });
});

apiRouter.post('/warehouses', async (req: Request, res: Response) => {
  await ensureDbInitialized();
  const { code, name, countryCode, city, address, managerName, staffCount } = req.body;

  const whId = `wh_${Date.now()}`;
  const newWh = {
    id: whId,
    code: code || `HUB-${city ? city.substring(0, 3).toUpperCase() : 'GW'}-0${Date.now().toString().slice(-2)}`,
    name,
    countryCode: countryCode || 'GW',
    city: city || 'Bissau',
    address: address || 'Endereço Principal HUB',
    managerName: managerName || 'Gerente Operacional',
    staffCount: Number(staffCount) || 10,
  };

  try {
    const isConnected = await checkDbConnection();
    if (isConnected) {
      const db = getDb();
      if (db) {
        await db.insert(warehouses).values(newWh);
        await delCache('warehouses_list_all');
        return res.json({ success: true, message: 'Armazém cadastrado no PostgreSQL!', data: newWh });
      }
    }
  } catch {
    // fallback
  }

  inMemoryStore.warehouses.unshift(newWh);
  return res.json({ success: true, message: 'Armazém cadastrado com sucesso!', data: newWh });
});

// 6. Users Endpoints
apiRouter.get('/users', async (req: Request, res: Response) => {
  await ensureDbInitialized();
  try {
    const isConnected = await checkDbConnection();
    if (isConnected) {
      const db = getDb();
      if (db) {
        const userList = await db.select().from(users).orderBy(desc(users.createdAt));
        return res.json({ success: true, source: 'postgresql', data: userList });
      }
    }
  } catch {
    // DB offline
  }

  return res.json({ success: true, source: 'in_memory_fallback', data: inMemoryStore.users });
});

apiRouter.post('/users', async (req: Request, res: Response) => {
  await ensureDbInitialized();
  const { email, fullName, role, countryCode, phone } = req.body;

  const id = `u_${Date.now()}`;
  const newUser = {
    id,
    email,
    fullName,
    role: role || 'buyer',
    countryCode: countryCode || 'GW',
    phone: phone || '',
  };

  try {
    const isConnected = await checkDbConnection();
    if (isConnected) {
      const db = getDb();
      if (db) {
        await db.insert(users).values(newUser);
        return res.json({ success: true, message: 'Usuário registrado no PostgreSQL!', data: newUser });
      }
    }
  } catch {
    // fallback
  }

  inMemoryStore.users.unshift(newUser);
  return res.json({ success: true, message: 'Usuário cadastrado com sucesso!', data: newUser });
});

// 7. Auth Endpoints
apiRouter.post('/auth/login', async (req: Request, res: Response) => {
  const { identifier, email, phone, role = 'BUYER', password } = req.body;
  const loginId = (identifier || email || phone || '').toLowerCase().trim();

  let resolvedRole = role.toUpperCase();
  if (loginId.includes('admin')) resolvedRole = 'ADMIN';
  if (loginId.includes('vendedor') || loginId.includes('seller')) resolvedRole = 'SELLER';

  let fullName = 'Usuário Mercado Nusali';
  if (loginId === 'djatadigital7@gmail.com') fullName = 'Djata Digital';
  else if (loginId === 'admin@nusali.com') fullName = 'Mamadu Djassi (Admin Geral)';
  else if (loginId === 'vendedor@nusali.com') fullName = 'Bissau Tech & Export Store';
  else if (loginId === 'logistica@nusali.com') fullName = 'Malam Bacai (HUB Logístico)';
  else if (loginId.includes('@')) fullName = loginId.split('@')[0].toUpperCase();

  const userObj = {
    id: `usr_${Math.floor(100000 + Math.random() * 900000)}`,
    name: fullName,
    email: loginId.includes('@') ? loginId : `${loginId}@nusali.cplp`,
    phone: loginId.includes('@') ? '+245 955 123 456' : loginId,
    role: resolvedRole,
    avatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150',
    country: 'GW',
    createdAt: new Date().toISOString(),
    isEmailVerified: true,
    isPhoneVerified: true,
    status: 'active',
    sellerId: resolvedRole === 'SELLER' ? 'seller_001' : undefined,
  };

  const token = `jwt_token_nusali_${Date.now()}`;
  const refreshToken = `refresh_token_nusali_${Date.now()}`;

  return res.json({
    success: true,
    message: 'Autenticado com sucesso no Mercado Nusali',
    data: {
      token,
      refreshToken,
      user: userObj,
    },
  });
});

apiRouter.post('/auth/register', async (req: Request, res: Response) => {
  const { email, firstName, lastName, phone, role = 'BUYER' } = req.body;
  const fullName = `${firstName || 'Usuário'} ${lastName || 'Nusali'}`.trim();
  const resolvedRole = role.toUpperCase();

  const userObj = {
    id: `usr_${Math.floor(100000 + Math.random() * 900000)}`,
    name: fullName,
    email: email || `user_${Date.now()}@nusali.cplp`,
    phone: phone || '+245 955 000 000',
    role: resolvedRole,
    avatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150',
    country: 'GW',
    createdAt: new Date().toISOString(),
    isEmailVerified: true,
    isPhoneVerified: true,
    status: 'active',
    sellerId: resolvedRole === 'SELLER' ? 'seller_001' : undefined,
  };

  return res.json({
    success: true,
    message: 'Conta criada com sucesso no Mercado Nusali!',
    data: {
      token: `jwt_token_nusali_${Date.now()}`,
      refreshToken: `refresh_token_nusali_${Date.now()}`,
      user: userObj,
    },
  });
});

apiRouter.get('/auth/me', async (req: Request, res: Response) => {
  return res.json({
    success: true,
    data: {
      id: 'usr_buyer_001',
      name: 'Djata Digital',
      email: 'djatadigital7@gmail.com',
      phone: '+245 955 123 456',
      role: 'BUYER',
      avatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150',
      country: 'GW',
      isEmailVerified: true,
      isPhoneVerified: true,
      status: 'active',
    },
  });
});

apiRouter.post('/auth/logout', async (req: Request, res: Response) => {
  return res.json({ success: true, message: 'Sessão encerrada com sucesso.' });
});

