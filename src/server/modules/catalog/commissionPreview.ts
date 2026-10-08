/**
 * FASE 7 — comissão aplicável às vendas FUTURAS de um produto numa categoria (só leitura; nunca grava e nunca recalcula pedidos).
 *
 * Mesma cadeia que orderService usa ao criar um pedido: comissão da categoria -> comissão do vendedor -> padrão da plataforma
 * (platform_settings.defaultSellerCommissionPercent). Pedidos já realizados guardam a comissão calculada na época e não são tocados.
 */
import { eq } from 'drizzle-orm';
import { categories, platformSettings, sellers } from '../../../db/schema.js';

export type CommissionSource = 'category' | 'seller' | 'platform_default' | 'none';
export interface CommissionInfo { rate: number | null; source: CommissionSource }
export interface CommissionChange { from: CommissionInfo; to: CommissionInfo; changed: boolean }

const asRate = (v: unknown): number | null => {
  if (v === null || v === undefined || String(v).trim() === '') return null;
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? n : null;
};

export async function resolveCommission(db: any, categoryId: string | null | undefined, sellerId: string | null | undefined): Promise<CommissionInfo> {
  if (categoryId) {
    const [c] = await db.select({ r: categories.commissionRate }).from(categories).where(eq(categories.id, categoryId)).limit(1);
    const r = asRate(c?.r);
    if (r !== null) return { rate: r, source: 'category' };
  }
  if (sellerId) {
    const [s] = await db.select({ r: sellers.commissionRate }).from(sellers).where(eq(sellers.id, sellerId)).limit(1);
    const r = asRate(s?.r);
    if (r !== null) return { rate: r, source: 'seller' };
  }
  const [d] = await db.select().from(platformSettings).where(eq(platformSettings.key, 'defaultSellerCommissionPercent')).limit(1);
  const r = asRate(d?.valueJson);
  return r !== null ? { rate: r, source: 'platform_default' } : { rate: null, source: 'none' };
}

export async function compareCommission(db: any, fromCategoryId: string | null, toCategoryId: string, sellerId: string | null): Promise<CommissionChange> {
  const [from, to] = [await resolveCommission(db, fromCategoryId, sellerId), await resolveCommission(db, toCategoryId, sellerId)];
  return { from, to, changed: from.rate !== to.rate };
}
