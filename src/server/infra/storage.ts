import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadBucketCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl as createPresignedUrl } from '@aws-sdk/s3-request-presigner';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { logger } from './logger.js';

export interface StorageFile {
  buffer: Buffer;
  originalname: string;
  mimetype: string;
  size: number;
}

export type StorageAccess = 'public' | 'private';

export interface StorageUploadResult {
  url: string;
  objectKey: string;
  bucket: string;
  access: StorageAccess;
  mimeType: string;
  fileSize: number;
}

export interface StorageProvider {
  uploadFile(file: StorageFile, folder: string): Promise<StorageUploadResult>;
  getSignedUrl(
    objectKey: string,
    expiresInSeconds?: number,
    access?: StorageAccess,
  ): Promise<string>;
  deleteFile(objectKey: string, access?: StorageAccess): Promise<boolean>;
}

const PUBLIC_FOLDERS = new Set([
  'products',
  'stores',
  'profiles',
  'reviews',
]);

const PRIVATE_FOLDERS = new Set([
  'kyc',
  'evidences',
  'receipts',
  'reports',
]);

function sanitizeFilename(filename: string): string {
  const parsed = path.parse(filename);
  const safeBase = parsed.name
    .normalize('NFKD')
    .replace(/[^\w.-]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 100);

  const safeExt = parsed.ext
    .toLowerCase()
    .replace(/[^a-z0-9.]/g, '')
    .slice(0, 15);

  return `${safeBase || 'file'}${safeExt}`;
}

function normalizePublicUrl(url: string): string {
  return url.replace(/\/+$/, '');
}

function getAccessForFolder(folder: string): StorageAccess {
  if (PUBLIC_FOLDERS.has(folder)) return 'public';
  if (PRIVATE_FOLDERS.has(folder)) return 'private';

  throw new Error(`Unsupported storage folder: ${folder}`);
}

function getAccessForObjectKey(objectKey: string): StorageAccess {
  const folder = objectKey.split('/')[0];
  return getAccessForFolder(folder);
}

class R2StorageProvider implements StorageProvider {
  private client: S3Client;
  private publicBucket: string;
  private privateBucket: string;
  private publicUrl: string;

  constructor() {
    const endpoint = process.env.STORAGE_ENDPOINT?.trim();
    const accessKeyId = process.env.STORAGE_ACCESS_KEY?.trim();
    const secretAccessKey = process.env.STORAGE_SECRET_KEY?.trim();

    this.publicBucket =
      process.env.STORAGE_PUBLIC_BUCKET?.trim() ||
      process.env.STORAGE_BUCKET?.trim() ||
      'nusali-public-assets';

    this.privateBucket =
      process.env.STORAGE_PRIVATE_BUCKET?.trim() ||
      'nusali-private-assets';

    this.publicUrl = normalizePublicUrl(
      process.env.STORAGE_PUBLIC_URL?.trim() || '',
    );

    if (!endpoint) {
      throw new Error('STORAGE_ENDPOINT is not configured.');
    }

    if (!accessKeyId || !secretAccessKey) {
      throw new Error(
        'STORAGE_ACCESS_KEY and STORAGE_SECRET_KEY must be configured.',
      );
    }

    this.client = new S3Client({
      region: process.env.STORAGE_REGION?.trim() || 'auto',
      endpoint,
      credentials: {
        accessKeyId,
        secretAccessKey,
      },
    });
  }

  private getBucket(access: StorageAccess): string {
    return access === 'public'
      ? this.publicBucket
      : this.privateBucket;
  }

  async uploadFile(
    file: StorageFile,
    folder: string,
  ): Promise<StorageUploadResult> {
    const access = getAccessForFolder(folder);
    const bucket = this.getBucket(access);
    const cleanName = sanitizeFilename(file.originalname);
    const date = new Date();
    const year = String(date.getUTCFullYear());
    const month = String(date.getUTCMonth() + 1).padStart(2, '0');

    const objectKey =
      `${folder}/${year}/${month}/${randomUUID()}-${cleanName}`;

    await this.client.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: objectKey,
        Body: file.buffer,
        ContentType: file.mimetype || 'application/octet-stream',
        ContentLength: file.size,
        CacheControl:
          access === 'public'
            ? 'public, max-age=31536000, immutable'
            : 'private, no-store',
        Metadata: {
          originalName: encodeURIComponent(file.originalname),
        },
      }),
    );

    const url =
      access === 'public' && this.publicUrl
        ? `${this.publicUrl}/${objectKey}`
        : `r2://${bucket}/${objectKey}`;

    logger.info(
      {
        bucket,
        objectKey,
        access,
        size: file.size,
        mimeType: file.mimetype,
      },
      'Uploaded asset to Cloudflare R2',
    );

    return {
      url,
      objectKey,
      bucket,
      access,
      mimeType: file.mimetype,
      fileSize: file.size,
    };
  }

  async getSignedUrl(
    objectKey: string,
    expiresInSeconds = 900,
    access?: StorageAccess,
  ): Promise<string> {
    const resolvedAccess = access ?? getAccessForObjectKey(objectKey);
    const bucket = this.getBucket(resolvedAccess);

    if (resolvedAccess === 'public' && this.publicUrl) {
      return `${this.publicUrl}/${objectKey}`;
    }

    const safeExpiry = Math.min(
      Math.max(expiresInSeconds, 60),
      3600,
    );

    return createPresignedUrl(
      this.client,
      new GetObjectCommand({
        Bucket: bucket,
        Key: objectKey,
      }),
      {
        expiresIn: safeExpiry,
      },
    );
  }

  async deleteFile(
    objectKey: string,
    access?: StorageAccess,
  ): Promise<boolean> {
    const resolvedAccess = access ?? getAccessForObjectKey(objectKey);
    const bucket = this.getBucket(resolvedAccess);

    await this.client.send(
      new DeleteObjectCommand({
        Bucket: bucket,
        Key: objectKey,
      }),
    );

    logger.info(
      {
        bucket,
        objectKey,
        access: resolvedAccess,
      },
      'Deleted object from Cloudflare R2',
    );

    return true;
  }

  async checkConnection(): Promise<{
    publicBucket: boolean;
    privateBucket: boolean;
  }> {
    const [publicResult, privateResult] = await Promise.allSettled([
      this.client.send(
        new HeadBucketCommand({
          Bucket: this.publicBucket,
        }),
      ),
      this.client.send(
        new HeadBucketCommand({
          Bucket: this.privateBucket,
        }),
      ),
    ]);

    return {
      publicBucket: publicResult.status === 'fulfilled',
      privateBucket: privateResult.status === 'fulfilled',
    };
  }
}

let provider: R2StorageProvider | null = null;

function getProvider(): R2StorageProvider {
  if (!provider) {
    provider = new R2StorageProvider();
  }

  return provider;
}

export const storageService: StorageProvider = {
  uploadFile(file, folder) {
    return getProvider().uploadFile(file, folder);
  },

  getSignedUrl(objectKey, expiresInSeconds, access) {
    return getProvider().getSignedUrl(
      objectKey,
      expiresInSeconds,
      access,
    );
  },

  deleteFile(objectKey, access) {
    return getProvider().deleteFile(objectKey, access);
  },
};

export async function checkStorageConnection() {
  try {
    if (
      (process.env.STORAGE_PROVIDER || '').toLowerCase() !== 'r2'
    ) {
      return {
        status: 'not_configured',
        publicBucket: false,
        privateBucket: false,
      };
    }

    const result = await getProvider().checkConnection();

    return {
      status:
        result.publicBucket && result.privateBucket
          ? 'online'
          : 'degraded',
      ...result,
    };
  } catch (error) {
    logger.warn(
      {
        error:
          error instanceof Error
            ? error.message
            : error,
      },
      'Cloudflare R2 health check failed',
    );

    return {
      status: 'offline',
      publicBucket: false,
      privateBucket: false,
    };
  }
}

export function getStorageHealth() {
  const providerName =
    process.env.STORAGE_PROVIDER?.trim() || 'not_configured';

  return {
    status:
      providerName.toLowerCase() === 'r2'
        ? 'configured'
        : 'not_configured',
    provider: providerName,
    publicBucket:
      process.env.STORAGE_PUBLIC_BUCKET?.trim() ||
      process.env.STORAGE_BUCKET?.trim() ||
      'nusali-public-assets',
    privateBucket:
      process.env.STORAGE_PRIVATE_BUCKET?.trim() ||
      'nusali-private-assets',
    publicUrlConfigured: Boolean(
      process.env.STORAGE_PUBLIC_URL?.trim(),
    ),
  };
}
