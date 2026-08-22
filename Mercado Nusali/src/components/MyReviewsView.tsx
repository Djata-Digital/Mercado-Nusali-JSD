import React, { useState, useEffect } from 'react';
import {
  Star,
  MessageSquare,
  ThumbsUp,
  Image as ImageIcon,
  CheckCircle2,
  Clock,
  Package,
  Sparkles,
  RefreshCw,
} from 'lucide-react';
import { usePreferences } from '../context/PreferencesContext';
import { useOrders } from '../hooks/useOrders';
import { BuyerNavHeader } from './BuyerNavHeader';
import { BuyerService, BuyerReview } from '../services/buyerService';

export const MyReviewsView: React.FC = () => {
  const { showToast } = usePreferences();
  const { data: orders = [] } = useOrders();
  const [activeTab, setActiveTab] = useState<'pending' | 'published'>('published');

  const [reviewRating, setReviewRating] = useState(5);
  const [reviewComment, setReviewComment] = useState('');
  const [selectedProductIdToReview, setSelectedProductIdToReview] = useState<string | null>(null);

  const [reviews, setReviews] = useState<BuyerReview[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isPublishing, setIsPublishing] = useState(false);

  const loadReviews = async () => {
    setIsLoading(true);
    try {
      const res = await BuyerService.getReviews();
      if (res.success && Array.isArray(res.data)) {
        setReviews(res.data);
      }
    } catch (err) {
      console.error('Failed to load reviews:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadReviews();
  }, []);

  const handlePublishReview = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reviewComment.trim() || !selectedProductIdToReview) {
      showToast('Por favor, preencha o comentário e selecione o produto.');
      return;
    }

    setIsPublishing(true);
    try {
      const res = await BuyerService.publishReview({
        productId: selectedProductIdToReview,
        productTitle: 'Produto Selecionado',
        rating: reviewRating,
        comment: reviewComment.trim(),
      });

      if (res.success && res.data) {
        setReviews(prev => [res.data, ...prev]);
        setReviewComment('');
        setSelectedProductIdToReview(null);
        setActiveTab('published');
        showToast('Sua avaliação foi salva no banco de dados e publicada com sucesso!');
      } else {
        showToast(res.message || 'Erro ao publicar avaliação.');
      }
    } catch {
      showToast('Falha na comunicação com o servidor.');
    } finally {
      setIsPublishing(false);
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 animate-fadeIn">
      <BuyerNavHeader />

      {/* Main Header Banner */}
      <div className="bg-gradient-to-r from-amber-950 via-slate-900 to-emerald-950 text-white rounded-2xl p-6 sm:p-8 shadow-xl mb-8">
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
          <div>
            <div className="inline-flex items-center gap-2 bg-yellow-400 text-amber-950 px-3 py-1 rounded-full text-xs font-black uppercase mb-3">
              <Star className="w-3.5 h-3.5 fill-amber-950" /> Reputação & Feedback
            </div>
            <h1 className="text-2xl sm:text-3xl font-black">Minhas Avaliações</h1>
            <p className="text-xs text-gray-200 mt-1 max-w-xl">
              Compartilhe sua experiência de compra com outros membros da comunidade Nusali na Guiné-Bissau e CPLP.
            </p>
          </div>

          <div className="flex bg-white/10 p-1.5 rounded-xl border border-white/20">
            <button
              onClick={() => setActiveTab('published')}
              className={`px-4 py-2 rounded-lg text-xs font-bold transition cursor-pointer ${
                activeTab === 'published' ? 'bg-yellow-400 text-amber-950' : 'text-white hover:bg-white/10'
              }`}
            >
              Publicadas ({reviews.length})
            </button>
            <button
              onClick={() => setActiveTab('pending')}
              className={`px-4 py-2 rounded-lg text-xs font-bold transition cursor-pointer ${
                activeTab === 'pending' ? 'bg-yellow-400 text-amber-950' : 'text-white hover:bg-white/10'
              }`}
            >
              Avaliar Produtos
            </button>
          </div>
        </div>
      </div>

      {activeTab === 'published' ? (
        <div className="space-y-4">
          {reviews.length === 0 ? (
            <div className="bg-white rounded-2xl border border-gray-200 p-12 text-center text-gray-500">
              <Star className="w-12 h-12 text-gray-300 mx-auto mb-3" />
              <h3 className="text-base font-bold text-gray-800">Nenhuma avaliação publicada ainda</h3>
              <p className="text-xs text-gray-400 mt-1">Avalie os produtos recebidos para ganhar pontos de fidelidade.</p>
            </div>
          ) : (
            reviews.map((rev) => (
              <div key={rev.id} className="bg-white rounded-2xl border border-gray-200 p-6 shadow-2xs">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-gray-100 pb-4 mb-4">
                  <div>
                    <h3 className="text-sm font-black text-gray-900">{rev.productTitle}</h3>
                    <div className="flex items-center gap-1 mt-1">
                      {[1, 2, 3, 4, 5].map((star) => (
                        <Star
                          key={star}
                          className={`w-4 h-4 ${
                            star <= rev.rating ? 'text-yellow-400 fill-yellow-400' : 'text-gray-300'
                          }`}
                        />
                      ))}
                    </div>
                  </div>
                  <span className="text-xs text-gray-400">{rev.date}</span>
                </div>

                <p className="text-xs text-gray-700 leading-relaxed font-medium">
                  {rev.comment}
                </p>

                {rev.sellerReply && (
                  <div className="mt-4 bg-emerald-50/60 border border-emerald-200 rounded-xl p-3.5 text-xs text-emerald-900">
                    <span className="font-bold block mb-1">Resposta do Vendedor:</span>
                    <p>{rev.sellerReply}</p>
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-gray-200 p-6 sm:p-8 shadow-2xs max-w-2xl mx-auto">
          <h2 className="text-lg font-black text-gray-900 mb-2">Escrever Nova Avaliação</h2>
          <p className="text-xs text-gray-500 mb-6">
            Avalie o produto recebido para ajudar outros compradores na comunidade.
          </p>

          <form onSubmit={handlePublishReview} className="space-y-4">
            <div>
              <label className="block text-xs font-bold text-gray-700 mb-1">Selecione o Pedido</label>
              <select
                value={selectedProductIdToReview || ''}
                onChange={e => setSelectedProductIdToReview(e.target.value)}
                className="w-full px-3 py-2.5 bg-gray-50 border border-gray-300 rounded-xl text-xs text-gray-900 focus:outline-hidden focus:ring-2 focus:ring-amber-500"
                required
              >
                <option value="">Selecione um pedido entregue...</option>
                {orders.map((o) => (
                  <option key={o.id} value={o.id}>
                    Pedido #{o.id} - {o.items?.[0]?.product?.title || 'Produto'}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold text-gray-700 mb-1">Sua Nota</label>
              <div className="flex items-center gap-2">
                {[1, 2, 3, 4, 5].map((star) => (
                  <button
                    key={star}
                    type="button"
                    onClick={() => setReviewRating(star)}
                    className="p-1 cursor-pointer hover:scale-110 transition"
                  >
                    <Star
                      className={`w-6 h-6 ${
                        star <= reviewRating ? 'text-yellow-400 fill-yellow-400' : 'text-gray-300'
                      }`}
                    />
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-gray-700 mb-1">Comentário Detalhado</label>
              <textarea
                value={reviewComment}
                onChange={e => setReviewComment(e.target.value)}
                rows={4}
                placeholder="Conte o que achou da entrega, qualidade do produto e atendimento..."
                className="w-full px-3 py-2.5 bg-gray-50 border border-gray-300 rounded-xl text-xs text-gray-900 focus:outline-hidden focus:ring-2 focus:ring-amber-500"
                required
              />
            </div>

            <div className="pt-4 border-t border-gray-100 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setActiveTab('published')}
                className="px-5 py-2.5 rounded-xl border border-gray-300 text-xs font-bold text-gray-700 hover:bg-gray-50 transition cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={isPublishing}
                className="px-6 py-2.5 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-xs font-black transition cursor-pointer flex items-center gap-2"
              >
                {isPublishing ? <RefreshCw className="w-4 h-4 animate-spin" /> : 'Publicar Avaliação'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
