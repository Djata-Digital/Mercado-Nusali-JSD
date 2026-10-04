import { Router, Request, Response, NextFunction } from 'express';
import multer from 'multer';
import { randomUUID } from 'node:crypto';
import { AuthRequest } from '../auth/authMiddleware.js';
import { logger } from '../../infra/logger.js';
import { storageService } from '../../infra/storage.js';
import {
  BANNER_UPLOAD_HARD_LIMIT_BYTES,
  BANNER_IMAGE_POLICY,
  BannerImageError,
  buildBannerObjectKey,
  validateBannerImage,
  type BannerImageKind,
} from './bannerImage.js';
import {
  BannerHttpError,
  auditBannerImageUpload,
  createBanner,
  duplicateBanner,
  getAdminBanner,
  listActivePublicBanners,
  listAdminBanners,
  reorderBanners,
  setBannerStatus,
  softDeleteBanner,
  updateBanner,
  type BannerActor,
} from './bannersService.js';

function sendError(res: Response, error: unknown, context: string) {
  if (error instanceof BannerHttpError) {
    return res.status(error.status).json({
      success: false,
      error: { code: error.code, message: error.message, ...(error.fields ? { fields: error.fields } : {}) },
    });
  }
  if (error instanceof BannerImageError) {
    return res.status(error.status).json({ success: false, error: { code: error.code, message: error.message } });
  }
  logger.error({ context, error: error instanceof Error ? error.message : String(error) }, 'Banners request failed');
  return res.status(500).json({
    success: false,
    error: { code: 'BANNERS_INTERNAL_ERROR', message: 'Não foi possível concluir a operação. Tente novamente.' },
  });
}

// ---------------------------------------------------------------------------
// Público — somente leitura, sem autenticação: GET /api/v1/banners/active
// ---------------------------------------------------------------------------
export const bannersPublicRouter = Router();

bannersPublicRouter.get('/active', async (req: Request, res: Response) => {
  try {
    const data = await listActivePublicBanners(req.query.country);
    res.set('Cache-Control', 'public, max-age=60');
    return res.json({ success: true, data });
  } catch (error) {
    // O frontend cai para os slides embutidos em qualquer erro; nunca cachear a falha.
    res.set('Cache-Control', 'no-store');
    if (error instanceof BannerHttpError) {
      return res.status(error.status).json({ success: false, error: { code: error.code, message: error.message } });
    }
    logger.error({ error: error instanceof Error ? error.message : String(error) }, 'Public banners request failed');
    return res.status(503).json({
      success: false,
      error: { code: 'BANNERS_UNAVAILABLE', message: 'Banners indisponíveis no momento.' },
    });
  }
});

// ---------------------------------------------------------------------------
// Administrativo — montado em /api/v1/admin/banners DEPOIS de requireAuth, requireInternalStaff
// e requireGlobalAdmin (ver adminRoutes.ts). Este router nunca decide autorização sozinho.
// ---------------------------------------------------------------------------
export const bannersAdminRouter = Router();

const actorOf = (req: AuthRequest): BannerActor => ({
  userId: req.user?.id ?? null,
  ip: req.ip || req.socket.remoteAddress || null,
  userAgent: (req.headers['user-agent'] as string | undefined) ?? null,
  countryCode: req.user?.countryCode ?? null,
});

const ID_PATTERN = /^[A-Za-z0-9_-]{1,255}$/;
const idOf = (req: Request): string => {
  const id = String(req.params.id ?? '');
  if (!ID_PATTERN.test(id)) throw new BannerHttpError(404, 'BANNER_NOT_FOUND', 'Banner não encontrado.');
  return id;
};

bannersAdminRouter.get('/', async (req: AuthRequest, res: Response) => {
  try {
    const data = await listAdminBanners({ status: req.query.status, country: req.query.country });
    return res.json({ success: true, data, meta: { imagePolicy: BANNER_IMAGE_POLICY } });
  } catch (error) { return sendError(res, error, 'list'); }
});

// Rotas fixas ANTES das rotas com :id.
bannersAdminRouter.put('/order', async (req: AuthRequest, res: Response) => {
  try {
    const data = await reorderBanners(actorOf(req), req.body);
    return res.json({ success: true, data });
  } catch (error) { return sendError(res, error, 'reorder'); }
});

const upload = multer({
  storage: multer.memoryStorage(),
  // O mimetype enviado pelo navegador NÃO é usado para nada: o tipo real vem dos magic bytes.
  limits: { files: 1, fields: 0, fileSize: BANNER_UPLOAD_HARD_LIMIT_BYTES },
});

function parseKind(req: Request, _res: Response, next: NextFunction) {
  const kind = req.query.kind;
  if (kind !== 'desktop' && kind !== 'mobile') {
    return next(new BannerHttpError(400, 'VALIDATION_ERROR', 'Informe kind=desktop ou kind=mobile.'));
  }
  (req as any).bannerKind = kind as BannerImageKind;
  return next();
}

function receiveFile(req: Request, res: Response, next: NextFunction) {
  upload.single('file')(req, res, (error: any) => {
    if (!error) return next();
    if (error instanceof multer.MulterError) {
      const tooLarge = error.code === 'LIMIT_FILE_SIZE';
      return next(new BannerHttpError(
        tooLarge ? 413 : 400,
        tooLarge ? 'FILE_TOO_LARGE' : 'UPLOAD_ERROR',
        tooLarge ? 'A imagem excede o tamanho máximo permitido.' : 'Envio inválido: use um único arquivo no campo "file".',
      ));
    }
    return next(new BannerHttpError(400, 'UPLOAD_ERROR', 'Não foi possível ler o arquivo enviado.'));
  });
}

bannersAdminRouter.post(
  '/upload',
  parseKind,
  receiveFile,
  async (req: AuthRequest, res: Response) => {
    try {
      const kind = (req as any).bannerKind as BannerImageKind;
      if (!req.file) throw new BannerHttpError(400, 'FILE_REQUIRED', 'Nenhum arquivo foi enviado.');
      if (!process.env.STORAGE_PUBLIC_URL?.trim()) {
        throw new BannerHttpError(503, 'STORAGE_NOT_CONFIGURED', 'Armazenamento de imagens não está configurado.');
      }
      // Tipo, extensão e dimensões vêm SOMENTE dos bytes do arquivo.
      const info = validateBannerImage(req.file.buffer, kind);
      const objectKey = buildBannerObjectKey(info.ext, randomUUID());
      let result;
      try {
        result = await storageService.uploadFile(
          // `originalname` é constante do servidor: o nome enviado pelo cliente nunca chega ao R2.
          { buffer: req.file.buffer, originalname: `banner.${info.ext}`, mimetype: info.mime, size: req.file.buffer.length },
          'banners',
          { objectKey },
        );
      } catch (error) {
        logger.error({ kind, error: error instanceof Error ? error.message : String(error) }, 'Banner image upload to R2 failed');
        throw new BannerHttpError(500, 'STORAGE_UPLOAD_FAILED', 'Não foi possível armazenar a imagem. Tente novamente.');
      }
      try {
        await auditBannerImageUpload(actorOf(req), {
          kind, objectKey: result.objectKey, width: info.width, height: info.height, size: req.file.buffer.length, mimeType: info.mime,
        });
      } catch (error) {
        // O objeto só é usado quando um banner o referencia (e essa ação é auditada). Não derruba o upload.
        logger.error({ error: error instanceof Error ? error.message : String(error) }, 'Banner image upload audit failed');
      }
      return res.status(201).json({
        success: true,
        data: {
          kind, url: result.url, objectKey: result.objectKey,
          width: info.width, height: info.height, size: req.file.buffer.length, mimeType: info.mime,
        },
      });
    } catch (error) { return sendError(res, error, 'upload'); }
  },
);

bannersAdminRouter.post('/', async (req: AuthRequest, res: Response) => {
  try {
    const data = await createBanner(actorOf(req), req.body);
    return res.status(201).json({ success: true, data });
  } catch (error) { return sendError(res, error, 'create'); }
});

bannersAdminRouter.get('/:id', async (req: AuthRequest, res: Response) => {
  try { return res.json({ success: true, data: await getAdminBanner(idOf(req)) }); }
  catch (error) { return sendError(res, error, 'get'); }
});

bannersAdminRouter.patch('/:id/status', async (req: AuthRequest, res: Response) => {
  try { return res.json({ success: true, data: await setBannerStatus(actorOf(req), idOf(req), req.body) }); }
  catch (error) { return sendError(res, error, 'status'); }
});

bannersAdminRouter.patch('/:id', async (req: AuthRequest, res: Response) => {
  try { return res.json({ success: true, data: await updateBanner(actorOf(req), idOf(req), req.body) }); }
  catch (error) { return sendError(res, error, 'update'); }
});

bannersAdminRouter.post('/:id/duplicate', async (req: AuthRequest, res: Response) => {
  try { return res.status(201).json({ success: true, data: await duplicateBanner(actorOf(req), idOf(req)) }); }
  catch (error) { return sendError(res, error, 'duplicate'); }
});

bannersAdminRouter.delete('/:id', async (req: AuthRequest, res: Response) => {
  try { return res.json({ success: true, data: await softDeleteBanner(actorOf(req), idOf(req)) }); }
  catch (error) { return sendError(res, error, 'delete'); }
});

// Erros do pipeline de upload (parseKind/receiveFile) chegam aqui como next(error). Deve ser o ÚLTIMO item do router.
bannersAdminRouter.use((error: unknown, _req: Request, res: Response, _next: NextFunction) => sendError(res, error, 'pipeline'));
