import { Router, Request, Response } from 'express';
import { getDb } from '../../../db/index.js';
import { stores, sellers, sellerProfiles, categories } from '../../../db/schema.js';
import { eq, and, or } from 'drizzle-orm';

/**
 * Público de lojas — montado em /api/v1/stores.
 *
 * Fase "Lojas oficiais reais": antes desta fase, /stores (StoresListPage.tsx)
 * e /stores/:id (StorePublicView.tsx) eram 100% mock hardcoded no frontend —
 * este endpoint nunca existia. Fonte de verdade agora é a tabela `stores`
 * com join real em `sellers`/`sellerProfiles`/`categories`.
 *
 * Regra mínima de elegibilidade pública (sem inventar status inexistente):
 * - stores.status = 'active'
 * - sellers.status = 'active' (só fica assim depois de KYC aprovado —
 *   ver canSellerOperate()/PATCH kyc/:id/approve em adminRoutes.ts)
 * "Verificado" usa o campo real sellerProfiles.verifiedAt (setado na
 * aprovação do KYC) — nunca um booleano inventado.
 *
 * rating/followersCount da própria tabela `stores` NUNCA são atualizados por
 * nenhum código do sistema (permanecem no default estático da coluna) —
 * por isso este endpoint não os retorna. Métricas de vendas reais ficam
 * fora do escopo desta fase (ver instrução "não corrigir métricas de venda").
 */
export const storesPublicRouter = Router();

function eligibleStoreConditions() {
  return and(eq(stores.status, 'active'), eq(sellers.status, 'active'));
}

function mapStoreRow(row: { store: typeof stores.$inferSelect; seller: typeof sellers.$inferSelect; verifiedAt: Date | null; categoryName: string | null }) {
  const { store, seller, verifiedAt, categoryName } = row;
  return {
    id: store.id,
    slug: store.slug,
    name: store.name,
    description: store.description || '',
    logoUrl: store.logoUrl || null,
    bannerUrl: store.bannerUrl || null,
    countryCode: store.countryCode,
    categoryId: store.categoryId || null,
    categoryName: categoryName || null,
    sellerId: seller.id,
    isVerified: Boolean(verifiedAt),
    createdAt: store.createdAt,
  };
}

// GET /api/v1/stores
storesPublicRouter.get('/', async (req: Request, res: Response) => {
  try {
    const db = getDb();
    if (!db) {
      return res.status(503).json({
        success: false,
        error: { code: 'DATABASE_UNAVAILABLE', message: 'Não foi possível carregar as lojas no momento. Tente novamente em instantes.' },
      });
    }

    const { countryCode } = req.query as Record<string, string>;
    const conditions = [eligibleStoreConditions()];
    if (countryCode && countryCode.trim()) {
      conditions.push(eq(stores.countryCode, countryCode.trim().toUpperCase()));
    }

    const rows = await db
      .select({ store: stores, seller: sellers, verifiedAt: sellerProfiles.verifiedAt, categoryName: categories.name })
      .from(stores)
      .innerJoin(sellers, eq(stores.sellerId, sellers.id))
      .leftJoin(sellerProfiles, eq(sellerProfiles.sellerId, sellers.id))
      .leftJoin(categories, eq(categories.id, stores.categoryId))
      .where(and(...conditions))
      .orderBy(stores.name);

    return res.json({ success: true, data: rows.map(mapStoreRow) });
  } catch (error: any) {
    return res.status(500).json({
      success: false,
      error: { code: 'STORES_FETCH_FAILED', message: error?.message || 'Erro ao carregar lojas.' },
    });
  }
});

// GET /api/v1/stores/:idOrSlug
storesPublicRouter.get('/:idOrSlug', async (req: Request, res: Response) => {
  try {
    const db = getDb();
    if (!db) {
      return res.status(503).json({
        success: false,
        error: { code: 'DATABASE_UNAVAILABLE', message: 'Não foi possível carregar a loja no momento.' },
      });
    }

    const idOrSlug = String(req.params.idOrSlug || '').trim();
    if (!idOrSlug) {
      return res.status(404).json({ success: false, error: { code: 'STORE_NOT_FOUND', message: 'Loja não encontrada.' } });
    }

    const rows = await db
      .select({ store: stores, seller: sellers, verifiedAt: sellerProfiles.verifiedAt, categoryName: categories.name })
      .from(stores)
      .innerJoin(sellers, eq(stores.sellerId, sellers.id))
      .leftJoin(sellerProfiles, eq(sellerProfiles.sellerId, sellers.id))
      .leftJoin(categories, eq(categories.id, stores.categoryId))
      .where(and(or(eq(stores.id, idOrSlug), eq(stores.slug, idOrSlug)), eligibleStoreConditions()))
      .limit(1);

    if (rows.length === 0) {
      // Mesma resposta tanto para ID inexistente quanto para loja real mas
      // não elegível (inativa/seller suspenso) — nunca revela a existência
      // de uma loja fora do escopo público, e nunca cai num fallback fictício.
      return res.status(404).json({ success: false, error: { code: 'STORE_NOT_FOUND', message: 'Loja não encontrada.' } });
    }

    return res.json({ success: true, data: mapStoreRow(rows[0]) });
  } catch (error: any) {
    return res.status(500).json({
      success: false,
      error: { code: 'STORE_FETCH_FAILED', message: error?.message || 'Erro ao carregar loja.' },
    });
  }
});
