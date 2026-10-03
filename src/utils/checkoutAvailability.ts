/**
 * Países cujo checkout online está OFICIALMENTE liberado ao público. Bloqueio por padrão: qualquer país que não esteja
 * nesta lista (inclusive país desconhecido, vazio ou novo) NÃO chega à criação de pedido/pagamento.
 *
 * Soft launch: a lista é VAZIA — nenhum mercado tem checkout. As opções de entrega (geografia e tarifas de frete) e de
 * pagamento (Orange Money/TeleTaku dependem de contrato com as operadoras; PIX/Asaas só existe para o Brasil) ainda estão em
 * preparação. O comprador pode criar conta, navegar e montar o carrinho, mas não avança. O backend continua barrando por
 * conta própria (OrderService.createOrderFromCart); isto só evita que o comprador chegue a uma tela sem saída.
 *
 * Para liberar um país: adicionar o código dele (ex.: 'GW') a CHECKOUT_ENABLED_COUNTRIES, depois de configurar a geografia de
 * frete e os meios de pagamento reais desse país. Nenhuma outra mudança é necessária no checkout.
 */
export const CHECKOUT_ENABLED_COUNTRIES: readonly string[] = [];

export function isOnlineCheckoutAvailable(
  countryCode: string | null | undefined,
  enabledCountries: readonly string[] = CHECKOUT_ENABLED_COUNTRIES,
): boolean {
  if (!countryCode) return false;
  const code = String(countryCode).trim().toUpperCase();
  if (!code) return false;
  return enabledCountries.some((c) => String(c).trim().toUpperCase() === code);
}
