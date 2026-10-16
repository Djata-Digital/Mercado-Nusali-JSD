/**
 * Regra PURA de "voltar ao topo" ao navegar. Antes, abrir um produto no meio de uma listagem longa mantinha a posição de rolagem da lista e a página
 * do produto abria no meio. Agora toda navegação NOVA (PUSH/REPLACE) para OUTRA rota abre no topo; não mexe em:
 *  - a primeira carga (o navegador cuida),
 *  - voltar/avançar (POP): deixa a restauração de rolagem do navegador funcionar,
 *  - mudanças só de query/estado na mesma rota (filtros, ordenação, paginação — a paginação já rola sozinha),
 *  - links com âncora (#...).
 */
export type NavigationKind = 'PUSH' | 'POP' | 'REPLACE';

export function shouldScrollToTop(
  prev: { pathname: string } | null,
  next: { pathname: string; hash?: string },
  navType: NavigationKind,
): boolean {
  if (!prev) return false;
  if (next.hash) return false;
  if (navType === 'POP') return false;
  return prev.pathname !== next.pathname;
}
