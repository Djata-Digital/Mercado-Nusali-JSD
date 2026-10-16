/**
 * Ajuste rápido de estoque (+/−) na lista de anúncios do vendedor — PURO.
 *
 * A coluna "Estoque" da lista mostra o DISPONÍVEL (em estoque − reservado por pedidos em andamento), mas o servidor guarda o físico (quantityOnHand).
 * O ajuste antigo somava ±1 ao DISPONÍVEL e gravava o resultado como físico: o estoque reservado era "perdido" (físico 10, reservado 4, disponível 6:
 * "+1" gravava 7 em vez de 11) e, com muitas reservas, "−1" chegava a ser recusado ou a gravar um valor errado. Aqui o novo físico parte SEMPRE do
 * físico real, nunca fica abaixo do reservado e nunca fica negativo.
 */
export interface QuickStockSource { quantityOnHand?: number | null; quantityReserved?: number | null; stock?: number | null; availableStock?: number | null }

export type QuickStockPlan =
  | { ok: true; newOnHand: number; onHand: number; reserved: number }
  | { ok: false; code: 'INVALID' | 'NEGATIVE' | 'BELOW_RESERVED'; message: string };

const toInt = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? Math.floor(v) : null);

export function planQuickStockChange(p: QuickStockSource, delta: number): QuickStockPlan {
  const d = toInt(delta);
  if (d === null || d === 0) return { ok: false, code: 'INVALID', message: 'Ajuste de estoque inválido.' };
  const reserved = Math.max(0, toInt(p.quantityReserved) ?? 0);
  // físico real; sem ele (dado legado) reconstrói a partir do disponível + reservado — nunca trata o disponível como se fosse o físico
  const onHand = toInt(p.quantityOnHand) ?? (toInt(p.availableStock) ?? toInt(p.stock) ?? 0) + reserved;
  const next = onHand + d;
  if (next < 0) return { ok: false, code: 'NEGATIVE', message: 'O estoque já está em zero.' };
  if (next < reserved) {
    return { ok: false, code: 'BELOW_RESERVED', message: `Há ${reserved} unidade(s) reservada(s) por pedidos em andamento; o estoque não pode ficar abaixo disso.` };
  }
  return { ok: true, newOnHand: next, onHand, reserved };
}

/** Mensagem do servidor → texto para o vendedor (remove o prefixo técnico "CODIGO: " e traduz o caso de produto com variações). */
export function quickStockErrorMessage(raw: unknown): string {
  const text = typeof raw === 'string' ? raw.trim() : '';
  if (!text) return 'Não foi possível alterar o estoque. Tente novamente.';
  if (/^VARIANT_REQUIRED/.test(text)) return 'Este produto tem variações: o estoque é informado por variação. Abra a edição do produto para ajustar cada uma.';
  return text.replace(/^[A-Z][A-Z0-9_]{2,}:\s*/, '');
}
