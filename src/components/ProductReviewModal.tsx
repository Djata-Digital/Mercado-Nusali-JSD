import React, { useEffect, useRef, useState } from 'react';
import { X, Star, MessageSquareText, ImagePlus, Trash2, AlertCircle } from 'lucide-react';
import { uploadService } from '../services/uploadService';

interface ProductReviewModalProps {
  productId: string;
  orderId: string;
  productTitle: string;
  productImage?: string | null;
  variantTitle?: string | null;
  onClose: () => void;
  onSubmit: (input: { productId: string; orderId: string; rating: number; comment: string; title?: string; images?: string[] }) => Promise<void>;
}

// FASE D17-C7 — no máximo 5 fotos por avaliação (mesmo limite validado no
// servidor, ver REVIEW_MAX_IMAGES em buyerRoutes.ts). Tipos aceitos aqui são
// deliberadamente mais estritos que o endpoint genérico de upload (que
// também aceita vídeo para a pasta 'reviews') — esta é uma UX só de fotos.
const MAX_REVIEW_PHOTOS = 5;
const ALLOWED_PHOTO_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);

interface ReviewPhoto {
  id: string;
  file: File;
  previewUrl: string;
  status: 'uploading' | 'done' | 'error';
  uploadedUrl?: string;
  error?: string;
}

// FASE D17-C6 — formulário real de avaliação, aberto a partir de um item de
// pedido ENTREGUE em "Meus Pedidos". productId/orderId vêm do item
// selecionado (nunca digitados pelo usuário). Sucesso só é declarado depois
// que onSubmit (POST /buyer/reviews real) resolve; em falha, o formulário
// permanece aberto com os dados preenchidos, para nova tentativa.
export const ProductReviewModal: React.FC<ProductReviewModalProps> = ({
  productId,
  orderId,
  productTitle,
  productImage,
  variantTitle,
  onClose,
  onSubmit,
}) => {
  const [rating, setRating] = useState(0);
  const [hoverRating, setHoverRating] = useState(0);
  const [title, setTitle] = useState('');
  const [comment, setComment] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [photos, setPhotos] = useState<ReviewPhoto[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Evita vazamento de memória dos object URLs criados para preview local
  // (nunca enviados ao servidor — só o arquivo real via uploadService).
  useEffect(() => {
    return () => {
      photos.forEach((p) => URL.revokeObjectURL(p.previewUrl));
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const isUploadingAnyPhoto = photos.some((p) => p.status === 'uploading');
  const canSubmit = rating >= 1 && comment.trim().length > 0 && !isSubmitting && !isUploadingAnyPhoto;

  const uploadOnePhoto = async (photoId: string, file: File) => {
    try {
      const result = await uploadService.uploadReview(file);
      setPhotos((prev) => prev.map((p) => (p.id === photoId ? { ...p, status: 'done', uploadedUrl: result.url } : p)));
    } catch (err: any) {
      setPhotos((prev) =>
        prev.map((p) =>
          p.id === photoId
            ? { ...p, status: 'error', error: err?.response?.data?.error?.message || err?.message || 'Falha no envio da foto.' }
            : p
        )
      );
    }
  };

  const handleFilesSelected = (fileList: FileList | null) => {
    if (!fileList || fileList.length === 0) return;
    const remainingSlots = MAX_REVIEW_PHOTOS - photos.length;
    const filesToAdd = Array.from(fileList).slice(0, Math.max(remainingSlots, 0));

    for (const file of filesToAdd) {
      const photoId = `${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
      if (!ALLOWED_PHOTO_TYPES.has(file.type)) {
        // Nunca confia só no accept do <input>: MIME real do arquivo é
        // revalidado aqui antes de sequer tentar o upload.
        setPhotos((prev) => [
          ...prev,
          { id: photoId, file, previewUrl: URL.createObjectURL(file), status: 'error', error: 'Formato não suportado. Envie JPG, PNG ou WEBP.' },
        ]);
        continue;
      }
      setPhotos((prev) => [...prev, { id: photoId, file, previewUrl: URL.createObjectURL(file), status: 'uploading' }]);
      uploadOnePhoto(photoId, file);
    }

    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleRemovePhoto = (photoId: string) => {
    setPhotos((prev) => {
      const target = prev.find((p) => p.id === photoId);
      if (target) URL.revokeObjectURL(target.previewUrl);
      return prev.filter((p) => p.id !== photoId);
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;
    setIsSubmitting(true);
    setErrorMessage(null);
    try {
      // Só fotos com upload realmente concluído entram no payload — uma
      // foto com falha nunca é enviada como se tivesse funcionado.
      const uploadedImageUrls = photos.filter((p) => p.status === 'done' && p.uploadedUrl).map((p) => p.uploadedUrl!);
      await onSubmit({
        productId,
        orderId,
        rating,
        comment: comment.trim(),
        title: title.trim() || undefined,
        images: uploadedImageUrls.length > 0 ? uploadedImageUrls : undefined,
      });
      onClose();
    } catch (err: any) {
      setErrorMessage(
        err?.response?.data?.error?.message || err?.message || 'Não foi possível publicar sua avaliação. Tente novamente.'
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 animate-fadeIn"
      onClick={() => !isSubmitting && onClose()}
    >
      <div
        className="bg-white rounded-2xl max-w-md w-full shadow-2xl border border-gray-200 overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between p-4 border-b border-gray-100 bg-gray-50/80">
          <div className="flex items-center gap-2 text-gray-900 font-bold text-base">
            <div className="p-2 bg-amber-50 text-amber-600 rounded-xl border border-amber-100">
              <MessageSquareText className="w-5 h-5" />
            </div>
            <span>Avaliar Produto</span>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            className="p-1.5 text-gray-400 hover:text-gray-700 hover:bg-gray-200 rounded-lg transition disabled:opacity-40"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-4 border-b border-gray-100 flex items-center gap-3 bg-white">
          {productImage ? (
            <img src={productImage} alt="" className="w-14 h-14 rounded-xl object-contain border border-gray-200 p-1 bg-gray-50 shrink-0" />
          ) : (
            <div className="w-14 h-14 bg-gray-100 rounded-xl border border-gray-200 shrink-0" />
          )}
          <div className="min-w-0 flex-1">
            <h4 className="font-bold text-gray-900 text-xs sm:text-sm line-clamp-2">{productTitle}</h4>
            {variantTitle && (
              <span className="inline-block mt-1 text-[10px] bg-gray-100 text-gray-800 font-semibold px-1.5 py-0.5 rounded">
                {variantTitle}
              </span>
            )}
          </div>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          <div>
            <label className="block text-xs font-bold text-gray-700 mb-1.5">Sua Nota</label>
            <div className="flex items-center gap-1">
              {[1, 2, 3, 4, 5].map((star) => (
                <button
                  key={star}
                  type="button"
                  disabled={isSubmitting}
                  onClick={() => setRating(star)}
                  onMouseEnter={() => setHoverRating(star)}
                  onMouseLeave={() => setHoverRating(0)}
                  className="p-1 cursor-pointer hover:scale-110 transition disabled:cursor-not-allowed"
                >
                  <Star
                    className={`w-7 h-7 ${
                      star <= (hoverRating || rating) ? 'text-amber-400 fill-amber-400' : 'text-gray-300'
                    }`}
                  />
                </button>
              ))}
            </div>
          </div>

          <div>
            <label htmlFor="review-title" className="block text-xs font-bold text-gray-700 mb-1">
              Título (opcional)
            </label>
            <input
              id="review-title"
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={255}
              disabled={isSubmitting}
              placeholder="Resuma sua experiência em poucas palavras"
              className="w-full px-3 py-2.5 bg-gray-50 border border-gray-300 rounded-xl text-xs text-gray-900 focus:outline-hidden focus:ring-2 focus:ring-amber-500 disabled:opacity-60"
            />
          </div>

          <div>
            <label htmlFor="review-comment" className="block text-xs font-bold text-gray-700 mb-1">
              Comentário
            </label>
            <textarea
              id="review-comment"
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              rows={4}
              disabled={isSubmitting}
              placeholder="Conte o que achou da qualidade do produto, da entrega e do atendimento..."
              className="w-full px-3 py-2.5 bg-gray-50 border border-gray-300 rounded-xl text-xs text-gray-900 focus:outline-hidden focus:ring-2 focus:ring-amber-500 disabled:opacity-60"
              required
            />
          </div>

          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="block text-xs font-bold text-gray-700">Fotos do produto (opcional)</label>
              <span className="text-[11px] text-gray-400 font-semibold">{photos.length}/{MAX_REVIEW_PHOTOS} fotos</span>
            </div>

            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              multiple
              className="hidden"
              disabled={isSubmitting || photos.length >= MAX_REVIEW_PHOTOS}
              onChange={(e) => handleFilesSelected(e.target.files)}
            />

            <div className="flex flex-wrap gap-2">
              {photos.map((photo) => (
                <div key={photo.id} className="relative w-16 h-16 shrink-0">
                  <img
                    src={photo.previewUrl}
                    alt=""
                    className={`w-16 h-16 object-cover rounded-xl border ${photo.status === 'error' ? 'border-red-300 opacity-60' : 'border-gray-200'}`}
                  />
                  {photo.status === 'uploading' && (
                    <div className="absolute inset-0 bg-white/70 rounded-xl flex items-center justify-center">
                      <div className="w-4 h-4 border-2 border-amber-500 border-t-transparent rounded-full animate-spin" />
                    </div>
                  )}
                  {photo.status === 'error' && (
                    <div className="absolute inset-0 rounded-xl flex items-center justify-center" title={photo.error}>
                      <AlertCircle className="w-5 h-5 text-red-600" />
                    </div>
                  )}
                  <button
                    type="button"
                    onClick={() => handleRemovePhoto(photo.id)}
                    disabled={isSubmitting}
                    className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-gray-900 text-white rounded-full flex items-center justify-center hover:bg-red-600 transition disabled:opacity-50"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
              ))}

              {photos.length < MAX_REVIEW_PHOTOS && (
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isSubmitting}
                  className="w-16 h-16 shrink-0 border-2 border-dashed border-gray-300 rounded-xl flex flex-col items-center justify-center text-gray-400 hover:border-amber-400 hover:text-amber-600 transition disabled:opacity-50"
                >
                  <ImagePlus className="w-5 h-5" />
                </button>
              )}
            </div>

            {photos.length === 0 && (
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={isSubmitting}
                className="mt-2 text-xs font-bold text-amber-700 hover:text-amber-800 flex items-center gap-1.5 disabled:opacity-50"
              >
                <ImagePlus className="w-4 h-4" /> Adicionar fotos
              </button>
            )}

            {photos.some((p) => p.status === 'error') && (
              <p className="text-[11px] text-red-600 font-medium mt-1.5">
                Uma ou mais fotos não puderam ser enviadas. Remova-as ou tente novamente.
              </p>
            )}
          </div>

          {errorMessage && (
            <div className="bg-red-50 border border-red-200 text-red-800 text-xs font-medium p-3 rounded-xl">
              {errorMessage}
            </div>
          )}

          <div className="pt-2 border-t border-gray-100 flex justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="px-5 py-2.5 rounded-xl border border-gray-300 text-xs font-bold text-gray-700 hover:bg-gray-50 transition disabled:opacity-50"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={!canSubmit}
              className="px-6 py-2.5 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-xs font-black transition disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isSubmitting ? 'Publicando...' : isUploadingAnyPhoto ? 'Enviando fotos...' : 'Publicar Avaliação'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
