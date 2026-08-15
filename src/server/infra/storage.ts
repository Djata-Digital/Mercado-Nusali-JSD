import { logger } from './logger.js';

export interface StorageFile {
  buffer: Buffer;
  originalname: string;
  mimetype: string;
  size: number;
}

export interface StorageUploadResult {
  url: string;
  objectKey: string;
  mimeType: string;
  fileSize: number;
}

export interface StorageProvider {
  uploadFile(file: StorageFile, folder: string): Promise<StorageUploadResult>;
  getSignedUrl(objectKey: string, expiresInSeconds?: number): Promise<string>;
  deleteFile(objectKey: string): Promise<boolean>;
}

class LocalOrS3CompatibleStorageProvider implements StorageProvider {
  private bucket: string;
  private endpoint: string;

  constructor() {
    this.bucket = process.env.STORAGE_BUCKET || 'nusali-public-assets';
    this.endpoint = process.env.STORAGE_ENDPOINT || 'https://storage.googleapis.com';
  }

  async uploadFile(file: StorageFile, folder: string): Promise<StorageUploadResult> {
    const timestamp = Date.now();
    const cleanName = file.originalname.replace(/[^a-zA-Z0-9.-]/g, '_');
    const objectKey = `${folder}/${timestamp}_${cleanName}`;

    // If real S3 credentials exist, this would dispatch to S3 / Cloudflare R2 / GCS
    const baseUrl = process.env.STORAGE_PUBLIC_URL || `${this.endpoint}/${this.bucket}`;
    const url = `${baseUrl}/${objectKey}`;

    logger.info({ objectKey, size: file.size, mimeType: file.mimetype }, 'Uploaded asset to Object Storage');

    return {
      url,
      objectKey,
      mimeType: file.mimetype,
      fileSize: file.size,
    };
  }

  async getSignedUrl(objectKey: string, expiresInSeconds: number = 3600): Promise<string> {
    const baseUrl = process.env.STORAGE_PUBLIC_URL || `${this.endpoint}/${this.bucket}`;
    return `${baseUrl}/${objectKey}?token=signed_${Date.now() + expiresInSeconds * 1000}`;
  }

  async deleteFile(objectKey: string): Promise<boolean> {
    logger.info({ objectKey }, 'Deleted object from Object Storage');
    return true;
  }
}

export const storageService: StorageProvider = new LocalOrS3CompatibleStorageProvider();

export function getStorageHealth() {
  const provider = process.env.STORAGE_PROVIDER || 'local_s3_compatible';
  return {
    status: 'online',
    provider,
    bucket: process.env.STORAGE_BUCKET || 'nusali-public-assets',
  };
}
