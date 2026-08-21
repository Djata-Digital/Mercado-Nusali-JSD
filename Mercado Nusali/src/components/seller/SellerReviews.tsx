import React, { useState } from 'react';
import { Star, MessageSquare, Filter, Send, ThumbsUp } from 'lucide-react';

interface SellerReviewsProps {
  showToast: (msg: string) => void;
  reviewsList?: any[];
}

export const SellerReviews: React.FC<SellerReviewsProps> = ({ showToast, reviewsList = [] }) => {
  const [starFilter, setStarFilter] = useState<number>(0);
  const [replyingId, setReplyingId] = useState<string | null>(null);
  const [publicReply, setPublicReply] = useState('');

  const [reviews, setReviews] = useState<any[]>(reviewsList);

  const handleSendReply = (id: string) => {
    if (!publicReply.trim()) return;
    setReviews(prev => prev.map(r => r.id === id ? { ...r, sellerReply: publicReply.trim() } : r));
    setReplyingId(null);
    setPublicReply('');
    showToast('Resposta pública enviada com sucesso!');
  };

  const filtered = reviews.filter(r => starFilter === 0 || r.rating === starFilter);

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-2xl p-6 border border-gray-200 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-gray-900 flex items-center gap-2">
            <Star className="w-6 h-6 text-amber-500 fill-amber-500" />
            Avaliações & Reputação de Produtos
          </h1>
          <p className="text-xs text-gray-500 mt-1">
            Opiniões de compradores reais e gerenciamento de reputação da loja.
          </p>
        </div>

        {/* Rating Filter Buttons */}
        <div className="flex items-center gap-1 bg-gray-50 p-1.5 rounded-xl border border-gray-200">
          <button
            onClick={() => setStarFilter(0)}
            className={`px-2.5 py-1 text-xs font-bold rounded-lg ${starFilter === 0 ? 'bg-amber-500 text-white' : 'text-gray-700'}`}
          >
            Todas
          </button>
          {[5, 4, 3, 2, 1].map(s => (
            <button
              key={s}
              onClick={() => setStarFilter(s)}
              className={`px-2.5 py-1 text-xs font-bold rounded-lg flex items-center gap-0.5 ${starFilter === s ? 'bg-amber-500 text-white' : 'text-gray-700'}`}
            >
              {s} <Star className="w-3 h-3 fill-current" />
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-4">
        {filtered.length === 0 ? (
          <div className="bg-white p-12 rounded-2xl border border-gray-200 text-center text-gray-500 font-bold">
            Nenhuma avaliação recebida
          </div>
        ) : (
          filtered.map(r => (
          <div key={r.id} className="bg-white p-5 rounded-2xl border border-gray-200 shadow-xs space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <img src={r.productImage} alt="" className="w-8 h-8 rounded border object-cover" />
                <div>
                  <p className="text-xs font-bold text-gray-900">{r.productTitle}</p>
                  <p className="text-[10px] text-gray-400">Por {r.buyerName} • {r.date}</p>
                </div>
              </div>

              <div className="flex text-amber-400">
                {Array.from({ length: 5 }).map((_, i) => (
                  <Star key={i} className={`w-4 h-4 ${i < r.rating ? 'fill-amber-400' : 'text-gray-200'}`} />
                ))}
              </div>
            </div>

            <p className="text-xs text-gray-800 italic bg-gray-50 p-3 rounded-xl border border-gray-200">
              "{r.comment}"
            </p>

            {r.sellerReply ? (
              <div className="bg-emerald-50 p-3 rounded-xl border border-emerald-200 text-xs text-emerald-950">
                <strong className="block text-[10px] uppercase text-emerald-900 font-extrabold">Sua Resposta Pública:</strong>
                {r.sellerReply}
              </div>
            ) : (
              replyingId !== r.id && (
                <button
                  onClick={() => { setReplyingId(r.id); setPublicReply(''); }}
                  className="text-xs text-emerald-700 font-bold hover:underline"
                >
                  Responder publicamente...
                </button>
              )
            )}

            {replyingId === r.id && (
              <div className="space-y-2 pt-2">
                <textarea
                  value={publicReply}
                  onChange={(e) => setPublicReply(e.target.value)}
                  placeholder="Escreva seu agradecimento ou resposta pública..."
                  className="w-full p-2.5 text-xs border border-gray-300 rounded-xl focus:ring-2 focus:ring-emerald-500"
                  rows={2}
                />
                <div className="flex justify-end gap-2">
                  <button onClick={() => setReplyingId(null)} className="text-xs text-gray-500 font-bold px-3 py-1">
                    Cancelar
                  </button>
                  <button
                    onClick={() => handleSendReply(r.id)}
                    className="bg-emerald-600 text-white font-bold text-xs px-4 py-1.5 rounded-lg hover:bg-emerald-700"
                  >
                    Publicar Resposta
                  </button>
                </div>
              </div>
            )}
          </div>
        )))}
      </div>
    </div>
  );
};
