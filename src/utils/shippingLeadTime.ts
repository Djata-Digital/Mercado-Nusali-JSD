/**
 * Texto do PRAZO ESTIMADO de entrega (dias), igual no seletor, no resumo do checkout e no painel. Estimativa, nunca garantia: só mostra o
 * que o administrador configurou para a rota+serviço; sem configuração mostra "Prazo a confirmar" — nunca inventa prazo nem calcula datas
 * (não há regra definida de dias úteis, feriados ou horário de expedição).
 */
export interface LeadTimeView { minDays: number; maxDays: number }

export const LEAD_TIME_UNCONFIRMED = 'Prazo a confirmar';
export const LEAD_TIME_DISCLAIMER = 'Os prazos são estimativas e não garantem a data de entrega.';

const isValid = (lt?: Partial<LeadTimeView> | null): lt is LeadTimeView =>
  !!lt && Number.isInteger(lt.minDays) && Number.isInteger(lt.maxDays) && (lt.minDays as number) >= 1 && (lt.maxDays as number) >= (lt.minDays as number);

/** "2 a 4 dias", "3 dias", "1 dia" ou "Prazo a confirmar" (null/ausente/inválido). */
export function describeLeadTime(lt?: Partial<LeadTimeView> | null): string {
  if (!isValid(lt)) return LEAD_TIME_UNCONFIRMED;
  if (lt.minDays === lt.maxDays) return `${lt.minDays} ${lt.minDays === 1 ? 'dia' : 'dias'}`;
  return `${lt.minDays} a ${lt.maxDays} dias`;
}

/** Linha completa para o cliente: "Prazo estimado: 2 a 4 dias" ou "Prazo a confirmar". */
export function leadTimeLine(lt?: Partial<LeadTimeView> | null): string {
  return isValid(lt) ? `Prazo estimado: ${describeLeadTime(lt)}` : LEAD_TIME_UNCONFIRMED;
}

/** Validação do formulário do painel (o backend revalida). null = ok. */
export function validateLeadTimeForm(min: string, max: string): string | null {
  if (min.trim() === '' || max.trim() === '') return 'Preencha o prazo mínimo e o prazo máximo, em dias.';
  const a = Number(min), b = Number(max);
  if (!Number.isInteger(a) || !Number.isInteger(b)) return 'Use apenas números inteiros de dias.';
  if (a < 1 || b < 1) return 'Os prazos devem ser de pelo menos 1 dia.';
  if (a > b) return 'O prazo mínimo não pode ser maior que o prazo máximo.';
  if (b > 365) return 'O prazo máximo não pode passar de 365 dias.';
  return null;
}

/** Erro do backend ("CODIGO: texto") → texto claro. */
export function leadTimeErrorMessage(raw?: string | null): string {
  const text = String(raw || '').trim();
  if (!text) return 'Não foi possível salvar o prazo. Tente novamente.';
  return text.replace(/^[A-Z][A-Z0-9_]{3,}:\s*/, '');
}
