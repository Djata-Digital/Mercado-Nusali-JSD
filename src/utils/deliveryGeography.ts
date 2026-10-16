/**
 * Mensagens da escolha de destino (Região/Setor) — puras. Uma falha ao carregar nunca vira uma lista vazia silenciosa: a pessoa vê o que aconteceu
 * e pode tentar de novo. Nunca repassa texto do servidor.
 */
export function geographyLoadMessage(kind: 'regions' | 'sectors', state: 'empty' | 'error', serverCode?: string | null): string {
  if (state === 'empty') {
    return kind === 'regions'
      ? 'Ainda não há regiões de entrega cadastradas para este país.'
      : 'Ainda não há setores de entrega cadastrados para esta região.';
  }
  // limite de consultas por minuto (429): mensagem própria — não é falha de conexão
  if (serverCode === 'RATE_LIMIT_EXCEEDED') return 'Muitas consultas seguidas. Aguarde um instante e tente novamente.';
  // o texto do servidor nunca é repassado (pode ser técnico); a pessoa vê sempre uma mensagem curta e acionável
  const what = kind === 'regions' ? 'as regiões de entrega' : 'os setores desta região';
  return `Não foi possível carregar ${what} agora. Verifique sua conexão e tente novamente.`;
}
