import { Router, Request, Response } from 'express';
import { CatalogService } from './catalogService.js';
import { requireAuth, requireRole, AuthRequest } from '../auth/authMiddleware.js';
import { getDb } from '../../../db/index.js';
import { products, productVariants, productImages } from '../../../db/schema.js';
import { eq } from 'drizzle-orm';
import { z } from 'zod';

export const catalogRouter = Router();

// GET /api/v1/products
catalogRouter.get('/products', async (req: Request, res: Response) => {
  try {
    const {
      q,
      category,
      country,
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
      country: country as string,
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
    const product = await CatalogService.getProductById(req.params.id);
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

const createProductSchema = z.object({
  title: z.string().min(3, 'Título obrigatório'),
  price: z.number().positive('Preço deve ser positivo'),
  currency: z.string().default('XOF'),
  description: z.string().optional(),
  categoryId: z.string().optional(),
  brand: z.string().optional(),
  stock: z.number().int().nonnegative().default(10),
  image: z.string().url('URL de imagem inválida'),
  countryCode: z.string().default('GW'),
  freeShipping: z.boolean().optional().default(false),
  full: z.boolean().optional().default(false),
});

// POST /api/v1/products (Seller or Admin only)
catalogRouter.post('/products', requireAuth, requireRole('SELLER', 'ADMIN'), async (req: AuthRequest, res: Response) => {
  try {
    const validated = createProductSchema.parse(req.body);
    const db = getDb();
    if (!db) {
      return res.status(503).json({
        success: false,
        error: { code: 'DB_UNAVAILABLE', message: 'Banco de dados não disponível.' },
      });
    }

    const productId = `prod_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    const newProduct = {
      id: productId,
      title: validated.title,
      price: String(validated.price),
      currency: validated.currency,
      description: validated.description || '',
      categoryId: validated.categoryId || 'celulares-e-telefonia',
      brand: validated.brand || 'Oficial',
      sellerId: req.user!.id,
      stock: validated.stock,
      image: validated.image,
      countryCode: validated.countryCode.toUpperCase(),
      freeShipping: validated.freeShipping,
      full: validated.full,
      rating: '5.00',
      reviewsCount: 0,
      status: 'active',
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    await db.insert(products).values(newProduct);
    await CatalogService.invalidateProductCache();

    return res.status(201).json({
      success: true,
      data: newProduct,
    });
  } catch (err: any) {
    if (err instanceof z.ZodError) {
      const issue = (err as any).issues?.[0] || (err as any).errors?.[0];
      return res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: issue?.message || 'Dados inválidos' },
      });
    }
    return res.status(500).json({
      success: false,
      error: { code: 'SERVER_ERROR', message: err.message },
    });
  }
});
