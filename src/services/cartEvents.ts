/**
 * Aviso LEVE de "o carrinho mudou": cada `useCart()` guarda a PRÓPRIA cópia do carrinho (o cabeçalho, o cartão de produto, a página do carrinho...), então
 * adicionar um item num lugar deixava o contador do cabeçalho velho até recarregar. Quem muda o carrinho chama `emitCartUpdated(itens)` e quem mostra o
 * carrinho (useCart) assina. Sem estado global novo, sem rede, sem efeito se ninguém assinar.
 */
import type { CartItem } from '../types';

type Listener = (items: CartItem[]) => void;
const listeners = new Set<Listener>();

export function subscribeCartUpdates(listener: Listener): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

export function emitCartUpdated(items: CartItem[]): void {
  for (const l of Array.from(listeners)) {
    try { l(items); } catch { /* um assinante com erro nunca impede os outros */ }
  }
}
