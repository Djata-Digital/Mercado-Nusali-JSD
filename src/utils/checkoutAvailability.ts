/**
 * Países cujo checkout online AINDA NÃO está liberado ao público.
 *
 * Guiné-Bissau: as opções de entrega (geografia e tarifas de frete) e de pagamento (Orange Money/TeleTaku, que
 * dependem de contrato com as operadoras) ainda estão em preparação. Enquanto isso o comprador pode criar conta,
 * navegar e montar o carrinho, mas NÃO avança para a criação do pedido — o backend continua barrando por conta
 * própria (OrderService.createOrderFromCart), isto só evita que o comprador chegue a um erro técnico.
 *
 * Para liberar a compra em um país: remover o código daqui (nenhuma outra mudança é necessária no checkout).
 */
export const ONLINE_CHECKOUT_UNAVAILABLE_COUNTRIES: ReadonlySet<string> = new Set(['GW']);

export function isOnlineCheckoutAvailable(countryCode: string | null | undefined): boolean {
  if (!countryCode) return true;
  return !ONLINE_CHECKOUT_UNAVAILABLE_COUNTRIES.has(String(countryCode).trim().toUpperCase());
}
