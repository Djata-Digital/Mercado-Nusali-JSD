/**
 * Aritmética decimal segura para o ledger financeiro (Fase 5A).
 *
 * Por que não Number/parseFloat: ponto flutuante binário não representa exatamente
 * a maioria dos decimais (0.1 + 0.2 !== 0.3 em IEEE-754) — inaceitável quando a
 * regra é "débito tem que ser exatamente igual a crédito". Este módulo nunca faz
 * uma soma/comparação financeira em `number`; tudo passa por BigInt em unidades
 * fixas de 1e-6 ("micros"), a mesma escala da coluna `numeric(18,6)` do Postgres.
 *
 * Por que não uma lib como decimal.js: a soma/subtração/comparação que o ledger
 * precisa é inteira em BigInt assim que a string é parseada — não há divisão,
 * arredondamento ou multiplicação decimal envolvidos neste módulo, então BigInt
 * nativo resolve sem adicionar uma dependência nova a um caminho crítico de
 * dinheiro (menos superfície de supply-chain, não mais).
 *
 * Escala fixa (6 casas) em vez de assumir 2: nem toda moeda tem 2 casas decimais
 * de minor unit (ex.: JPY tem 0, algumas moedas/contextos usam mais) — 6 casas
 * cobre com folga sem precisar saber a priori quantas casas cada moeda usa. A
 * decisão de quantas casas EXIBIR para uma moeda específica é responsabilidade da
 * camada de apresentação, não deste módulo.
 */

const SCALE = 6;
const SCALE_FACTOR = 10n ** BigInt(SCALE);

const DECIMAL_STRING_RE = /^-?\d+(\.\d+)?$/;

export class InvalidDecimalError extends Error {
  constructor(value: unknown) {
    super(`Valor decimal inválido para lançamento financeiro: ${JSON.stringify(value)}`);
    this.name = 'InvalidDecimalError';
  }
}

/** Converte uma string decimal (ex.: "120.50", "0.000001", "10") em micros (BigInt). */
export function toMicros(value: string | number): bigint {
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new InvalidDecimalError(value);
    // Aceito number apenas como conveniência de chamada; convertido via string para
    // não herdar erro de representação binária antes do parse.
    value = String(value);
  }

  const trimmed = value.trim();
  if (!DECIMAL_STRING_RE.test(trimmed)) {
    throw new InvalidDecimalError(value);
  }

  const negative = trimmed.startsWith('-');
  const unsigned = negative ? trimmed.slice(1) : trimmed;
  const [intPart, fracPartRaw = ''] = unsigned.split('.');
  if (fracPartRaw.length > SCALE) {
    throw new InvalidDecimalError(`${value} tem mais de ${SCALE} casas decimais, além da precisão suportada`);
  }
  const fracPart = fracPartRaw.padEnd(SCALE, '0');

  const micros = BigInt(intPart || '0') * SCALE_FACTOR + BigInt(fracPart || '0');
  return negative ? -micros : micros;
}

/** Converte micros (BigInt) de volta para uma string decimal com até 6 casas, sem zeros à direita além do necessário. */
export function fromMicros(micros: bigint): string {
  const negative = micros < 0n;
  const abs = negative ? -micros : micros;
  const intPart = abs / SCALE_FACTOR;
  const fracPart = abs % SCALE_FACTOR;
  const fracStr = fracPart.toString().padStart(SCALE, '0').replace(/0+$/, '');
  const sign = negative ? '-' : '';
  return fracStr ? `${sign}${intPart}.${fracStr}` : `${sign}${intPart}`;
}

/** Formata micros com exatamente `digits` casas decimais (uso: exibição, nunca contabilidade). */
export function formatMicros(micros: bigint, digits = 2): string {
  const negative = micros < 0n;
  const abs = negative ? -micros : micros;
  const intPart = abs / SCALE_FACTOR;
  const fracPart = abs % SCALE_FACTOR;
  const fracStr = fracPart.toString().padStart(SCALE, '0').slice(0, digits).padEnd(digits, '0');
  const sign = negative ? '-' : '';
  return digits > 0 ? `${sign}${intPart}.${fracStr}` : `${sign}${intPart}`;
}

export function addMicros(a: bigint, b: bigint): bigint {
  return a + b;
}

export function subMicros(a: bigint, b: bigint): bigint {
  return a - b;
}

export function isPositiveMicros(value: bigint): boolean {
  return value > 0n;
}

export function isZeroMicros(value: bigint): boolean {
  return value === 0n;
}

/**
 * Soma uma lista de lançamentos (direção + valor) por moeda e retorna, para cada
 * moeda, o saldo líquido em micros: positivo = mais débito que crédito, negativo =
 * mais crédito que débito, zero = balanceado. Uma transaction contábil só pode ser
 * POSTED se TODAS as moedas presentes derem zero aqui.
 */
export function netBalanceByCurrency(
  entries: Array<{ direction: 'DEBIT' | 'CREDIT'; amount: string; currency: string }>
): Map<string, bigint> {
  const totals = new Map<string, bigint>();
  for (const entry of entries) {
    const micros = toMicros(entry.amount);
    if (!isPositiveMicros(micros)) {
      throw new InvalidDecimalError(`amount de lançamento deve ser > 0, recebido "${entry.amount}"`);
    }
    const signed = entry.direction === 'DEBIT' ? micros : -micros;
    totals.set(entry.currency, addMicros(totals.get(entry.currency) ?? 0n, signed));
  }
  return totals;
}
