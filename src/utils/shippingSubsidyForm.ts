/**
 * Regras puras do ecrã "Gestão de Subsídios de Frete" (Super Admin): leitura da percentagem digitada, textos e linhas do histórico. A validação que
 * VALE é a do servidor (validateShippingSubsidyUpdate); aqui só evita pedidos óbvios e mostra mensagens claras. A conta da simulação é a do servidor
 * (shippingSubsidyMath), importada, nunca uma segunda versão.
 */
import { validateNusaliPercent } from './shippingSubsidyMath';

/** Resultado achatado (ok + value + error) para estreitar sem depender de uniões discriminadas. */
export interface ParsedPercent { ok: boolean; value: number; error: string }

/** Texto digitado → percentagem. Aceita vírgula decimal ("12,5"). Vazio, texto, negativos, >100 e mais de 2 casas são recusados; "0" é ZERO. */
export function parsePercentInput(text: string): ParsedPercent {
  const t = String(text ?? '').trim().replace(',', '.');
  if (t === '') return { ok: false, value: 0, error: 'Informe a percentagem (0 a 100).' };
  if (!/^\d+(\.\d+)?$/.test(t)) return { ok: false, value: 0, error: 'Use apenas números (ex.: 20 ou 12,5).' };
  const v = validateNusaliPercent(Number(t));
  return 'value' in v ? { ok: true, value: v.value, error: '' } : { ok: false, value: 0, error: v.error };
}

export interface ConfigLike { enabled: boolean; percent: number; legacyDefaultMode?: string | null }

/** "Ativo: 20%" / "Desativado (0%)". */
export function describeConfigStatus(c: ConfigLike): string {
  return c.enabled && c.percent > 0 ? `Ativo: ${c.percent}%` : 'Desativado (0%)';
}

export function isLegacyFreeModeActive(c: Pick<ConfigLike, 'legacyDefaultMode'>): boolean {
  return c.legacyDefaultMode === 'MARKETPLACE_FREE_SHIPPING';
}

/** Linha curta do histórico: "Desativado (0%) → Ativo: 20%". */
export function describeChange(before: ConfigLike | null, after: ConfigLike | null, legacyModeChanged: boolean): string {
  const a = before ? describeConfigStatus(before) : '—';
  const b = after ? describeConfigStatus(after) : '—';
  return `${a} → ${b}${legacyModeChanged ? ' · modo legado (Nusali assume 100%) desativado' : ''}`;
}

/** Erro do servidor → texto claro. */
export function subsidyErrorMessage(code: string | undefined, message: string | undefined): string {
  switch (code) {
    case 'CONFIG_CHANGED': return 'Outra pessoa alterou esta configuração enquanto você editava. Os valores foram recarregados; confira e tente de novo.';
    case 'IMPACT_CONFIRMATION_REQUIRED': return 'Confirme o impacto financeiro antes de guardar.';
    case 'GLOBAL_ADMIN_REQUIRED': return 'Somente o Administrador Geral pode alterar o subsídio de frete.';
    case 'LEGACY_MODE_NOT_ACTIVE': return 'O modo legado já não está ativo. Recarregue a página.';
    default: return message || 'Não foi possível guardar. Tente novamente.';
  }
}
