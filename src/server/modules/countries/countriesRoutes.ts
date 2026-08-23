import { Router, Request, Response } from 'express';
import { getDb } from '../../../db/index.js';
import { countries } from '../../../db/schema.js';
import { eq } from 'drizzle-orm';

/**
 * Public countries router — mounted at /api/v1/countries.
 *
 * Source of truth: the `countries` table in PostgreSQL. Returns ONLY countries the
 * Mercado Nusali currently operates in (isActive = true), and only the public-safe
 * fields needed by the registration screen / country selectors. No admin-only
 * configuration (commission, tax, customs, etc.) is exposed here.
 */
export const countriesPublicRouter = Router();

countriesPublicRouter.get('/', async (_req: Request, res: Response) => {
  try {
    const db = getDb();
    if (!db) {
      return res.status(503).json({
        success: false,
        error: { code: 'DATABASE_UNAVAILABLE', message: 'Não foi possível carregar os países no momento. Tente novamente em instantes.' },
      });
    }

    const rows = await db
      .select({
        code: countries.code,
        name: countries.name,
        flag: countries.flag,
        currency: countries.currency,
        currencySymbol: countries.currencySymbol,
        phonePrefix: countries.phonePrefix,
      })
      .from(countries)
      .where(eq(countries.isActive, true))
      .orderBy(countries.name);

    return res.json({ success: true, data: rows });
  } catch (error: any) {
    return res.status(500).json({
      success: false,
      error: { code: 'COUNTRIES_FETCH_FAILED', message: error?.message || 'Erro ao carregar países.' },
    });
  }
});

countriesPublicRouter.get('/:code', async (req: Request, res: Response) => {
  try {
    const db = getDb();
    if (!db) {
      return res.status(503).json({
        success: false,
        error: { code: 'DATABASE_UNAVAILABLE', message: 'Não foi possível carregar o país no momento.' },
      });
    }

    const code = String(req.params.code || '').trim().toUpperCase();
    const rows = await db
      .select({
        code: countries.code,
        name: countries.name,
        flag: countries.flag,
        currency: countries.currency,
        currencySymbol: countries.currencySymbol,
        phonePrefix: countries.phonePrefix,
        isActive: countries.isActive,
      })
      .from(countries)
      .where(eq(countries.code, code))
      .limit(1);

    if (rows.length === 0 || rows[0].isActive !== true) {
      return res.status(404).json({
        success: false,
        error: { code: 'COUNTRY_NOT_AVAILABLE', message: 'País não encontrado ou não disponível no Mercado Nusali.' },
      });
    }

    const { isActive, ...publicFields } = rows[0];
    return res.json({ success: true, data: publicFields });
  } catch (error: any) {
    return res.status(500).json({
      success: false,
      error: { code: 'COUNTRY_FETCH_FAILED', message: error?.message || 'Erro ao carregar país.' },
    });
  }
});
