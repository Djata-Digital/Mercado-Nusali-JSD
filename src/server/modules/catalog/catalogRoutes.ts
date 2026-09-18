import { Router, Request, Response } from 'express';
import { CatalogService } from './catalogService.js';
import { requireAuth, requireRole, AuthRequest, getOptionalAuthUser } from '../auth/authMiddleware.js';
import { isGlobalCatalogAdmin } from '../auth/scopeService.js';
import { getDb } from '../../../db/index.js';
import { products, categories, productVariants, productImages, categoryAttributes, productAttributes, productQuestions, productAnswers, users } from '../../../db/schema.js';
import { eq, or, inArray, asc, desc, and } from 'drizzle-orm';
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
export function resolveDestinationCountryFromRequest(req: Request, explicit?: string): string | undefined {
  if (explicit && explicit !== 'ALL') return explicit;
  const header = req.headers['x-country-code'];
  const headerVal = Array.isArray(header) ? header[0] : header;
  return headerVal || undefined;
}

// Correção crítica (rota duplicada de produtos): estes dois handlers eram
// registrados aqui como catalogRouter.get('/products'|'/products/:id', ...),
// mas catalogRouter é montado sob o prefixo /catalog (ver api.ts) — então o
// caminho real que eles atendiam era /api/v1/catalog/products[...], nunca
// /api/v1/products[...], que é o que o frontend realmente chama
// (ProductsApi.ts). O frontend sempre caiu num handler legado e cru,
// definido direto em api.ts (sem CatalogService, sem estoque
// disponível/vendidos), tornando esta implementação correta inatingível.
//
// Correção: os handlers continuam definidos AQUI (única fonte, usando
// CatalogService — nunca duplicar a lógica), mas exportados como funções
// nomeadas para serem registrados diretamente em apiRouter (api.ts), na
// raiz de /api/v1, sem o prefixo /catalog. Não ficam mais registrados em
// catalogRouter — um recurso público, um único caminho reachable.
export async function getProductsHandler(req: Request, res: Response) {
  try {
    const {
      q,
      category,
      country,
      originCountryFilter,
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

    // FASE D16-G1.6 — visão administrativa por origem para GLOBAL_ADMIN
    // navegando pelo catálogo público (Home/Search/Category/Header/
    // Favorites/AIAssistant/StorePublicView — todas passam por este mesmo
    // handler). Identidade vem EXCLUSIVAMENTE do JWT verificado
    // (getOptionalAuthUser nunca lê query/body/header customizado — só o
    // Authorization Bearer padrão que o apiClient já envia quando o usuário
    // está logado) — nunca de um parâmetro como ?adminMode=true. Buyer,
    // seller e guest continuam exatamente com o comportamento anterior:
    // isGlobalCatalogAdmin(undefined) e isGlobalCatalogAdmin({role:'BUYER'|
    // 'SELLER'}) são sempre false. Quando true, a elegibilidade de destino é
    // pulada por completo (mesma técnica já usada em GET /admin/products —
    // CatalogService.getProducts trata `country` ausente como "sem filtro
    // de destino"), e originCountryFilter passa a ser a ÚNICA restrição —
    // exatamente a "visão administrativa por origem" pedida. Isto NUNCA
    // altera elegibilidade de COMPRA: GET /products/:id e o checkout
    // (F6.2/orderService) continuam calculando availableForCountry/
    // elegibilidade real do jeito que sempre calcularam, intocados.
    const isAdminCatalogView = isGlobalCatalogAdmin(getOptionalAuthUser(req));

    const result = await CatalogService.getProducts({
      q: q as string,
      category: category as string,
      country: isAdminCatalogView ? undefined : resolveDestinationCountryFromRequest(req, country as string),
      // FASE D16-G1 — filtro de origem é INDEPENDENTE do destino: nunca lido
      // do header X-Country-Code (que representa exclusivamente o destino do
      // comprador — ver resolveDestinationCountryFromRequest acima), sempre
      // e somente explícito via querystring.
      originCountryFilter: originCountryFilter as string,
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
}

export async function getProductByIdHandler(req: Request, res: Response) {
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
}

// FASE D17-B1 — GET /api/v1/products/:id/recommendations
//
// Motor determinístico (sem IA/ML, sem randomização): reaproveita
// EXCLUSIVAMENTE CatalogService.getProducts() — nunca uma segunda
// implementação das regras de elegibilidade/publicação/origem. Mesmo padrão
// de resolução de destino/origem/GLOBAL_ADMIN de getProductsHandler acima
// (nunca confia em nada "administrativo" vindo do cliente — isGlobalCatalogAdmin
// deriva só do JWT verificado).
//
// Estratégia (D17-A confirmou que categoria/loja são os únicos sinais reais
// e imediatamente utilizáveis nesta fase — rating/reviewsCount/brandId/
// sales_desc explicitamente adiados):
//   relatedProducts   = mesma categoria do produto base (excluindo-o).
//   sameStoreProducts = mesma loja do produto base (excluindo-o), []
//                       se o produto não tiver storeId.
//   youMayAlsoLike    = "sobra" determinística do MESMO pool de categoria
//                       (buscado com uma folga de FETCH_LIMIT, nunca uma
//                       terceira query/algoritmo novo), depois de remover o
//                       que já foi usado em relatedProducts/sameStoreProducts.
//                       SEM fallback para "outros produtos elegíveis do
//                       catálogo" (PASSO 6 do ticket pediu explicitamente
//                       para NÃO inventar esse preenchimento nesta fase) —
//                       se a categoria não tiver sobra, a seção volta menor
//                       ou vazia, nunca inventa candidato.
// Deduplicação sempre nesta ordem de posse: relatedProducts ->
// sameStoreProducts -> youMayAlsoLike (um produto nunca aparece 2x).
export async function getProductRecommendationsHandler(req: Request, res: Response) {
  try {
    const { id } = req.params;

    const baseProduct = await CatalogService.getProductBaseInfo(id);
    if (!baseProduct) {
      return res.status(404).json({
        success: false,
        error: { code: 'PRODUCT_NOT_FOUND', message: 'Produto não encontrado.' },
      });
    }

    // Mesma técnica de resolução de destino/origem/admin de getProductsHandler
    // acima — nunca uma segunda regra. isGlobalCatalogAdmin deriva SOMENTE do
    // JWT já verificado (getOptionalAuthUser nunca lê query/body/header
    // customizado), nunca de um parâmetro do cliente.
    const isAdminCatalogView = isGlobalCatalogAdmin(getOptionalAuthUser(req));
    const explicitDestination = typeof req.query.destinationCountry === 'string' ? req.query.destinationCountry : undefined;
    const destinationCountry = isAdminCatalogView ? undefined : resolveDestinationCountryFromRequest(req, explicitDestination);
    const originCountryFilter = typeof req.query.originCountryFilter === 'string' ? req.query.originCountryFilter : undefined;

    const SECTION_LIMIT = 12;
    // Pequena folga: cobre a deduplicação entre seções sem precisar de uma
    // terceira consulta separada para youMayAlsoLike.
    const FETCH_LIMIT = 18;

    const [relatedResult, sameStoreResult] = await Promise.all([
      baseProduct.categoryId
        ? CatalogService.getProducts({
            category: baseProduct.categoryId,
            country: destinationCountry,
            originCountryFilter,
            excludeProductId: id,
            limit: FETCH_LIMIT,
          })
        : Promise.resolve({ products: [] as any[], pagination: { total: 0, page: 1, limit: FETCH_LIMIT, totalPages: 0 } }),
      baseProduct.storeId
        ? CatalogService.getProducts({
            storeId: baseProduct.storeId,
            country: destinationCountry,
            originCountryFilter,
            excludeProductId: id,
            limit: FETCH_LIMIT,
          })
        : Promise.resolve({ products: [] as any[], pagination: { total: 0, page: 1, limit: FETCH_LIMIT, totalPages: 0 } }),
    ]);

    const relatedProducts = relatedResult.products.slice(0, SECTION_LIMIT);
    const relatedIds = new Set(relatedProducts.map((p: any) => p.id));

    const sameStoreProducts = sameStoreResult.products
      .filter((p: any) => !relatedIds.has(p.id))
      .slice(0, SECTION_LIMIT);
    const sameStoreIds = new Set(sameStoreProducts.map((p: any) => p.id));

    const youMayAlsoLike = relatedResult.products
      .filter((p: any) => !relatedIds.has(p.id) && !sameStoreIds.has(p.id))
      .slice(0, SECTION_LIMIT);

    return res.json({
      success: true,
      data: {
        productId: id,
        relatedProducts,
        sameStoreProducts,
        youMayAlsoLike,
      },
    });
  } catch (err: any) {
    return res.status(500).json({
      success: false,
      error: { code: 'SERVER_ERROR', message: err.message },
    });
  }
}

// FASE D17-C4 — limite de tamanho de pergunta. Mesmo padrão já usado para
// texto livre de comprador (DISPUTE_MESSAGE_MAX_LENGTH em
// disputeMessageService.ts: constante nomeada + validação trim().length),
// mas com um valor próprio: uma pergunta de produto é naturalmente curta
// ("Tem tamanho GG?"), nunca uma narrativa de disputa — reaproveitar o MESMO
// número (4000) seria desproporcional ao conteúdo real.
export const PRODUCT_QUESTION_MAX_LENGTH = 1000;

// GET /api/v1/products/:id/questions — público, sem autenticação.
//
// FASE D17-C4 — substitui o falso fluxo do frontend (fetch a
// /api/gemini/seller-answer, que nunca existiu no backend). Retorna
// perguntas publicáveis e as respostas reais de product_answers agrupadas
// por pergunta (nunca N+1: 1 query de perguntas + 1 query de respostas por
// lote, agrupamento em memória). Campos públicos mínimos: NUNCA
// email/telefone/JWT/sellerId interno.
//
// Status publicáveis = 'published' (recém-criada, ainda sem resposta) E
// 'answered' (POST /seller/questions/:id/answer, já corrigido em D17-C1.1,
// atualiza para este valor) — as DUAS são etapas normais do mesmo ciclo de
// vida de uma pergunta real, nunca um estado de moderação/rejeição. Filtrar
// só por 'published' esconderia TODA pergunta já respondida, o que
// quebraria exatamente o fluxo que este ticket pediu para fechar (PASSO 16:
// buyer pergunta -> seller responde -> GET público mostra a resposta).
// Nenhuma moderação nova criada aqui — só os dois valores que o schema já
// escreve de verdade hoje.
export async function getProductQuestionsHandler(req: Request, res: Response) {
  try {
    const db = getDb();
    if (!db) return res.status(503).json({ success: false, error: { code: 'SERVER_ERROR', message: 'Banco de dados indisponível.' } });

    const { id } = req.params;
    const [product] = await db.select({ id: products.id }).from(products).where(eq(products.id, id)).limit(1);
    if (!product) {
      return res.status(404).json({ success: false, error: { code: 'PRODUCT_NOT_FOUND', message: 'Produto não encontrado.' } });
    }

    const questionRows = await db
      .select({
        id: productQuestions.id,
        question: productQuestions.question,
        createdAt: productQuestions.createdAt,
        authorName: users.fullName,
      })
      .from(productQuestions)
      .leftJoin(users, eq(productQuestions.userId, users.id))
      .where(and(eq(productQuestions.productId, id), inArray(productQuestions.status, ['published', 'answered'])))
      .orderBy(desc(productQuestions.createdAt));

    const questionIds = questionRows.map((q) => q.id);
    const answerRows = questionIds.length > 0
      ? await db
          .select({
            id: productAnswers.id,
            questionId: productAnswers.questionId,
            answer: productAnswers.answer,
            isSeller: productAnswers.isSeller,
            createdAt: productAnswers.createdAt,
          })
          .from(productAnswers)
          .where(inArray(productAnswers.questionId, questionIds))
          .orderBy(asc(productAnswers.createdAt))
      : [];

    const answersByQuestion = new Map<string, any[]>();
    for (const a of answerRows) {
      const list = answersByQuestion.get(a.questionId) || [];
      list.push({ id: a.id, answer: a.answer, isSeller: a.isSeller, createdAt: a.createdAt });
      answersByQuestion.set(a.questionId, list);
    }

    const data = questionRows.map((q) => ({
      id: q.id,
      question: q.question,
      createdAt: q.createdAt,
      authorName: q.authorName || 'Comprador Nusali',
      answers: answersByQuestion.get(q.id) || [],
    }));

    return res.json({ success: true, data });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: { code: 'SERVER_ERROR', message: err.message } });
  }
}

// POST /api/v1/products/:id/questions — autenticado (requireAuth aplicado
// no registro da rota, api.ts).
//
// FASE D17-C4 — productId vem EXCLUSIVAMENTE de req.params.id (nunca do
// body); userId vem EXCLUSIVAMENTE de req.user.id (JWT verificado, nunca do
// body). Qualquer comprador autenticado pode perguntar — NÃO exige compra
// comprovada (pergunta não é review, ver D17-C2 para a exigência real de
// compra entregue, que é exclusiva de reviews).
export async function createProductQuestionHandler(req: AuthRequest, res: Response) {
  try {
    const db = getDb();
    if (!db || !req.user?.id) return res.status(401).json({ success: false, message: 'Não autorizado.' });

    const { id } = req.params;
    const [product] = await db.select({ id: products.id }).from(products).where(eq(products.id, id)).limit(1);
    if (!product) {
      return res.status(404).json({ success: false, error: { code: 'PRODUCT_NOT_FOUND', message: 'Produto não encontrado.' } });
    }

    const trimmedQuestion = typeof req.body?.question === 'string' ? req.body.question.trim() : '';
    if (!trimmedQuestion) {
      return res.status(400).json({ success: false, error: { code: 'QUESTION_REQUIRED', message: 'A pergunta é obrigatória.' } });
    }
    if (trimmedQuestion.length > PRODUCT_QUESTION_MAX_LENGTH) {
      return res.status(400).json({ success: false, error: { code: 'QUESTION_TOO_LONG', message: `A pergunta excede o limite de ${PRODUCT_QUESTION_MAX_LENGTH} caracteres.` } });
    }

    const newQuestion = {
      id: `q_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`,
      productId: id,
      userId: req.user.id,
      question: trimmedQuestion,
      // FASE D17-C4 — sem moderação implementada (nenhuma criada aqui):
      // usa o mesmo estado publicável já previsto pelo default do schema
      // ('published'), nunca uma aprovação manual inventada.
      status: 'published',
      createdAt: new Date(),
    };

    await db.insert(productQuestions).values(newQuestion);

    return res.status(201).json({
      success: true,
      message: 'Pergunta enviada com sucesso!',
      data: {
        id: newQuestion.id,
        question: newQuestion.question,
        createdAt: newQuestion.createdAt,
        authorName: req.user.fullName || 'Comprador Nusali',
        answers: [] as any[],
      },
    });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: { code: 'SERVER_ERROR', message: err.message } });
  }
}

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
