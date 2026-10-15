/**
 * Configuração ADMINISTRATIVA do subsídio global de frete da Nusali (percentagem 0..100 sobre o saldo do cliente) + histórico de alterações.
 *
 * Reaproveita a infraestrutura existente: o valor vive em platform_settings (mesma tabela das demais configurações globais), a leitura que o
 * motor usa é a mesma (shippingCalculatorService.readNusaliSubsidySetting) e o histórico é a auditoria existente (audit_logs). A alteração e a sua
 * auditoria são gravadas na MESMA transação: nunca há mudança sem rastro, nem rastro sem mudança.
 *
 * Não toca em políticas de vendedores, cupons, pedidos já feitos (o frete de um pedido é congelado na criação) nem em campanhas.
 */
import { eq, desc, sql } from 'drizzle-orm';
import { platformSettings, auditLogs, users } from '../../../db/schema.js';
import { NUSALI_SUBSIDY_SETTING_KEY, parseNusaliSubsidySetting } from './shippingCalculatorService.js';
import { validateNusaliPercent } from '../../../utils/shippingSubsidyMath.js';

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
    legacyDefaultMode: mode || null,
    updatedAt: rows[0]?.updatedAt ? new Date(rows[0].updatedAt).toISOString() : null,
  };
}

export interface ShippingSubsidyUpdateInput {
  enabled: boolean;
  percent: number;
  /** desativa o modo legado (muda o padrão MARKETPLACE_FREE_SHIPPING para CUSTOMER_PAYS) */
  disableLegacyFreeMode: boolean;
  /** valores que o administrador viu ao abrir o ecrã: se mudaram entretanto, a gravação é recusada (409) */
  expected?: { enabled: boolean; percent: number };
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
  }
  return { enabled: body.enabled, percent: pct.value, disableLegacyFreeMode: body.disableLegacyFreeMode === true, expected };
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

    if (input.expected && (input.expected.enabled !== before.enabled || input.expected.percent !== before.percent)) {
      throw new ShippingSubsidyAdminError(409, 'CONFIG_CHANGED', 'A configuração foi alterada por outra pessoa enquanto você editava. Recarregue e confira os valores atuais.');
    }
    if (input.disableLegacyFreeMode && before.legacyDefaultMode !== 'MARKETPLACE_FREE_SHIPPING') {
      throw new ShippingSubsidyAdminError(409, 'LEGACY_MODE_NOT_ACTIVE', 'O modo legado (Nusali assume 100% do frete) não está ativo.');
    }

    const now = new Date();
    await tx.insert(platformSettings).values({
      key: NUSALI_SUBSIDY_SETTING_KEY,
      valueJson: { enabled: input.enabled, percent: input.percent },
      description: 'Subsídio global de frete da Nusali (percentagem sobre o saldo do cliente depois da política do vendedor)',
      updatedAt: now,
    }).onConflictDoUpdate({ target: platformSettings.key, set: { valueJson: { enabled: input.enabled, percent: input.percent }, updatedAt: now } });

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
        before: { enabled: before.enabled, percent: before.percent, legacyDefaultMode: before.legacyDefaultMode },
        after: { enabled: after.enabled, percent: after.percent, legacyDefaultMode: after.legacyDefaultMode },
        legacyModeChanged,
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

export interface ShippingSubsidySnapshot { enabled: boolean; percent: number; legacyDefaultMode: string | null }

/**
 * REVERSÃO exata (usada pelo script de transição): repõe a percentagem E o modo padrão legado para o instantâneo guardado antes da mudança
 * (modo legado nulo = a chave é removida, como estava). Na mesma transação, com auditoria "antes/depois" e a nota da reversão. Não toca em pedidos.
 */
export async function restoreShippingSubsidyConfig(db: any, snapshot: ShippingSubsidySnapshot, actor: ShippingSubsidyActor): Promise<{ before: ShippingSubsidyConfig; after: ShippingSubsidyConfig }> {
  const pct = validateNusaliPercent(snapshot.percent);
  if (!('value' in pct) || typeof snapshot.enabled !== 'boolean') throw new ShippingSubsidyAdminError(400, 'INVALID_SNAPSHOT', 'Instantâneo de reversão inválido.');
  if (snapshot.legacyDefaultMode !== null && typeof snapshot.legacyDefaultMode !== 'string') throw new ShippingSubsidyAdminError(400, 'INVALID_SNAPSHOT', 'Instantâneo de reversão inválido.');
  return db.transaction(async (tx: any) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext('shipping_subsidy_config'))`);
    const before = await readShippingSubsidyConfig(tx);
    const now = new Date();
    await tx.insert(platformSettings).values({
      key: NUSALI_SUBSIDY_SETTING_KEY, valueJson: { enabled: snapshot.enabled, percent: pct.value },
      description: 'Subsídio global de frete da Nusali (percentagem sobre o saldo do cliente depois da política do vendedor)', updatedAt: now,
    }).onConflictDoUpdate({ target: platformSettings.key, set: { valueJson: { enabled: snapshot.enabled, percent: pct.value }, updatedAt: now } });
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
        before: { enabled: before.enabled, percent: before.percent, legacyDefaultMode: before.legacyDefaultMode },
        after: { enabled: after.enabled, percent: after.percent, legacyDefaultMode: after.legacyDefaultMode },
        legacyModeChanged: before.legacyDefaultMode !== after.legacyDefaultMode,
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
  before: { enabled: boolean; percent: number; legacyDefaultMode: string | null } | null;
  after: { enabled: boolean; percent: number; legacyDefaultMode: string | null } | null;
  legacyModeChanged: boolean;
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
      note: typeof d.note === 'string' ? d.note : null,
    };
  });
}
