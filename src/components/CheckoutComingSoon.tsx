import React from 'react';
import { ShoppingBag } from 'lucide-react';

interface CheckoutComingSoonProps {
  onContinueShopping: () => void;
  /** País de entrega do checkout. Guiné-Bissau mantém o texto validado no soft launch; os demais usam o texto genérico. */
  countryCode?: string;
}

/** Aviso exibido no lugar do checkout enquanto as compras online do país ainda não foram liberadas (ver utils/checkoutAvailability.ts). */
export const CheckoutComingSoon: React.FC<CheckoutComingSoonProps> = ({ onContinueShopping, countryCode }) => {
  const isGuineaBissau = String(countryCode || '').trim().toUpperCase() === 'GW';
  return (
    <div className="max-w-2xl mx-auto px-4 py-12">
      <div
        role="status"
        className="bg-white rounded-2xl border border-gray-200 shadow-xs p-8 text-center space-y-4"
      >
        <div className="w-16 h-16 bg-emerald-50 text-emerald-700 rounded-full flex items-center justify-center mx-auto">
          <ShoppingBag className="w-8 h-8" />
        </div>
        <h1 className="text-xl font-black text-gray-900">Compras online em breve</h1>
        {isGuineaBissau ? (
          <p className="text-sm text-gray-600 leading-relaxed">
            Você já pode criar sua conta, explorar produtos e adicionar itens ao carrinho. Estamos preparando as opções de
            entrega e pagamento para a Guiné-Bissau. Em breve você poderá finalizar suas compras diretamente no Mercado
            Nusali.
          </p>
        ) : (
          <p className="text-sm text-gray-600 leading-relaxed">
            O Mercado Nusali já está aberto para cadastro, publicação de produtos e exploração do catálogo. A finalização
            de compras para o seu país será liberada em breve.
          </p>
        )}
        <button
          type="button"
          onClick={onContinueShopping}
          className="bg-emerald-600 text-white font-bold px-6 py-2.5 rounded-xl text-sm hover:bg-emerald-700 transition cursor-pointer"
        >
          Continuar comprando
        </button>
      </div>
    </div>
  );
};
