import { Router, Request, Response } from 'express';
import { CatalogService } from './catalogService.js';
import { requireAuth, requireRole, AuthRequest } from '../auth/authMiddleware.js';
import { getDb } from '../../../db/index.js';
import { products, categories, productVariants, productImages, categoryAttributes, productAttributes } from '../../../db/schema.js';
import { eq, or, inArray, asc } from 'drizzle-orm';
import { z } from 'zod';

import { buildCategoryTree } from '../../../utils/categoryUtils.js';
import { ProductCreationService, getCategoryAttributesWithInheritance } from './productCreationService.js';

export const catalogRouter = Router();

// Melhoria pré-piloto (elegibilidade por país): toda requisição do apiClient
// já envia o header X-Country-Code com o país realmente selecionado pelo
// comprador (ver PreferencesContext.tsx). Usar isso como fallback de destino
// quando a tela não passa "country"/"destinationCountry" explicitamente
// cobre TODAS as rotas públicas (Home, busca, categoria, loja, relacionados)
// sem precisar alterar cada uma individualmente — backend continua
// autoridade mesmo que uma tela específica ainda não passe o filtro à mão.
function resolveDestinationCountryFromRequest(req: Request, explicit?: string): string | undefined {
  if (explicit && explicit !== 'ALL') return explicit;
  const header = req.headers['x-country-code'];
  const headerVal = Array.isArray(header) ? header[0] : header;
  return headerVal || undefined;
}

// GET /api/v1/products
catalogRouter.get('/products', async (req: Request, res: Response) => {
  try {
    const {
      q,
      category,
      country,
      storeId,
      brand,
      minPrice,
      maxPrice,
      freeShipping,
      full,
      sort,
      page,
      limit,
    } = req.query;

    const result = await CatalogService.getProducts({
      q: q as string,
      category: category as string,
      country: resolveDestinationCountryFromRequest(req, country as string),
      storeId: storeId as string,
      brand: brand as string,
      minPrice: minPrice ? Number(minPrice) : undefined,
      maxPrice: maxPrice ? Number(maxPrice) : undefined,
      freeShipping: freeShipping === 'true',
      full: full === 'true',
      sort: sort as any,
      page: page ? Number(page) : 1,
      limit: limit ? Number(limit) : 24,
    });

    return res.json({
      success: true,
      data: result.products,
      pagination: result.pagination,
    });
  } catch (err: any) {
    return res.status(500).json({
      success: false,
      error: { code: 'CATALOG_ERROR', message: err.message },
    });
  }
});

// GET /api/v1/products/:id
catalogRouter.get('/products/:id', async (req: Request, res: Response) => {
  try {
    const explicitDestination = typeof req.query.destinationCountry === 'string' ? req.query.destinationCountry : undefined;
    const destinationCountry = resolveDestinationCountryFromRequest(req, explicitDestination);
    const product = await CatalogService.getProductById(req.params.id, destinationCountry);
    if (!product) {
      return res.status(404).json({
        success: false,
        error: { code: 'PRODUCT_NOT_FOUND', message: 'Produto não encontrado.' },
      });
    }

    return res.json({
      success: true,
      data: product,
    });
  } catch (err: any) {
    return res.status(500).json({
      success: false,
      error: { code: 'SERVER_ERROR', message: err.message },
    });
  }
});

// GET /api/v1/categories
catalogRouter.get('/categories', async (req: Request, res: Response) => {
  try {
    const cats = await CatalogService.getCategories();
    return res.json({
      success: true,
      data: cats,
    });
  } catch (err: any) {
    return res.status(500).json({
      success: false,
      error: { code: 'SERVER_ERROR', message: err.message },
    });
  }
});

// GET /api/v1/categories/tree
catalogRouter.get('/categories/tree', async (req: Request, res: Response) => {
  try {
    const cats = await CatalogService.getCategories();
    const tree = buildCategoryTree(cats);
    return res.json({
      success: true,
      data: tree,
    });
  } catch (err: any) {
    return res.status(500).json({
      success: false,
      error: { code: 'SERVER_ERROR', message: err.message },
    });
  }
});

// GET /api/v1/categories/:id/children
catalogRouter.get('/categories/:id/children', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const cats = await CatalogService.getCategories();
    const children = cats.filter((c: any) => c.parentId === id);
    return res.json({
      success: true,
      data: children,
    });
  } catch (err: any) {
    return res.status(500).json({
      success: false,
      error: { code: 'SERVER_ERROR', message: err.message },
    });
  }
});

// GET /api/v1/categories/:id/attributes (With Parent Category Inheritance)
catalogRouter.get('/categories/:id/attributes', async (req: Request, res: Response) => {
  try {
    const db = getDb();
    if (!db) throw new Error('Database unavailable');
    const { id } = req.params;
    const result = await getCategoryAttributesWithInheritance(db, id);
    return res.json({
      success: true,
      data: result,
    });
  } catch (err: any) {
    return res.status(500).json({
      success: false,
      error: { code: 'SERVER_ERROR', message: err.message },
    });
  }
});

// POST /api/v1/products (Seller or Admin only)
catalogRouter.post('/products', requireAuth, requireRole('SELLER', 'ADMIN'), async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user?.id) {
      return res.status(401).json({
        success: false,
        message: 'Usuário não autenticado.',
        error: { code: 'UNAUTHORIZED', message: 'Usuário não autenticado.' },
      });
    }

    const createdProduct = await ProductCreationService.createProduct(req.user.id, req.body);
    return res.status(201).json({
      success: true,
      message: `Produto "${createdProduct.title}" publicado com sucesso!`,
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
