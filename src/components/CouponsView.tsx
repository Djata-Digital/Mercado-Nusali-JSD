import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Tag,
  Gift,
  CheckCircle2,
  Copy,
  Clock,
  Sparkles,
  ArrowRight,
  Percent,
  RefreshCw,
} from 'lucide-react';
import { usePreferences } from '../context/PreferencesContext';
import { BuyerNavHeader } from './BuyerNavHeader';
import { BuyerService, BuyerCoupon } from '../services/buyerService';

export const CouponsView: React.FC = () => {
  const navigate = useNavigate();
  const { showToast } = usePreferences();
  const [promoInput, setPromoInput] = useState('');
  const [coupons, setCoupons] = useState<BuyerCoupon[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isApplying, setIsApplying] = useState(false);

  const loadCoupons = async () => {
    setIsLoading(true);
    try {
      const res = await BuyerService.getCoupons();
      if (res.success && Array.isArray(res.data)) {
        setCoupons(res.data);
      }
    } catch (err) {
      console.error('Failed to load coupons:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadCoupons();
  }, []);

  const handleApplyPromoCode = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!promoInput.trim()) return;

    setIsApplying(true);
    try {
      const res = await BuyerService.validateCoupon(promoInput.trim());
      if (res.success) {
        showToast(res.message || `Cupom "${promoInput.toUpperCase()}" aplicado com sucesso!`);
        setPromoInput('');
        loadCoupons();
      } else {
        showToast(res.message || 'Cupom inválido ou expirado.');
      }
    } catch {
      showToast('Erro ao validar cupom.');
    } finally {
      setIsApplying(false);
    }
  };

  const handleClaimCoupon = async (id: string, code: string) => {
    try {
      const res = await BuyerService.claimCoupon(id, code);
      if (res.success) {
        setCoupons(prev => prev.map(c => c.id === id ? { ...c, isClaimed: true } : c));
        navigator.clipboard.writeText(code);
        showToast(`Cupom ${code} resgatado e copiado para a área de transferência!`);
      }
    } catch {
      showToast('Erro ao resgatar cupom.');
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 animate-fadeIn">
      <BuyerNavHeader />

      {/* Header Banner */}
      <div className="bg-gradient-to-r from-purple-950 via-indigo-900 to-blue-950 text-white rounded-2xl p-6 sm:p-8 shadow-xl mb-8">
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
          <div>
            <div className="inline-flex items-center gap-2 bg-yellow-400 text-purple-950 px-3 py-1 rounded-full text-xs font-black uppercase mb-3">
              <Tag className="w-3.5 h-3.5" /> Central de Ofertas & Vantagens
            </div>
            <h1 className="text-2xl sm:text-3xl font-black">Meus Cupons de Desconto</h1>
            <p className="text-xs text-gray-200 mt-1 max-w-xl">
              Aproveite descontos especiais em frete e produtos de todas as lojas credenciadas na Guiné-Bissau e CPLP.
            </p>
          </div>

          {/* Form Insert Coupon Code */}
          <form onSubmit={handleApplyPromoCode} className="w-full md:w-auto flex gap-2">
            <input
              type="text"
              value={promoInput}
              onChange={e => setPromoInput(e.target.value.toUpperCase())}
              placeholder="DIGITE O CUPOM"
              className="bg-white/10 border border-white/30 rounded-xl px-4 py-2.5 text-xs text-white placeholder-gray-400 font-mono tracking-wider uppercase focus:outline-hidden focus:ring-2 focus:ring-yellow-400"
            />
            <button
              type="submit"
              disabled={isApplying}
              className="bg-yellow-400 hover:bg-yellow-500 text-purple-950 font-black px-4 py-2.5 rounded-xl text-xs transition cursor-pointer shrink-0 flex items-center gap-1.5"
            >
              {isApplying ? <RefreshCw className="w-4 h-4 animate-spin" /> : 'Aplicar'}
            </button>
          </form>
        </div>
      </div>

      {/* Coupons Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {coupons.map((coupon) => (
          <div
            key={coupon.id}
            className={`bg-white rounded-2xl border transition overflow-hidden shadow-2xs flex flex-col justify-between ${
              coupon.isClaimed ? 'border-emerald-300' : 'border-gray-200 hover:border-purple-300'
            }`}
          >
            <div className="p-6">
              <div className="flex items-center justify-between gap-4 mb-4">
                <span className="bg-purple-100 text-purple-800 text-sm font-black px-3 py-1 rounded-xl">
                  {coupon.discount}
                </span>
                <span className="text-[10px] text-gray-400 font-bold flex items-center gap-1">
                  <Clock className="w-3 h-3" /> Válido até {coupon.validUntil}
                </span>
              </div>

              <div className="bg-gray-50 p-3 rounded-xl border border-dashed border-gray-300 flex items-center justify-between mb-4">
                <span className="font-mono font-black text-sm text-gray-800 tracking-wider">
                  {coupon.code}
                </span>
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(coupon.code);
                    showToast(`Código ${coupon.code} copiado!`);
                  }}
                  className="p-1.5 text-gray-400 hover:text-purple-600 rounded-lg hover:bg-purple-50 transition cursor-pointer"
                  title="Copiar código"
                >
                  <Copy className="w-4 h-4" />
                </button>
              </div>

              <p className="text-xs text-gray-600 leading-relaxed font-medium">
                {coupon.description}
              </p>
            </div>

            <div className="p-4 bg-gray-50/50 border-t border-gray-100 flex items-center justify-between">
              {coupon.isClaimed ? (
                <span className="text-xs font-bold text-emerald-600 flex items-center gap-1">
                  <CheckCircle2 className="w-4 h-4" /> Cupom Ativo na Conta
                </span>
              ) : (
                <button
                  onClick={() => handleClaimCoupon(coupon.id, coupon.code)}
                  className="bg-purple-600 hover:bg-purple-700 text-white font-bold px-4 py-2 rounded-xl text-xs transition cursor-pointer"
                >
                  Resgatar Cupom
                </button>
              )}

              <button
                onClick={() => navigate('/products')}
                className="text-xs font-bold text-gray-500 hover:text-purple-600 flex items-center gap-1 transition cursor-pointer"
              >
                Usar Agora <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
