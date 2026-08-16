import { API_CONFIG } from '../config/api';
import { apiClient } from '../api/apiClient';

export interface UploadResult {
  url: string;
  filename: string;
  size: number;
  mimeType: string;
  objectKey?: string;
  bucket?: string;
  access?: 'public' | 'private';
}

export class UploadService {
  private async processUpload(
    file: File,
    folder: string
  ): Promise<UploadResult> {
    if (API_CONFIG.USE_FAKE_API) {
      await new Promise((res) => setTimeout(res, 500));

      const mockUrl =
        URL.createObjectURL(file) ||
        `https://images.unsplash.com/photo-fake-${Date.now()}`;

      return {
        url: mockUrl,
        filename: file.name,
        size: file.size,
        mimeType: file.type || 'image/jpeg',
      };
    }

    const formData = new FormData();

    formData.append('file', file);

    const response = await apiClient.post<UploadResult>(
      `/upload/${folder}`,
      formData
    );

    if (!response.data) {
      throw new Error(
        `O servidor não retornou os dados do upload para "${folder}".`
      );
    }

    return response.data;
  }

  public async uploadProfile(file: File): Promise<UploadResult> {
    return this.processUpload(file, 'profiles');
  }

  public async uploadProduct(file: File): Promise<UploadResult> {
    return this.processUpload(file, 'products');
  }

  public async uploadStore(file: File): Promise<UploadResult> {
    return this.processUpload(file, 'stores');
  }

  public async uploadKyc(file: File): Promise<UploadResult> {
    return this.processUpload(file, 'kyc');
  }

  public async uploadReview(file: File): Promise<UploadResult> {
    return this.processUpload(file, 'reviews');
  }

  public async uploadEvidence(file: File): Promise<UploadResult> {
    return this.processUpload(file, 'evidences');
  }
}

export const uploadService = new UploadService();