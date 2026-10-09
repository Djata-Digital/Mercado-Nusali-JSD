/**
 * FASE 8C.1 — opção "Outro" COM especificação estruturada (compartilhado entre cliente e servidor; puro).
 *
 * Problema: um select obrigatório ganha a saída "Outro", mas "Outro" sozinho não diz nada ao comprador. A especificação precisa viver no
 * ATRIBUTO (não no título/descrição) e sem mudar o esquema do banco.
 *
 * Formato de transporte (compatível com tudo que já trafega texto): "Outro: Fibra de bambu".
 *   - o valor tipado continua sendo a OPÇÃO ("Outro") em product_attribute_values.option_value — filtros, "opções em uso" e a lista da
 *     definição continuam corretos;
 *   - a especificação fica em UMA segunda linha do mesmo atributo (value_text), permitida pelo índice único (produto, atributo, opção) e
 *     pelo CHECK de um valor por linha (a linha de texto tem option_value nulo);
 *   - a ficha pública mostra só a especificação ("Material: Fibra de bambu");
 *   - na edição, o valor volta composto ("Outro: Fibra de bambu") e o formulário o separa de novo.
 *
 * Regra: opções da família "Outro/Outra/Outros/Outras" EXIGEM especificação (atributo obrigatório ou opcional — "Outro" sem dizer o quê
 * não informa nada). "Não se aplica" não exige. Valores antigos "Outro" sem especificação continuam válidos quando NÃO são alterados
 * (compatibilidade com produtos históricos); eixos de variante nunca usam este formato.
 */
export const OTHER_DETAIL_MIN = 2;
export const OTHER_DETAIL_MAX = 80;

/** Opção que exige especificação ("Outro", "Outra", "Outros", "Outras", "Outro tipo"...). "Não se aplica" fica de fora. */
export const OTHER_OPTION_PATTERN = /^(outro|outra|outros|outras)(\b|$)/i;
export const isOtherOption = (option: unknown): boolean => typeof option === 'string' && OTHER_OPTION_PATTERN.test(option.trim());

/** Sufixo da chave que guarda a especificação no estado do formulário (`material` -> `material__outro`). */
export const OTHER_FORM_SUFFIX = '__outro';
export const otherFormKey = (code: string): string => `${code}${OTHER_FORM_SUFFIX}`;

export function composeOtherValue(option: string, detail: string): string {
  return `${option.trim()}: ${detail.trim()}`;
}

export type OtherDetailReason = 'EMPTY' | 'TOO_SHORT' | 'TOO_LONG' | 'NO_LETTER_OR_DIGIT' | 'SAME_AS_OPTION';
/** (sem união discriminada: o projeto roda sem strictNullChecks, onde `ok` não estreita o tipo) */
export interface OtherDetailResult { ok: boolean; value?: string; reason?: OtherDetailReason }

/** Normaliza e valida a especificação: sem espaços nas pontas/duplicados, sem caracteres de controle, 2 a 80 caracteres, com letra ou dígito. */
export function normalizeOtherDetail(raw: unknown, optionLabel?: string): OtherDetailResult {
  if (typeof raw !== 'string' && typeof raw !== 'number') return { ok: false, reason: 'EMPTY' };
  // eslint-disable-next-line no-control-regex
  const v = String(raw).replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim();
  if (v === '') return { ok: false, reason: 'EMPTY' };
  if (v.length < OTHER_DETAIL_MIN) return { ok: false, reason: 'TOO_SHORT' };
  if (v.length > OTHER_DETAIL_MAX) return { ok: false, reason: 'TOO_LONG' };
  if (!/[\p{L}\p{N}]/u.test(v)) return { ok: false, reason: 'NO_LETTER_OR_DIGIT' };
  if (isOtherOption(v) && /^(outro|outra|outros|outras)$/i.test(v)) return { ok: false, reason: 'SAME_AS_OPTION' };
  if (optionLabel && v.toLowerCase() === optionLabel.trim().toLowerCase()) return { ok: false, reason: 'SAME_AS_OPTION' };
  return { ok: true, value: v };
}

export const otherDetailMessage = (attributeName: string, reason: OtherDetailReason = 'EMPTY'): string => {
  switch (reason) {
    case 'TOO_LONG': return `A especificação de "${attributeName}" pode ter no máximo ${OTHER_DETAIL_MAX} caracteres.`;
    case 'TOO_SHORT': return `A especificação de "${attributeName}" deve ter pelo menos ${OTHER_DETAIL_MIN} caracteres.`;
    case 'NO_LETTER_OR_DIGIT': return `A especificação de "${attributeName}" deve conter letras ou números.`;
    case 'SAME_AS_OPTION': return `Diga qual é a opção em "${attributeName}" (não repita só "Outro").`;
    default: return `Especifique sua opção em "${attributeName}".`;
  }
};

/**
 * Separa "Outro: detalhe". `options` é a lista da definição. Só reconhece quando a parte antes do primeiro ":" é uma opção da família "Outro";
 * se o texto inteiro já é uma opção (mesmo contendo ":"), não é composto. Devolve null caso contrário.
 */
export function splitOtherValue(options: readonly string[], raw: unknown, matchOption: (options: string[], raw: unknown) => string | null): { option: string; detail: string } | null {
  if (typeof raw !== 'string') return null;
  const text = raw.trim();
  if (matchOption([...options], text) !== null) return null;
  const idx = text.indexOf(':');
  if (idx <= 0) return null;
  const head = matchOption([...options], text.slice(0, idx));
  if (head === null || !isOtherOption(head)) return null;
  return { option: head, detail: text.slice(idx + 1).trim() };
}
