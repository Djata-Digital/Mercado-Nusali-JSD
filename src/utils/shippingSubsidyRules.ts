/**
 * REGRAS DE SUBSÍDIO DE FRETE DA NUSALI POR PAÍS E SERVIÇO — puras, sem dependências de servidor. É a ÚNICA fonte da precedência: o motor de frete
 * (cotações, carrinho, pedido) e o painel do Super Admin importam estas mesmas funções, então o que o painel mostra como "regra efetiva" é exatamente
 * o que o servidor aplica.
 *
 * Precedência (da mais específica para a mais geral; a primeira regra ATIVA vence e nada se acumula):
 *   1. país + serviço   (chave "GW:ECONOMY")
 *   2. serviço global   (chave "*:ECONOMY")
 *   3. percentagem global (o padrão; a chave "ativar" global controla SÓ este nível)
 * Uma regra DESATIVADA é ignorada (herda o nível seguinte). Uma regra ATIVA com 0% significa "nenhum subsídio da Nusali neste nível" e interrompe a
 * herança (mesmo com a global maior). A percentagem só incide sobre o saldo do cliente (shippingSubsidyMath.applyNusaliSubsidy) — nunca sobre a parte do vendedor.
 *
 * Configuração corrompida nunca é aplicada em silêncio: regra cujo valor é inválido, ou contêiner de regras inválido, resolve para 0% com a origem
 * 'INVALID_RULE' (fail-closed: a Nusali não paga nada que ninguém aprovou) e é reportada em `problems`.
 */
import { validateNusaliPercent } from './shippingSubsidyMath';

export const ANY_COUNTRY = '*';
export const MAX_SUBSIDY_RULES = 200;

export interface ServiceRule { enabled: boolean; percent: number }
/** chave "<PAÍS ISO-2 | *>:<SERVIÇO>" → regra */
export type ServiceRules = Record<string, ServiceRule>;

export interface NusaliSubsidyRulesSetting {
  /** nível 3: ativa/desativa SÓ a percentagem global */
  enabled: boolean;
  percent: number;
  rules: ServiceRules;
  /** chaves bem formadas cuja regra está inválida (nunca aplicadas) */
  invalidRuleKeys: string[];
  /** o contêiner de regras inteiro está inválido: nenhuma regra é confiável */
  rulesCorrupt: boolean;
  /** descrições legíveis de tudo o que está inválido (para o painel e para o log) */
  problems: string[];
}

export const RULE_KEY_PATTERN = /^(\*|[A-Z]{2}):[A-Z0-9_]{2,50}$/;

export function normalizeCode(v: unknown): string {
  return typeof v === 'string' ? v.trim().toUpperCase() : '';
}

export function ruleKey(countryCode: string | null | undefined, serviceCode: string): string {
  const cc = normalizeCode(countryCode) || ANY_COUNTRY;
  return `${cc}:${normalizeCode(serviceCode)}`;
}

export function parseRuleKey(key: string): { countryCode: string | null; serviceCode: string } | null {
  if (!RULE_KEY_PATTERN.test(key)) return null;
  const [cc, svc] = key.split(':');
  return { countryCode: cc === ANY_COUNTRY ? null : cc, serviceCode: svc };
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === 'object' && !Array.isArray(v);
}

export type RulesValidation = { ok: true; rules: ServiceRules } | { ok: false; error: string };

/**
 * Validação ESTRITA do que o administrador envia ao guardar. Recusa (nunca corrige em silêncio): contêiner que não é objeto, chaves fora do formato
 * canónico (maiúsculas), regra com campos extra/em falta, "enabled" não booleano, percentagem fora de 0..100 ou com mais de 2 casas, excesso de regras.
 */
export function validateRulesInput(raw: unknown): RulesValidation {
  if (!isPlainObject(raw)) return { ok: false, error: 'As regras por serviço devem ser um objeto.' };
  const keys = Object.keys(raw);
  if (keys.length > MAX_SUBSIDY_RULES) return { ok: false, error: `No máximo ${MAX_SUBSIDY_RULES} regras por serviço.` };
  const rules: ServiceRules = {};
  for (const key of keys) {
    if (!RULE_KEY_PATTERN.test(key)) return { ok: false, error: `Chave de regra inválida: "${key}". Use "PAÍS:SERVIÇO" (ex.: GW:ECONOMY) ou "*:SERVIÇO" para todos os países.` };
    const v = raw[key];
    if (!isPlainObject(v)) return { ok: false, error: `A regra ${key} é inválida.` };
    const extra = Object.keys(v).filter((k) => k !== 'enabled' && k !== 'percent');
    if (extra.length > 0) return { ok: false, error: `A regra ${key} tem campos desconhecidos (${extra.join(', ')}).` };
    if (typeof v.enabled !== 'boolean') return { ok: false, error: `A regra ${key}: "enabled" deve ser verdadeiro ou falso.` };
    const pct = validateNusaliPercent(v.percent);
    if (!('value' in pct)) return { ok: false, error: `A regra ${key}: ${pct.error}` };
    rules[key] = { enabled: v.enabled, percent: pct.value };
  }
  return { ok: true, rules };
}

/**
 * Leitura do valor GUARDADO (pode ter sido editado fora do painel). Tolerante ao formato antigo (sem "rules" = nenhuma regra), mas nunca silenciosa:
 * tudo o que estiver inválido é registado em `problems` e nunca é aplicado como se estivesse certo.
 */
export function parseStoredSubsidy(raw: unknown): NusaliSubsidyRulesSetting {
  const off: NusaliSubsidyRulesSetting = { enabled: false, percent: 0, rules: {}, invalidRuleKeys: [], rulesCorrupt: false, problems: [] };
  if (raw === undefined || raw === null) return off;
  if (!isPlainObject(raw)) return { ...off, problems: ['A configuração do subsídio de frete está corrompida (não é um objeto); nenhum subsídio é aplicado.'] };

  const problems: string[] = [];
  const pct = validateNusaliPercent(raw.percent);
  const pctOk = 'value' in pct;
  if (!pctOk) problems.push('A percentagem global guardada é inválida; o padrão global é tratado como 0%.');
  const enabled = raw.enabled === true && pctOk;
  const percent = 'value' in pct ? pct.value : 0;

  const rules: ServiceRules = {};
  const invalidRuleKeys: string[] = [];
  let rulesCorrupt = false;
  if (raw.rules !== undefined && raw.rules !== null) {
    if (!isPlainObject(raw.rules)) {
      rulesCorrupt = true;
      problems.push('As regras por serviço guardadas estão corrompidas; nenhum subsídio é aplicado até serem corrigidas.');
    } else {
      for (const [key, v] of Object.entries(raw.rules)) {
        if (!RULE_KEY_PATTERN.test(key)) { problems.push(`Chave de regra inválida ignorada: "${key}".`); continue; }
        const one = validateRulesInput({ [key]: v });
        if (one.ok) rules[key] = one.rules[key];
        else { invalidRuleKeys.push(key); problems.push(`A regra ${key} está inválida e não é aplicada (0% para esse nível).`); }
      }
    }
  }
  return { enabled, percent, rules, invalidRuleKeys, rulesCorrupt, problems };
}

export type SubsidySource = 'COUNTRY_SERVICE' | 'SERVICE' | 'GLOBAL' | 'NONE' | 'INVALID_RULE';

export interface ResolvedSubsidy {
  /** percentagem da Nusali sobre o saldo do cliente (0 = nenhum subsídio) */
  percent: number;
  source: SubsidySource;
  /** chave da regra que decidiu (null para global/nenhuma) */
  ruleKey: string | null;
}

/** Percentagem efetiva para um país de destino + serviço. País/serviço ausentes simplesmente não casam regras específicas. */
export function resolveNusaliPercent(
  setting: Pick<NusaliSubsidyRulesSetting, 'enabled' | 'percent' | 'rules' | 'invalidRuleKeys' | 'rulesCorrupt'>,
  ctx: { countryCode?: string | null; serviceCode?: string | null },
): ResolvedSubsidy {
  if (setting.rulesCorrupt) return { percent: 0, source: 'INVALID_RULE', ruleKey: null };
  const service = normalizeCode(ctx.serviceCode);
  if (service) {
    const country = normalizeCode(ctx.countryCode);
    const levels: Array<{ key: string; source: SubsidySource }> = [];
    if (country) levels.push({ key: `${country}:${service}`, source: 'COUNTRY_SERVICE' });
    levels.push({ key: `${ANY_COUNTRY}:${service}`, source: 'SERVICE' });
    for (const { key, source } of levels) {
      if (setting.invalidRuleKeys.includes(key)) return { percent: 0, source: 'INVALID_RULE', ruleKey: key };
      const rule = setting.rules[key];
      if (rule && rule.enabled) return { percent: rule.percent, source, ruleKey: key };
    }
  }
  if (setting.enabled && setting.percent > 0) return { percent: setting.percent, source: 'GLOBAL', ruleKey: null };
  return { percent: 0, source: 'NONE', ruleKey: null };
}

/** Texto curto da origem para o painel. */
export function describeSubsidySource(source: SubsidySource, ruleKeyValue?: string | null): string {
  switch (source) {
    case 'COUNTRY_SERVICE': return `Regra do país + serviço (${ruleKeyValue})`;
    case 'SERVICE': return `Regra geral do serviço (${ruleKeyValue})`;
    case 'GLOBAL': return 'Percentagem global (padrão)';
    case 'INVALID_RULE': return 'Regra inválida — sem subsídio até corrigir';
    default: return 'Sem subsídio';
  }
}

/** Sufixo gravado no snapshot do pedido para dizer de onde veio a percentagem (cabe nos 50 caracteres da coluna). Global = sem sufixo (compatível com pedidos antigos). */
export function snapshotSourceSuffix(source: SubsidySource): string {
  return source === 'COUNTRY_SERVICE' ? '_CS' : source === 'SERVICE' ? '_SV' : '';
}

/** Forma canónica (chaves ordenadas) para comparar/serializar regras sem depender da ordem. */
export function canonicalRules(rules: ServiceRules | null | undefined): string {
  const src = rules || {};
  return JSON.stringify(Object.keys(src).sort().map((k) => [k, src[k].enabled, src[k].percent]));
}

export function sameRules(a: ServiceRules | null | undefined, b: ServiceRules | null | undefined): boolean {
  return canonicalRules(a) === canonicalRules(b);
}

/** Regras ordenadas (país específico antes do geral, depois por serviço) para listas estáveis. */
export function sortedRuleKeys(rules: ServiceRules): string[] {
  return Object.keys(rules).sort();
}
