/**
 * Configuração ADMINISTRATIVA do subsídio de frete da Nusali (percentagem 0..100 sobre o saldo do cliente): padrão global + regras por serviço e por país+serviço, mais o histórico de alterações.
 *
 * Reaproveita a infraestrutura existente: o valor vive em platform_settings (mesma tabela das demais configurações globais), a leitura que o
 * motor usa é a mesma (shippingCalculatorService.readNusaliSubsidySetting) e o histórico é a auditoria existente (audit_logs). A alteração e a sua
 * auditoria são gravadas na MESMA transação: nunca há mudança sem rastro, nem rastro sem mudança.
 *
 * Não toca em políticas de vendedores, cupons, pedidos já feitos (o frete de um pedido é congelado na criação) nem em campanhas.
 */
import { eq, desc, sql, and } from 'drizzle-orm';
import { platformSettings, auditLogs, users, countries, shippingServices } from '../../../db/schema.js';
import { NUSALI_SUBSIDY_SETTING_KEY, parseNusaliSubsidySetting } from './shippingCalculatorService.js';
import { validateNusaliPercent } from '../../../utils/shippingSubsidyMath.js';
import { validateRulesInput, sameRules, parseRuleKey, resolveNusaliPercent, type ServiceRules, type SubsidySource } from '../../../utils/shippingSubsidyRules.js';

export const SHIPPING_SUBSIDY_AUDIT_ACTION = 'admin.shipping_subsidy.updated';
export const DEFAULT_POLICY_MODE_KEY = 'defaultShippingPolicyMode';
/** Modos aceitos como PADRÃO da plataforma. Modos do vendedor (SELLER_*) nunca podem ser impostos pelo padrão: o vendedor controla a própria política. */
export const ALLOWED_DEFAULT_POLICY_MODES = ['CUSTOMER_PAYS', 'MARKETPLACE_FREE_SHIPPING'] as const;

export class ShippingSubsidyAdminError extends Error {
  constructor(public status: number, public code: string, message: string) { super(message); this.name = 'ShippingSubsidyAdminError'; }
}

export interface ShippingSubsidyConfig {
  enabled: boolean;
  percent: number;
  /** regras por serviço ("GW:ECONOMY" = país+serviço; "*:ECONOMY" = serviço em todos os países) */
  rules: ServiceRules;
  /** problemas encontrados na configuração guardada (regras inválidas nunca são aplicadas) */
  problems: string[];
  /** modo padrão legado da plataforma (null = não configurado = o cliente paga) */
  legacyDefaultMode: string | null;
  updatedAt: string | null;
}

export type EffectiveSubsidy =
  | { kind: 'LEGACY_FREE'; description: string }
  | { kind: 'PERCENT'; percent: number; description: string }
  | { kind: 'NONE'; description: string };

/** O que realmente vale para lojas SEM política própria (as que têm política própria seguem a do vendedor + a percentagem da Nusali sobre o saldo). */
export function describeEffectiveSubsidy(c: Pick<ShippingSubsidyConfig, 'enabled' | 'percent' | 'legacyDefaultMode'>): EffectiveSubsidy {
  if (c.legacyDefaultMode === 'MARKETPLACE_FREE_SHIPPING') {
    return { kind: 'LEGACY_FREE', description: 'Modo legado ativo: a Nusali assume 100% do frete das lojas sem política própria. A percentagem abaixo só passa a valer quando o modo legado for desativado.' };
  }
  if (c.enabled && c.percent > 0) {
    return { kind: 'PERCENT', percent: c.percent, description: `A Nusali assume ${c.percent}% do valor que restaria ao cliente depois da política do vendedor.` };
  }
  return { kind: 'NONE', description: 'Sem subsídio da Nusali: o cliente paga o saldo do frete depois da política do vendedor.' };
}

export async function readShippingSubsidyConfig(executor: any): Promise<ShippingSubsidyConfig> {
  const rows: any[] = await executor.select().from(platformSettings)
    .where(eq(platformSettings.key, NUSALI_SUBSIDY_SETTING_KEY)).limit(1);
  const parsed = parseNusaliSubsidySetting(rows[0]?.valueJson);
  const modeRows: any[] = await executor.select().from(platformSettings).where(eq(platformSettings.key, DEFAULT_POLICY_MODE_KEY)).limit(1);
  const mode = modeRows[0] ? String(modeRows[0].valueJson || '').trim() : '';
  return {
    enabled: parsed.enabled,
    percent: parsed.percent,
    rules: parsed.rules,
    problems: parsed.problems,
    legacyDefaultMode: mode || null,
    updatedAt: rows[0]?.updatedAt ? new Date(rows[0].updatedAt).toISOString() : null,
  };
}

export interface ShippingSubsidyUpdateInput {
  enabled: boolean;
  percent: number;
  /** desativa o modo legado (muda o padrão MARKETPLACE_FREE_SHIPPING para CUSTOMER_PAYS) */
  disableLegacyFreeMode: boolean;
  /** regras por serviço: ausente = mantém as existentes (compatível com clientes antigos e com o script de transição); {} = remove todas */
  rules?: ServiceRules;
  /** valores que o administrador viu ao abrir o ecrã: se mudaram entretanto, a gravação é recusada (409). `rules` ausente = compara só o padrão global (cliente antigo). */
  expected?: { enabled: boolean; percent: number; rules?: ServiceRules };
}

/** Validação rigorosa do corpo do pedido no servidor (nunca confia no ecrã). */
export function validateShippingSubsidyUpdate(body: any): ShippingSubsidyUpdateInput {
  if (!body || typeof body !== 'object') throw new ShippingSubsidyAdminError(400, 'INVALID_BODY', 'Corpo do pedido inválido.');
  if (body.confirmImpact !== true) {
    throw new ShippingSubsidyAdminError(400, 'IMPACT_CONFIRMATION_REQUIRED', 'Confirme o impacto financeiro antes de guardar.');
  }
  if (typeof body.enabled !== 'boolean') throw new ShippingSubsidyAdminError(400, 'INVALID_ENABLED', 'O campo "enabled" deve ser verdadeiro ou falso.');
  const pct = validateNusaliPercent(body.percent);
  if (!('value' in pct)) throw new ShippingSubsidyAdminError(400, 'INVALID_PERCENT', pct.error);
  if (body.disableLegacyFreeMode !== undefined && typeof body.disableLegacyFreeMode !== 'boolean') {
    throw new ShippingSubsidyAdminError(400, 'INVALID_DISABLE_LEGACY', 'O campo "disableLegacyFreeMode" deve ser verdadeiro ou falso.');
  }
  let expected: ShippingSubsidyUpdateInput['expected'];
  if (body.expected !== undefined && body.expected !== null) {
    const e = body.expected;
    const ep = validateNusaliPercent(e?.percent);
    if (typeof e?.enabled !== 'boolean' || !ep.ok) throw new ShippingSubsidyAdminError(400, 'INVALID_EXPECTED', 'Valores de referência inválidos.');
    expected = { enabled: e.enabled, percent: ep.value };
    if (e.rules !== undefined) {
      const er = validateRulesInput(e.rules);
      if (!('rules' in er)) throw new ShippingSubsidyAdminError(400, 'INVALID_EXPECTED', 'Valores de referência inválidos.');
      expected.rules = er.rules;
    }
  }
  let rules: ServiceRules | undefined;
  if (body.rules !== undefined) {
    const rv = validateRulesInput(body.rules);
    if (!('rules' in rv)) throw new ShippingSubsidyAdminError(400, 'INVALID_RULES', rv.error);
    rules = rv.rules;
  }
  return { enabled: body.enabled, percent: pct.value, disableLegacyFreeMode: body.disableLegacyFreeMode === true, rules, expected };
}

/**
 * Cada regra tem de apontar para algo que existe: país conhecido e serviço existente nesse país (regra de país+serviço), ou serviço existente em
 * algum país (regra geral do serviço). Evita regras "fantasma" por erro de digitação que nunca seriam aplicadas.
 */
export async function assertRuleTargetsExist(executor: any, rules: ServiceRules): Promise<void> {
  for (const key of Object.keys(rules)) {
    const parsed = parseRuleKey(key);
    if (!parsed) throw new ShippingSubsidyAdminError(400, 'INVALID_RULES', `Chave de regra inválida: ${key}.`);
    if (parsed.countryCode) {
      const c: any[] = await executor.select({ code: countries.code }).from(countries).where(eq(countries.code, parsed.countryCode)).limit(1);
      if (c.length === 0) throw new ShippingSubsidyAdminError(400, 'INVALID_RULE_TARGET', `A regra ${key} aponta para um país desconhecido (${parsed.countryCode}).`);
      const sv: any[] = await executor.select({ id: shippingServices.id }).from(shippingServices)
        .where(and(eq(shippingServices.countryCode, parsed.countryCode), eq(shippingServices.code, parsed.serviceCode))).limit(1);
      if (sv.length === 0) throw new ShippingSubsidyAdminError(400, 'INVALID_RULE_TARGET', `O serviço ${parsed.serviceCode} não existe em ${parsed.countryCode} (regra ${key}).`);
    } else {
      const sv: any[] = await executor.select({ id: shippingServices.id }).from(shippingServices).where(eq(shippingServices.code, parsed.serviceCode)).limit(1);
      if (sv.length === 0) throw new ShippingSubsidyAdminError(400, 'INVALID_RULE_TARGET', `O serviço ${parsed.serviceCode} não existe em nenhum país (regra ${key}).`);
    }
  }
}

function auditShape(c: Pick<ShippingSubsidyConfig, 'enabled' | 'percent' | 'rules' | 'legacyDefaultMode'>) {
  return { enabled: c.enabled, percent: c.percent, rules: c.rules, legacyDefaultMode: c.legacyDefaultMode };
}

export interface ShippingSubsidyActor { id: string | null; countryCode?: string | null; ip?: string | null; userAgent?: string | null; note?: string | null }

/**
 * Grava a configuração e a auditoria (antes/depois) na MESMA transação. Serializada por lock consultivo: dois administradores nunca se sobrepõem
 * sem o segundo ver o valor novo. `executor` deve ser um db (abre a transação) — nunca já dentro de outra.
 */
export async function updateShippingSubsidyConfig(db: any, input: ShippingSubsidyUpdateInput, actor: ShippingSubsidyActor): Promise<{ before: ShippingSubsidyConfig; after: ShippingSubsidyConfig; legacyModeChanged: boolean }> {
  return db.transaction(async (tx: any) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext('shipping_subsidy_config'))`);
    const before = await readShippingSubsidyConfig(tx);

    if (input.expected && (input.expected.enabled !== before.enabled || input.expected.percent !== before.percent || (input.expected.rules !== undefined && !sameRules(input.expected.rules, before.rules)))) {
      throw new ShippingSubsidyAdminError(409, 'CONFIG_CHANGED', 'A configuração foi alterada por outra pessoa enquanto você editava. Recarregue e confira os valores atuais.');
    }
    if (input.disableLegacyFreeMode && before.legacyDefaultMode !== 'MARKETPLACE_FREE_SHIPPING') {
      throw new ShippingSubsidyAdminError(409, 'LEGACY_MODE_NOT_ACTIVE', 'O modo legado (Nusali assume 100% do frete) não está ativo.');
    }

    // regras ausentes no pedido = mantém as atuais (já validadas ao serem guardadas); regras enviadas são validadas contra países/serviços reais
    if (before.problems.length > 0 && input.rules === undefined) {
      // há configuração guardada inválida: guardar só o padrão global a manteria inválida — o administrador tem de corrigir as regras explicitamente
      throw new ShippingSubsidyAdminError(409, 'STORED_RULES_INVALID', 'Há regras guardadas inválidas. Reveja as regras por serviço e guarde-as de novo.');
    }
    const nextRules: ServiceRules = input.rules !== undefined ? input.rules : before.rules;
    if (input.rules !== undefined) await assertRuleTargetsExist(tx, input.rules);

    const now = new Date();
    const nextValue = { enabled: input.enabled, percent: input.percent, rules: nextRules };
    await tx.insert(platformSettings).values({
      key: NUSALI_SUBSIDY_SETTING_KEY,
      valueJson: nextValue,
      description: 'Subsídio de frete da Nusali (percentagem sobre o saldo do cliente depois da política do vendedor): padrão global + regras por serviço e por país+serviço',
      updatedAt: now,
    }).onConflictDoUpdate({ target: platformSettings.key, set: { valueJson: nextValue, updatedAt: now } });

    let legacyModeChanged = false;
    if (input.disableLegacyFreeMode) {
      await tx.insert(platformSettings).values({
        key: DEFAULT_POLICY_MODE_KEY, valueJson: 'CUSTOMER_PAYS', description: `Configuração global: ${DEFAULT_POLICY_MODE_KEY}`, updatedAt: now,
      }).onConflictDoUpdate({ target: platformSettings.key, set: { valueJson: 'CUSTOMER_PAYS', updatedAt: now } });
      legacyModeChanged = true;
    }

    const after = await readShippingSubsidyConfig(tx);
    await tx.insert(auditLogs).values({
      id: `audit_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      actorUserId: actor.id,
      action: SHIPPING_SUBSIDY_AUDIT_ACTION,
      resource: 'platform_settings',
      resourceId: NUSALI_SUBSIDY_SETTING_KEY,
      detailsJson: {
        before: auditShape(before),
        after: auditShape(after),
        legacyModeChanged,
        rulesChanged: !sameRules(before.rules, after.rules),
        note: actor.note ?? null,
      },
      ipAddress: actor.ip ?? null,
      userAgent: actor.userAgent ?? null,
      countryCode: actor.countryCode ?? null,
      createdAt: now,
    });
    return { before, after, legacyModeChanged };
  });
}

/** `rules` ausente = instantâneo antigo (anterior às regras por serviço): a reversão não toca nas regras existentes. Instantâneos novos trazem sempre as regras. */
export interface ShippingSubsidySnapshot { enabled: boolean; percent: number; legacyDefaultMode: string | null; rules?: ServiceRules }

/**
 * REVERSÃO exata (usada pelo script de transição): repõe a percentagem E o modo padrão legado para o instantâneo guardado antes da mudança
 * (modo legado nulo = a chave é removida, como estava). Na mesma transação, com auditoria "antes/depois" e a nota da reversão. Não toca em pedidos.
 */
export async function restoreShippingSubsidyConfig(db: any, snapshot: ShippingSubsidySnapshot, actor: ShippingSubsidyActor): Promise<{ before: ShippingSubsidyConfig; after: ShippingSubsidyConfig }> {
  const pct = validateNusaliPercent(snapshot.percent);
  if (!('value' in pct) || typeof snapshot.enabled !== 'boolean') throw new ShippingSubsidyAdminError(400, 'INVALID_SNAPSHOT', 'Instantâneo de reversão inválido.');
  if (snapshot.legacyDefaultMode !== null && typeof snapshot.legacyDefaultMode !== 'string') throw new ShippingSubsidyAdminError(400, 'INVALID_SNAPSHOT', 'Instantâneo de reversão inválido.');
  let snapshotRules: ServiceRules | undefined;
  if (snapshot.rules !== undefined) {
    const rv = validateRulesInput(snapshot.rules);
    if (!('rules' in rv)) throw new ShippingSubsidyAdminError(400, 'INVALID_SNAPSHOT', 'Instantâneo de reversão inválido (regras por serviço).');
    snapshotRules = rv.rules;
  }
  return db.transaction(async (tx: any) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext('shipping_subsidy_config'))`);
    const before = await readShippingSubsidyConfig(tx);
    const now = new Date();
    const restoredRules: ServiceRules = snapshotRules !== undefined ? snapshotRules : before.rules;
    const restoredValue = { enabled: snapshot.enabled, percent: pct.value, rules: restoredRules };
    await tx.insert(platformSettings).values({
      key: NUSALI_SUBSIDY_SETTING_KEY, valueJson: restoredValue,
      description: 'Subsídio de frete da Nusali (percentagem sobre o saldo do cliente depois da política do vendedor): padrão global + regras por serviço e por país+serviço', updatedAt: now,
    }).onConflictDoUpdate({ target: platformSettings.key, set: { valueJson: restoredValue, updatedAt: now } });
    if (snapshot.legacyDefaultMode === null) {
      await tx.delete(platformSettings).where(eq(platformSettings.key, DEFAULT_POLICY_MODE_KEY));
    } else {
      await tx.insert(platformSettings).values({ key: DEFAULT_POLICY_MODE_KEY, valueJson: snapshot.legacyDefaultMode, description: `Configuração global: ${DEFAULT_POLICY_MODE_KEY}`, updatedAt: now })
        .onConflictDoUpdate({ target: platformSettings.key, set: { valueJson: snapshot.legacyDefaultMode, updatedAt: now } });
    }
    const after = await readShippingSubsidyConfig(tx);
    await tx.insert(auditLogs).values({
      id: `audit_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      actorUserId: actor.id, action: SHIPPING_SUBSIDY_AUDIT_ACTION, resource: 'platform_settings', resourceId: NUSALI_SUBSIDY_SETTING_KEY,
      detailsJson: {
        before: auditShape(before),
        after: auditShape(after),
        legacyModeChanged: before.legacyDefaultMode !== after.legacyDefaultMode,
        rulesChanged: !sameRules(before.rules, after.rules),
        note: actor.note ?? 'reversão',
      },
      ipAddress: actor.ip ?? null, userAgent: actor.userAgent ?? null, countryCode: actor.countryCode ?? null, createdAt: now,
    });
    return { before, after };
  });
}

export interface ShippingSubsidyHistoryItem {
  id: string;
  createdAt: string;
  user: { id: string | null; name: string | null; email: string | null };
  before: { enabled: boolean; percent: number; legacyDefaultMode: string | null; rules?: ServiceRules } | null;
  after: { enabled: boolean; percent: number; legacyDefaultMode: string | null; rules?: ServiceRules } | null;
  legacyModeChanged: boolean;
  rulesChanged: boolean;
  note: string | null;
}

/** Histórico (mais recente primeiro): quem, quando, valor anterior e valor novo — vindo da auditoria existente. */
export async function listShippingSubsidyHistory(executor: any, limit = 50): Promise<ShippingSubsidyHistoryItem[]> {
  const cap = Math.min(200, Math.max(1, Math.floor(limit) || 50));
  const rows: any[] = await executor
    .select({ id: auditLogs.id, createdAt: auditLogs.createdAt, actorUserId: auditLogs.actorUserId, detailsJson: auditLogs.detailsJson, fullName: users.fullName, email: users.email })
    .from(auditLogs)
    .leftJoin(users, eq(users.id, auditLogs.actorUserId))
    .where(eq(auditLogs.action, SHIPPING_SUBSIDY_AUDIT_ACTION))
    .orderBy(desc(auditLogs.createdAt))
    .limit(cap);
  return rows.map((r) => {
    const d = (r.detailsJson && typeof r.detailsJson === 'object' ? r.detailsJson : {}) as any;
    return {
      id: r.id,
      createdAt: new Date(r.createdAt).toISOString(),
      user: { id: r.actorUserId ?? null, name: r.fullName ?? null, email: r.email ?? null },
      before: d.before ?? null,
      after: d.after ?? null,
      legacyModeChanged: d.legacyModeChanged === true,
      rulesChanged: d.rulesChanged === true,
      note: typeof d.note === 'string' ? d.note : null,
    };
  });
}


export interface SubsidyServiceRow {
  countryCode: string;
  countryName: string | null;
  serviceCode: string;
  serviceName: string;
  isActive: boolean;
  /** o que VALE hoje para este país+serviço (a mesma resolução do servidor) e de onde vem */
  effectivePercent: number;
  source: SubsidySource;
  ruleKey: string | null;
}

/** Catálogo de serviços (país + código) com a regra efetiva de cada um — alimenta a tabela do painel; só leitura. */
export async function listSubsidyServiceRows(executor: any, config: Pick<ShippingSubsidyConfig, 'enabled' | 'percent' | 'rules'>): Promise<SubsidyServiceRow[]> {
  const rows: any[] = await executor
    .select({ countryCode: shippingServices.countryCode, code: shippingServices.code, name: shippingServices.name, isActive: shippingServices.isActive, countryName: countries.name })
    .from(shippingServices)
    .leftJoin(countries, eq(countries.code, shippingServices.countryCode));
  const setting = { enabled: config.enabled, percent: config.percent, rules: config.rules, invalidRuleKeys: [] as string[], rulesCorrupt: false };
  return rows
    .map((r) => {
      const eff = resolveNusaliPercent(setting, { countryCode: r.countryCode, serviceCode: r.code });
      return { countryCode: r.countryCode, countryName: r.countryName ?? null, serviceCode: r.code, serviceName: r.name, isActive: r.isActive !== false, effectivePercent: eff.percent, source: eff.source, ruleKey: eff.ruleKey };
    })
    .sort((a, b) => a.countryCode.localeCompare(b.countryCode) || a.serviceCode.localeCompare(b.serviceCode));
}
