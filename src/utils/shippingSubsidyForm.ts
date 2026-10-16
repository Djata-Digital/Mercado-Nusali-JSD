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

// ---------------------------------------------------------------------------------------------------------------------------------------------
// REGRAS POR SERVIÇO / PAÍS+SERVIÇO (rascunho do painel). A precedência e a conta são as do servidor (shippingSubsidyRules/shippingSubsidyMath), importadas.
// ---------------------------------------------------------------------------------------------------------------------------------------------
import { resolveNusaliPercent, ruleKey, describeSubsidySource, type ServiceRules, type SubsidySource } from './shippingSubsidyRules';
import { simulateShippingSplit, type ShippingSplit } from './shippingSubsidyMath';

/** Linha do catálogo devolvida por GET /admin/shipping-subsidy (serviço de um país + regra efetiva atual). */
export interface SubsidyCatalogRow { countryCode: string; countryName: string | null; serviceCode: string; serviceName: string; isActive: boolean }

/** "ativa" aplica a percentagem; "desativada" fica guardada mas é ignorada (herda o nível seguinte). Chave ausente = sem regra (herda). */
export interface DraftRule { state: 'active' | 'disabled'; percentText: string }
export type DraftRules = Record<string, DraftRule>;

export function rulesToDraft(rules: ServiceRules | null | undefined): DraftRules {
  const d: DraftRules = {};
  for (const [k, r] of Object.entries(rules || {})) d[k] = { state: r.enabled ? 'active' : 'disabled', percentText: String(r.percent) };
  return d;
}

export interface DraftConversion { ok: boolean; rules: ServiceRules; error: string; key: string | null }

/** Rascunho → regras para enviar. A primeira percentagem inválida bloqueia (nada é corrigido em silêncio). */
export function draftToRules(draft: DraftRules): DraftConversion {
  const rules: ServiceRules = {};
  for (const key of Object.keys(draft).sort()) {
    const p = parsePercentInput(draft[key].percentText);
    if (!p.ok) return { ok: false, rules: {}, error: `Regra ${key}: ${p.error}`, key };
    rules[key] = { enabled: draft[key].state === 'active', percent: p.value };
  }
  return { ok: true, rules, error: '', key: null };
}

/** Regras do rascunho SEM as inválidas (só para pré-visualizar a regra efetiva enquanto se digita). */
export function draftRulesLenient(draft: DraftRules): { rules: ServiceRules; invalidKeys: string[] } {
  const rules: ServiceRules = {};
  const invalidKeys: string[] = [];
  for (const [key, d] of Object.entries(draft)) {
    const p = parsePercentInput(d.percentText);
    if (p.ok) rules[key] = { enabled: d.state === 'active', percent: p.value };
    else invalidKeys.push(key);
  }
  return { rules, invalidKeys };
}

export interface EffectiveRow {
  countryCode: string;
  countryName: string | null;
  serviceCode: string;
  serviceName: string;
  percent: number;
  source: SubsidySource;
  sourceLabel: string;
  split: ShippingSplit | null;
}

/** Regra efetiva + simulação financeira (custo e parte do vendedor informados) por país+serviço, usando o rascunho atual. */
export function buildEffectiveRows(
  catalog: SubsidyCatalogRow[],
  global: { enabled: boolean; percent: number },
  draft: DraftRules,
  sim: { cost: number; sellerPercent: number } | null,
  /** regras guardadas inválidas (o servidor aplica 0% a elas até serem corrigidas/removidas ao guardar) */
  stored: { invalidKeys: string[]; corrupt: boolean } = { invalidKeys: [], corrupt: false },
): EffectiveRow[] {
  const lenient = draftRulesLenient(draft);
  const rules = lenient.rules;
  // uma chave inválida guardada só deixa de valer quando o rascunho a substitui; o contêiner corrompido vale até guardar
  const invalidKeys = [...lenient.invalidKeys, ...stored.invalidKeys.filter((k) => !(k in draft))];
  return [...catalog]
    .sort((a, b) => a.countryCode.localeCompare(b.countryCode) || a.serviceCode.localeCompare(b.serviceCode))
    .map((c) => {
      const r = resolveNusaliPercent({ enabled: global.enabled, percent: global.percent, rules, invalidRuleKeys: invalidKeys, rulesCorrupt: stored.corrupt }, { countryCode: c.countryCode, serviceCode: c.serviceCode });
      return {
        countryCode: c.countryCode, countryName: c.countryName, serviceCode: c.serviceCode, serviceName: c.serviceName,
        percent: r.percent, source: r.source, sourceLabel: describeSubsidySource(r.source, r.ruleKey),
        split: sim ? simulateShippingSplit(sim.cost, sim.sellerPercent, r.percent) : null,
      };
    });
}

/** Linhas legíveis das regras que mudaram ("GW:ECONOMY: sem regra → ativa 100%"). */
export function describeRulesDiff(before: ServiceRules | null | undefined, after: ServiceRules | null | undefined): string[] {
  const b = before || {}, a = after || {};
  const label = (r?: { enabled: boolean; percent: number }) => (!r ? 'sem regra' : r.enabled ? `ativa ${r.percent}%` : `desativada (${r.percent}%)`);
  const keys = Array.from(new Set([...Object.keys(b), ...Object.keys(a)])).sort();
  const out: string[] = [];
  for (const k of keys) {
    const x = b[k], y = a[k];
    if (!x && !y) continue;
    if (x && y && x.enabled === y.enabled && x.percent === y.percent) continue;
    out.push(`${k}: ${label(x)} → ${label(y)}`);
  }
  return out;
}

export { ruleKey };
