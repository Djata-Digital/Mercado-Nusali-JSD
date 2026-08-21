import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useCart } from '../hooks/useCart';
import { usePreferences } from '../context/PreferencesContext';
import { formatCurrency } from '../utils/currencyUtils';
import { Trash2, ShieldCheck, Truck, ArrowRight, Tag, ShoppingBag } from 'lucide-react';

export const CartView: React.FC = () => {
  const navigate = useNavigate();
  const { items: cart, removeItem: removeFromCart, updateQuantity: updateCartQuantity, total: cartTotal, totalCount: cartItemCount } = useCart();
  const { selectedCountry, formatPrice } = usePreferences();

  const userLocation = { city: 'Bissau', state: 'Guiné-Bissau', zipCode: '1000' };

  const [couponCode, setCouponCode] = useState('');
  const [appliedCoupon, setAppliedCoupon] = useState<string | null>(null);
  const [couponError, setCouponError] = useState('');

  const handleApplyCoupon = (e: React.FormEvent) => {
    e.preventDefault();
    if (couponCode.toUpperCase() === 'NUSALI10') {
      setAppliedCoupon('NUSALI10 (10% OFF)');
      setCouponError('');
    } else if (couponCode.toUpperCase() === 'FRETEGRATIS') {
      setAppliedCoupon('FRETEGRATIS (Frete Grátis)');
      setCouponError('');
    } else {
      setCouponError('Cupom inválido. Tente NUSALI10');
    }
  };

  const couponDiscount = appliedCoupon?.includes('NUSALI10') ? cartTotal * 0.10 : 0;
  const shippingFee = cart.length > 0 && cart.every((i) => i.product.shipping?.freeShipping) ? 0 : 29.90;
  const finalTotal = cartTotal + shippingFee - couponDiscount;

  if (cart.length === 0) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-16 text-center space-y-4">
        <div className="w-20 h-20 bg-yellow-100 rounded-full flex items-center justify-center mx-auto text-yellow-700">
          <ShoppingBag className="w-10 h-10" />
        </div>
        <h2 className="text-2xl font-extrabold text-gray-900">Seu carrinho está vazio</h2>
        <p className="text-sm text-gray-600 max-w-md mx-auto">
          Explore as melhores ofertas do dia e adicione os produtos desejados com frete grátis e entrega em até 24 horas!
        </p>
        <button
          onClick={() => navigate('/products')}
          className="bg-blue-600 hover:bg-blue-700 text-white font-extrabold px-8 py-3 rounded-md shadow-md text-sm transition"
        >
          Descobrir ofertas agora
        </button>
      </div>
    );
  }


  return (
    <div className="max-w-7xl mx-auto px-4 py-6 space-y-6">
      <h1 className="text-2xl font-black text-gray-900">Carrinho de Compras ({cartItemCount})</h1>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Cart Items List (8 cols) */}
        <div className="lg:col-span-8 space-y-4">
          <div className="bg-white rounded-lg border border-gray-200 divide-y divide-gray-200 shadow-xs">
            {/* Delivery banner */}
            <div className="p-4 bg-green-50 rounded-t-lg flex items-center justify-between text-xs text-green-800 font-semibold border-b border-green-100">
              <span className="flex items-center gap-2">
                <Truck className="w-4 h-4 text-green-600" />
                Entrega para {userLocation.city} - {userLocation.state} ({userLocation.zipCode})
              </span>
              <span className="text-green-700 font-bold">⚡ Chega amanhã!</span>
            </div>

            {/* Product row items */}
            {cart.map((item) => {
              const unitPrice = item.unitPriceOverride || item.product.price;
              const itemSubtotal = unitPrice * item.quantity;

              return (
                <div key={`${item.product.id}-${item.selectedColor || ''}-${item.selectedSize || ''}-${item.selectedKit?.id || ''}`} className="p-4 sm:p-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                  <div className="flex items-start gap-4 flex-1">
                    <img
                      src={item.product.image}
                      alt={item.product.title}
                      className="w-20 h-20 object-contain rounded-md bg-gray-50 p-1 border border-gray-200 shrink-0"
                    />
                    <div className="space-y-1">
                      <h3 className="text-sm font-bold text-gray-900 hover:text-blue-600 cursor-pointer line-clamp-2">
                        {item.product.title}
                      </h3>
                      <p className="text-xs text-gray-500">
                        Vendido por <strong className="text-gray-800">{item.product.seller?.name || 'Vendedor Oficial'}</strong>
                      </p>

                      {/* Kit, Color, Size badges */}
                      <div className="flex flex-wrap items-center gap-1.5 pt-1">
                        {item.selectedKit && (
                          <span className="bg-amber-100 text-amber-900 text-[11px] font-bold px-2 py-0.5 rounded-md border border-amber-300">
                            🎁 {item.selectedKit.title}
                          </span>
                        )}
                        {item.selectedColor && (
                          <span className="bg-gray-100 text-gray-800 text-[11px] font-medium px-2 py-0.5 rounded-md border border-gray-200">
                            Cor: <strong className="text-gray-900">{item.selectedColor}</strong>
                          </span>
                        )}
                        {item.selectedSize && (
                          <span className="bg-blue-50 text-blue-800 text-[11px] font-medium px-2 py-0.5 rounded-md border border-blue-200">
                            Tamanho: <strong className="text-blue-900">{item.selectedSize}</strong>
                          </span>
                        )}
                        {item.product.shipping?.isInternational && (
                          <span className="bg-indigo-50 text-indigo-800 text-[10px] font-bold px-1.5 py-0.5 rounded-md border border-indigo-200">
                            ✈️ Internacional ({item.product.shipping?.originCountry || 'Cross-Border'})
                          </span>
                        )}
                      </div>

                      {item.product.shipping?.freeShipping && (
                        <span className="inline-block text-[10px] font-extrabold text-green-700 bg-green-50 px-1.5 py-0.5 rounded-xs border border-green-200 mt-1">
                          ⚡ FRETE GRÁTIS
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Quantity & Price */}
                  <div className="flex items-center justify-between w-full sm:w-auto sm:justify-end gap-6 pt-2 sm:pt-0 border-t sm:border-none border-gray-100">
                    <div className="flex items-center border border-gray-300 rounded-md overflow-hidden bg-gray-50">
                      <button
                        onClick={() => updateCartQuantity(item.product.id, item.quantity - 1)}
                        className="px-2.5 py-1 text-gray-700 hover:bg-gray-200 font-bold"
                      >
                        -
                      </button>
                      <span className="px-3 py-1 text-xs font-bold text-gray-900">{item.quantity}</span>
                      <button
                        onClick={() => updateCartQuantity(item.product.id, item.quantity + 1)}
                        className="px-2.5 py-1 text-gray-700 hover:bg-gray-200 font-bold"
                      >
                        +
                      </button>
                    </div>

                    <div className="text-right">
                      {(() => {
                        const itemCurrency = item.product?.currency || (item as any).currency || 'XOF';
                        const subInfo = formatPrice(itemSubtotal, itemCurrency);
                        const unitInfo = formatPrice(unitPrice, itemCurrency);
                        return (
                          <>
                            <span className="text-base font-extrabold text-gray-900 block">
                              {subInfo.formatted}
                            </span>
                            <p className="text-[10px] text-gray-400">
                              {unitInfo.formatted} {item.selectedKit ? 'kit' : 'un.'}
                            </p>
                          </>
                        );
                      })()}
                    </div>

                    <button
                      onClick={() => removeFromCart(item.product.id)}
                      className="text-gray-400 hover:text-red-600 p-1 transition"
                      title="Excluir item"
                    >
                      <Trash2 className="w-5 h-5" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Coupon Input */}
          <div className="bg-white p-4 rounded-lg border border-gray-200 shadow-xs flex flex-col sm:flex-row items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-xs text-gray-700">
              <Tag className="w-4 h-4 text-emerald-600" />
              <span>Possui cupom de desconto? Use o cupom <strong className="text-emerald-700">NUSALI10</strong></span>
            </div>
            <form onSubmit={handleApplyCoupon} className="flex gap-2 w-full sm:w-auto">
              <input
                type="text"
                value={couponCode}
                onChange={(e) => setCouponCode(e.target.value)}
                placeholder="Código do cupom"
                className="px-3 py-1.5 text-xs border border-gray-300 rounded-md focus:outline-hidden focus:ring-1 focus:ring-blue-500 uppercase font-semibold"
              />
              <button
                type="submit"
                className="bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs px-4 py-1.5 rounded-md transition"
              >
                Aplicar
              </button>
            </form>
          </div>
          {couponError && <p className="text-xs text-red-600 font-medium pl-2">{couponError}</p>}
          {appliedCoupon && (
            <p className="text-xs text-green-700 font-bold pl-2">✓ Cupom {appliedCoupon} aplicado com sucesso!</p>
          )}
        </div>

        {/* Order Summary Sidebar (4 cols) */}
        <div className="lg:col-span-4 space-y-4">
          <div className="bg-white rounded-lg border border-gray-200 p-6 shadow-xs space-y-4">
            <h2 className="text-base font-bold text-gray-900 border-b border-gray-200 pb-3">
              Resumo da compra
            </h2>

            {(() => {
              const cartCurrency = cart[0]?.product?.currency || (cart[0] as any)?.currency || 'XOF';
              const cartTotalInfo = formatPrice(cartTotal, cartCurrency);
              const shippingFeeInfo = formatPrice(shippingFee, cartCurrency);
              const couponDiscountInfo = formatPrice(couponDiscount, cartCurrency);
              const finalTotalInfo = formatPrice(finalTotal, cartCurrency);

              return (
                <>
                  <div className="space-y-2 text-xs text-gray-700">
                    <div className="flex justify-between">
                      <span>Produtos ({cartItemCount}):</span>
                      <span className="font-semibold text-gray-900">
                        {cartTotalInfo.formatted}
                      </span>
                    </div>

                    <div className="flex justify-between">
                      <span>Frete Nusali Logística:</span>
                      {shippingFee === 0 ? (
                        <span className="font-extrabold text-green-700">GRÁTIS</span>
                      ) : (
                        <span className="font-semibold text-gray-900">
                          {shippingFeeInfo.formatted}
                        </span>
                      )}
                    </div>

                    {couponDiscount > 0 && (
                      <div className="flex justify-between text-green-700 font-bold">
                        <span>Desconto cupom:</span>
                        <span>- {couponDiscountInfo.formatted}</span>
                      </div>
                    )}
                  </div>

                  <div className="pt-3 border-t border-gray-200 flex flex-col gap-0.5">
                    <div className="flex justify-between items-baseline">
                      <span className="text-base font-bold text-gray-900">Total a pagar:</span>
                      <span className="text-2xl font-black text-gray-900">
                        {finalTotalInfo.formatted}
                      </span>
                    </div>
                    {finalTotalInfo.isConverted && (
                      <span className="text-[10px] text-gray-400 font-medium text-right">
                        Original do pedido: {finalTotalInfo.originalFormatted}
                      </span>
                    )}
                  </div>
                </>
              );
            })()}

            <button
              onClick={() => {
                navigate('/checkout');
                window.scrollTo({ top: 0, behavior: 'smooth' });
              }}
              className="w-full bg-blue-600 hover:bg-blue-700 text-white font-extrabold py-3 px-4 rounded-md shadow-md hover:shadow-lg transition flex items-center justify-center gap-2 text-sm"
            >
              <span>Continuar a compra</span>
              <ArrowRight className="w-4 h-4" />
            </button>

            <div className="flex items-center gap-2 text-[11px] text-gray-500 pt-2 border-t border-gray-100">
              <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>Compra 100% Protegida com Nusali Pay Escrow</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
