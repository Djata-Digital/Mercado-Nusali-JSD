import { Router, Request, Response, NextFunction } from 'express';
import multer from 'multer';
import {
  storageService,
  checkStorageConnection,
} from './infra/storage.js';
import {
  requireAuth,
  AuthRequest,
} from './modules/auth/authMiddleware.js';
import { logger } from './infra/logger.js';

export const uploadRouter = Router();

type UploadFolder =
  | 'profiles'
  | 'products'
  | 'stores'
  | 'reviews'
  | 'kyc'
  | 'evidences';

const PUBLIC_FOLDERS = new Set<UploadFolder>([
  'profiles',
  'products',
  'stores',
  'reviews',
]);

const PRIVATE_FOLDERS = new Set<UploadFolder>([
  'kyc',
  'evidences',
]);

const ALLOWED_TYPES: Record<UploadFolder, Set<string>> = {
  profiles: new Set([
    'image/jpeg',
    'image/png',
    'image/webp',
  ]),

  products: new Set([
    'image/jpeg',
    'image/png',
    'image/webp',
    'image/avif',
    'video/mp4',
    'video/webm',
  ]),

  stores: new Set([
    'image/jpeg',
    'image/png',
    'image/webp',
    'image/avif',
  ]),

  reviews: new Set([
    'image/jpeg',
    'image/png',
    'image/webp',
    'video/mp4',
    'video/webm',
  ]),

  kyc: new Set([
    'image/jpeg',
    'image/png',
    'image/webp',
    'application/pdf',
  ]),

  evidences: new Set([
    'image/jpeg',
    'image/png',
    'image/webp',
    'application/pdf',
    'video/mp4',
    'video/webm',
  ]),
};

const MAX_SIZE_BYTES: Record<UploadFolder, number> = {
  profiles: 5 * 1024 * 1024,
  products: 50 * 1024 * 1024,
  stores: 10 * 1024 * 1024,
  reviews: 25 * 1024 * 1024,
  kyc: 15 * 1024 * 1024,
  evidences: 50 * 1024 * 1024,
};

function isUploadFolder(value: string): value is UploadFolder {
  return (
    PUBLIC_FOLDERS.has(value as UploadFolder) ||
    PRIVATE_FOLDERS.has(value as UploadFolder)
  );
}

const upload = multer({
  storage: multer.memoryStorage(),

  limits: {
    files: 1,
    fileSize: 50 * 1024 * 1024,
  },

  fileFilter(req, file, callback) {
    const folder = req.params.folder;

    if (!folder || !isUploadFolder(folder)) {
      callback(
        new Error(
          'Pasta de upload inválida.',
        ),
      );
      return;
    }

    const allowedTypes = ALLOWED_TYPES[folder];

    if (!allowedTypes.has(file.mimetype)) {
      callback(
        new Error(
          `Tipo de arquivo "${file.mimetype}" não permitido para ${folder}.`,
        ),
      );
      return;
    }

    callback(null, true);
  },
});

function uploadSingle(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  upload.single('file')(req, res, (error: any) => {
    if (!error) {
      next();
      return;
    }

    if (error instanceof multer.MulterError) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'UPLOAD_ERROR',
          message:
            error.code === 'LIMIT_FILE_SIZE'
              ? 'O arquivo excede o limite máximo permitido.'
              : error.message,
        },
      });
    }

    return res.status(400).json({
      success: false,
      error: {
        code: 'INVALID_FILE',
        message:
          error instanceof Error
            ? error.message
            : 'Arquivo inválido.',
      },
    });
  });
}

/**
 * Authenticated upload route used by the existing frontend:
 * POST /api/v1/upload/:folder
 * multipart/form-data
 * field name: file
 */
uploadRouter.post(
  '/:folder',
  requireAuth,
  uploadSingle,
  async (req: AuthRequest, res: Response) => {
    const folder = req.params.folder;

    if (!isUploadFolder(folder)) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'INVALID_UPLOAD_FOLDER',
          message: 'Destino de upload inválido.',
        },
      });
    }

    if (!req.file) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'FILE_REQUIRED',
          message: 'Nenhum arquivo foi enviado.',
        },
      });
    }

    const maxSize = MAX_SIZE_BYTES[folder];

    if (req.file.size > maxSize) {
      return res.status(413).json({
        success: false,
        error: {
          code: 'FILE_TOO_LARGE',
          message:
            `O arquivo excede o limite de ${Math.floor(
              maxSize / (1024 * 1024),
            )} MB para ${folder}.`,
        },
      });
    }

    try {
      // Foto de perfil é um recurso único por usuário. Usamos uma chave
      // estável para que cada novo upload sobrescreva o avatar anterior
      // em vez de criar arquivos duplicados no bucket público.
      const profileObjectKey =
        folder === 'profiles' && req.user?.id
          ? `profiles/${encodeURIComponent(req.user.id)}/avatar`
          : undefined;

      if (folder === 'profiles' && !profileObjectKey) {
        return res.status(401).json({
          success: false,
          error: {
            code: 'AUTH_USER_REQUIRED',
            message: 'Usuário autenticado não identificado.',
          },
        });
      }

      const result = await storageService.uploadFile(
        {
          buffer: req.file.buffer,
          originalname: req.file.originalname,
          mimetype: req.file.mimetype,
          size: req.file.size,
        },
        folder,
        profileObjectKey
          ? {
              objectKey: profileObjectKey,
              cacheBustPublicUrl: true,
            }
          : undefined,
      );

      return res.status(201).json({
        success: true,
        data: {
          url: result.url,
          filename: req.file.originalname,
          size: result.fileSize,
          mimeType: result.mimeType,
          objectKey: result.objectKey,
          bucket: result.bucket,
          access: result.access,
        },
      });
    } catch (error) {
      logger.error(
        {
          folder,
          userId: req.user?.id,
          error:
            error instanceof Error
              ? error.message
              : error,
        },
        'Cloudflare R2 upload failed',
      );

      return res.status(500).json({
        success: false,
        error: {
          code: 'STORAGE_UPLOAD_FAILED',
          message:
            'Não foi possível armazenar o arquivo. Tente novamente.',
        },
      });
    }
  },
);

/**
 * Safe connectivity test. Does not reveal credentials.
 * GET /api/v1/upload/health
 */
uploadRouter.get(
  '/health/status',
  requireAuth,
  async (_req: AuthRequest, res: Response) => {
    const health = await checkStorageConnection();

    return res.status(
      health.status === 'online' ? 200 : 503,
    ).json({
      success: health.status === 'online',
      data: health,
    });
  },
);
