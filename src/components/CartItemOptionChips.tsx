import React from 'react';
import type { CartItem } from '../types';

type Props = { item: Pick<CartItem, 'selectedAxes' | 'selectedColor' | 'selectedSize'> };

/**
 * P2 — opções escolhidas de um item do carrinho. Com o retrato dos eixos (selectedAxes) cada opção aparece com o NOME REAL do eixo
 * (Cor, Capacidade, Voltagem…); item antigo (sem retrato) cai no formato de sempre (Cor / Tamanho). Só apresentação: a identidade da
 * variação é o id real guardado no item.
 */
export const CartItemOptionChips: React.FC<Props> = ({ item }) => {
  if (item.selectedAxes && item.selectedAxes.length > 0) {
    return (
      <>
        {item.selectedAxes.map((ax) => (
          <span key={`${ax.key}:${ax.value}`} data-testid="cart-axis-chip" className="bg-gray-100 text-gray-800 text-[11px] font-medium px-2 py-0.5 rounded-md border border-gray-200">
            {ax.label}: <strong className="text-gray-900">{ax.value}</strong>
          </span>
        ))}
      </>
    );
  }
  return (
    <>
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
    </>
  );
};

export default CartItemOptionChips;
