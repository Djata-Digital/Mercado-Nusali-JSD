import React, { useState, useEffect } from 'react';
import {
  X,
  Copy,
  Check,
  Share2,
  QrCode,
  Smartphone,
  ExternalLink,
  Send,
  MessageCircle,
} from 'lucide-react';
import { Product } from '../types';
import { formatCurrency } from '../utils/currencyUtils';

interface ProductShareModalProps {
  isOpen: boolean;
  onClose: () => void;
  product: Product;
}

export const ProductShareModal: React.FC<ProductShareModalProps> = ({
  isOpen,
  onClose,
  product,
}) => {
  const [copied, setCopied] = useState(false);
  const [showQrCode, setShowQrCode] = useState(false);
  const [shareUrl, setShareUrl] = useState('');

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const origin = window.location.origin;
      setShareUrl(`${origin}/products/${product.id}`);
    }
  }, [product.id, isOpen]);

  if (!isOpen) return null;

  const priceText = formatCurrency(product.price, product.currency);
  const shareTitle = `${product.title} - Mercado Nusali`;
  const shareMessage = `Confira "${product.title}" no Mercado Nusali por apenas ${priceText}! Envio rápido para os países da CPLP:`;

  const handleCopyLink = async () => {
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(shareUrl);
      } else {
        const textarea = document.createElement('textarea');
        textarea.value = shareUrl;
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand('copy');
        document.body.removeChild(textarea);
      }
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    }
  };

  const handleNativeShare = async () => {
    if (navigator.share) {
      try {
        await navigator.share({
          title: shareTitle,
          text: `${shareMessage} ${shareUrl}`,
          url: shareUrl,
        });
        onClose();
      } catch (err) {
        // User cancelled or share failed
      }
    } else {
      handleCopyLink();
    }
  };

  // Pre-configured sharing URLs
  const encodedUrl = encodeURIComponent(shareUrl);
  const encodedText = encodeURIComponent(`${shareMessage}\n${shareUrl}`);

  const shareChannels = [
    {
      name: 'WhatsApp',
      icon: (
        <svg className="w-5 h-5 fill-current" viewBox="0 0 24 24">
          <path d="M12.031 6.172c-3.181 0-5.767 2.586-5.768 5.766-.001 1.298.38 2.27 1.019 3.287l-.582 2.128 2.182-.573c.978.58 1.911.928 3.145.929 3.178 0 5.767-2.587 5.768-5.766.001-3.187-2.575-5.771-5.764-5.771zm3.392 8.244c-.144.405-.837.774-1.17.824-.299.045-.677.063-1.092-.069-.252-.08-.575-.187-.988-.365-1.739-.751-2.874-2.502-2.961-2.617-.087-.116-.708-.94-.708-1.793s.448-1.273.607-1.446c.159-.173.346-.217.462-.217l.332.006c.106.005.249-.04.39.298.144.347.491 1.2.534 1.287.043.087.072.188.014.303-.058.116-.087.188-.173.289l-.26.303c-.086.086-.177.18-.076.353.101.173.447.737.959 1.194.66.588 1.217.771 1.39.857.173.087.275.072.376-.043.101-.116.433-.506.549-.68.116-.173.231-.144.39-.086s1.011.477 1.184.564.289.13.332.202c.043.072.043.419-.101.824z" />
          <path d="M12 2C6.477 2 2 6.477 2 12c0 1.89.525 3.66 1.438 5.168L2 22l4.978-1.393A9.954 9.954 0 0 0 12 22c5.523 0 10-4.477 10-10S17.523 2 12 2zm0 18.167c-1.583 0-3.084-.46-4.359-1.258l-.312-.194-2.956.827.842-2.883-.213-.339A8.136 8.136 0 0 1 3.833 12c0-4.503 3.664-8.167 8.167-8.167 4.503 0 8.167 3.664 8.167 8.167 0 4.503-3.664 8.167-8.167 8.167z" />
        </svg>
      ),
      bg: 'bg-emerald-50 text-emerald-600 hover:bg-emerald-600 hover:text-white border-emerald-200',
      action: () => {
        window.open(`https://api.whatsapp.com/send?text=${encodedText}`, '_blank');
      },
    },
    {
      name: 'Telegram',
      icon: <Send className="w-5 h-5" />,
      bg: 'bg-sky-50 text-sky-600 hover:bg-sky-500 hover:text-white border-sky-200',
      action: () => {
        window.open(`https://t.me/share/url?url=${encodedUrl}&text=${encodeURIComponent(shareMessage)}`, '_blank');
      },
    },
    {
      name: 'Facebook',
      icon: (
        <svg className="w-5 h-5 fill-current" viewBox="0 0 24 24">
          <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
        </svg>
      ),
      bg: 'bg-blue-50 text-blue-600 hover:bg-blue-600 hover:text-white border-blue-200',
      action: () => {
        window.open(`https://www.facebook.com/sharer/sharer.php?u=${encodedUrl}`, '_blank');
      },
    },
    {
      name: 'X (Twitter)',
      icon: (
        <svg className="w-5 h-5 fill-current" viewBox="0 0 24 24">
          <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
        </svg>
      ),
      bg: 'bg-slate-50 text-slate-800 hover:bg-slate-900 hover:text-white border-slate-200',
      action: () => {
        window.open(`https://twitter.com/intent/tweet?text=${encodedText}`, '_blank');
      },
    },
    {
      name: 'Email',
      icon: <MessageCircle className="w-5 h-5" />,
      bg: 'bg-amber-50 text-amber-700 hover:bg-amber-600 hover:text-white border-amber-200',
      action: () => {
        window.open(`mailto:?subject=${encodeURIComponent(shareTitle)}&body=${encodedText}`, '_self');
      },
    },
  ];

  return (
    <div
      className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 animate-fadeIn"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl max-w-md w-full shadow-2xl border border-gray-200 overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-100 bg-gray-50/80">
          <div className="flex items-center gap-2 text-gray-900 font-bold text-base">
            <div className="p-2 bg-blue-50 text-blue-600 rounded-xl border border-blue-100">
              <Share2 className="w-5 h-5" />
            </div>
            <span>Partilhar Produto</span>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-gray-400 hover:text-gray-700 hover:bg-gray-200 rounded-lg transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Product mini card preview */}
        <div className="p-4 border-b border-gray-100 flex items-center gap-3 bg-white">
          <img
            src={product.image}
            alt={product.title}
            className="w-16 h-16 rounded-xl object-contain border border-gray-200 p-1 bg-gray-50 shrink-0"
          />
          <div className="min-w-0 flex-1">
            <h4 className="font-bold text-gray-900 text-xs sm:text-sm line-clamp-2">
              {product.title}
            </h4>
            <div className="flex items-center gap-2 mt-1">
              <span className="text-emerald-700 font-bold text-sm">{priceText}</span>
              {product.freeShipping && (
                <span className="bg-emerald-100 text-emerald-800 text-[10px] font-bold px-1.5 py-0.2 rounded">
                  Frete Grátis
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Body Content */}
        <div className="p-5 space-y-5">
          {/* Quick Copy Link Box */}
          <div className="space-y-1.5">
            <label className="block text-xs font-bold text-gray-700">Link Direto do Produto</label>
            <div className="flex items-center gap-2 bg-gray-50 border border-gray-300 rounded-xl p-1.5 focus-within:border-blue-500 focus-within:ring-2 focus-within:ring-blue-100 transition">
              <input
                type="text"
                readOnly
                value={shareUrl}
                className="w-full bg-transparent px-2 text-xs text-gray-700 font-mono outline-none select-all"
              />
              <button
                onClick={handleCopyLink}
                className={`px-3 py-2 rounded-lg font-bold text-xs flex items-center gap-1.5 transition shrink-0 ${
                  copied
                    ? 'bg-emerald-600 text-white shadow-sm'
                    : 'bg-blue-600 hover:bg-blue-700 text-white shadow-sm hover:shadow'
                }`}
              >
                {copied ? (
                  <>
                    <Check className="w-4 h-4" />
                    <span>Copiado!</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-4 h-4" />
                    <span>Copiar Link</span>
                  </>
                )}
              </button>
            </div>
            {copied && (
              <p className="text-[11px] font-semibold text-emerald-600 flex items-center gap-1 mt-1 animate-fadeIn">
                <Check className="w-3.5 h-3.5" /> Link copiado para a área de transferência!
              </p>
            )}
          </div>

          {/* Social Channels */}
          <div>
            <label className="block text-xs font-bold text-gray-700 mb-2">
              Compartilhar nas Redes Sociais & Mensageiros
            </label>
            <div className="grid grid-cols-5 gap-2">
              {shareChannels.map((channel) => (
                <button
                  key={channel.name}
                  onClick={channel.action}
                  className={`flex flex-col items-center justify-center p-2.5 rounded-xl border transition group cursor-pointer ${channel.bg}`}
                  title={`Partilhar no ${channel.name}`}
                >
                  <div className="transition-transform group-hover:scale-110 mb-1">
                    {channel.icon}
                  </div>
                  <span className="text-[10px] font-bold truncate max-w-full">{channel.name}</span>
                </button>
              ))}
            </div>
          </div>

          {/* QR Code & Mobile Native Share */}
          <div className="pt-2 border-t border-gray-100 flex items-center justify-between gap-2">
            <button
              onClick={() => setShowQrCode(!showQrCode)}
              className="flex-1 py-2 px-3 rounded-xl border border-gray-300 hover:bg-gray-50 text-gray-700 text-xs font-bold flex items-center justify-center gap-1.5 transition"
            >
              <QrCode className="w-4 h-4 text-gray-600" />
              <span>{showQrCode ? 'Ocultar QR Code' : 'Escanear QR Code'}</span>
            </button>

            {typeof navigator !== 'undefined' && 'share' in navigator && (
              <button
                onClick={handleNativeShare}
                className="flex-1 py-2 px-3 rounded-xl bg-gray-900 hover:bg-black text-white text-xs font-bold flex items-center justify-center gap-1.5 transition"
              >
                <Smartphone className="w-4 h-4 text-emerald-400" />
                <span>Mais Opções</span>
              </button>
            )}
          </div>

          {/* QR Code Display section */}
          {showQrCode && (
            <div className="p-4 bg-gray-50 rounded-xl border border-gray-200 flex flex-col items-center text-center space-y-2 animate-fadeIn">
              <span className="text-xs font-bold text-gray-800">
                Aponte a câmara do telemóvel para abrir o produto
              </span>
              <div className="p-3 bg-white rounded-xl shadow-xs border border-gray-200">
                {/* SVG QR Code */}
                <img
                  src={`https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${encodeURIComponent(
                    shareUrl
                  )}`}
                  alt="QR Code do Produto"
                  className="w-36 h-36"
                />
              </div>
              <span className="text-[10px] text-gray-500 font-mono">
                {product.title.substring(0, 30)}...
              </span>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-3 bg-gray-50 border-t border-gray-100 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-1.5 bg-gray-200 hover:bg-gray-300 text-gray-700 font-bold rounded-lg text-xs transition"
          >
            Fechar
          </button>
        </div>
      </div>
    </div>
  );
};
