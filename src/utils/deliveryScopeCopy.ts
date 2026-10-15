/**
 * Textos das listas vazias do catálogo público: o catálogo mostra só o que pode ser entregue no país de entrega selecionado, então "vazio"
 * pode significar "há produtos, mas não entregam aí". Evita a mensagem enganosa "ainda não há produtos publicados".
 */
export const DELIVERY_SCOPE_HINT = 'Mostramos apenas os produtos que podem ser entregues no país selecionado. Altere o país de entrega para ver outros produtos.';

export function noDeliverableProductsMessage(countryName?: string | null): string {
  return countryName ? `Ainda não há produtos com entrega para ${countryName}.` : 'Ainda não há produtos com entrega para o país selecionado.';
}
