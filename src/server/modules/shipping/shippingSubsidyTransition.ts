/**
 * TRANSIÇÃO SEGURA da política de frete em produção: de "modo legado MARKETPLACE_FREE_SHIPPING (a Nusali assume 100%)" para o subsídio global por
 * percentagem (padrão 0%). Três passos separados e explícitos — plano (só leitura), aplicar e reverter — para a mudança só acontecer com autorização,
 * com o valor anterior verificado e guardado, reversão exata e SEM recalcular pedidos (esta rotina nunca escreve em orders; só os conta).
 */
import { sql } from 'drizzle-orm';
import { orders } from '../../../db/schema.js';
import {
  readShippingSubsidyConfig, updateShippingSubsidyConfig, restoreShippingSubsidyConfig, validateShippingSubsidyUpdate,
  type ShippingSubsidyConfig, type ShippingSubsidySnapshot,
} from './shippingSubsidyAdminService.js';

export interface TransitionTarget { percent: number; enabled: boolean; disableLegacyFreeMode: boolean }
export const DEFAULT_TRANSITION_TARGET: TransitionTarget = { percent: 0, enabled: false, disableLegacyFreeMode: true };

export interface TransitionPlan {
  current: ShippingSubsidyConfig;
  target: TransitionTarget;
  changes: string[];
  warnings: string[];
  noop: boolean;
  /** quantos pedidos existem hoje — todos permanecem EXATAMENTE como estão (o frete é congelado na criação) */
  existingOrders: number;
}

async function countOrders(db: any): Promise<number> {
  const r: any[] = await db.select({ n: sql<number>`count(*)::int` }).from(orders);
  return Number(r[0]?.n ?? 0);
}

/** SÓ LEITURA: descreve o que mudaria. */
export async function planSubsidyTransition(db: any, target: TransitionTarget = DEFAULT_TRANSITION_TARGET): Promise<TransitionPlan> {
  const current = await readShippingSubsidyConfig(db);
  const changes: string[] = [];
  const warnings: string[] = [];
  if (target.disableLegacyFreeMode) {
    if (current.legacyDefaultMode === 'MARKETPLACE_FREE_SHIPPING') {
      changes.push('defaultShippingPolicyMode: MARKETPLACE_FREE_SHIPPING → CUSTOMER_PAYS (a Nusali deixa de assumir 100% do frete das lojas sem política própria)');
      warnings.push('Depois da mudança o cliente passa a pagar o frete (menos a percentagem da Nusali) em lojas sem política própria.');
    } else {
      warnings.push(`O modo legado já não está ativo (padrão atual: ${current.legacyDefaultMode ?? 'não configurado'}); nada a desativar.`);
    }
  }
  if (Object.keys(current.rules).length > 0) warnings.push(`Existem ${Object.keys(current.rules).length} regra(s) por serviço; a transição não as altera (a reversão também as repõe como estavam).`);
  if (current.enabled !== target.enabled || current.percent !== target.percent) {
    changes.push(`shippingNusaliSubsidy: ${current.enabled ? 'ativo' : 'desativado'} ${current.percent}% → ${target.enabled ? 'ativo' : 'desativado'} ${target.percent}%`);
  }
  return { current, target, changes, warnings, noop: changes.length === 0, existingOrders: await countOrders(db) };
}

export interface TransitionResult {
  plan: TransitionPlan;
  /** instantâneo do valor ANTERIOR: guarde-o — é o ficheiro de reversão */
  snapshot: ShippingSubsidySnapshot & { takenAt: string };
  after: ShippingSubsidyConfig;
  ordersBefore: number;
  ordersAfter: number;
}

/** Aplica a transição (uma transação, com auditoria). O alvo é validado como no endpoint do painel. */
export async function applySubsidyTransition(db: any, target: TransitionTarget = DEFAULT_TRANSITION_TARGET, note = 'Transição para subsídio global percentual (script autorizado)'): Promise<TransitionResult> {
  validateShippingSubsidyUpdate({ ...target, confirmImpact: true });
  const plan = await planSubsidyTransition(db, target);
  // o instantâneo inclui as regras por país/serviço: a reversão as repõe exatamente (a transição em si nunca as altera)
  const snapshot = { enabled: plan.current.enabled, percent: plan.current.percent, legacyDefaultMode: plan.current.legacyDefaultMode, rules: plan.current.rules, takenAt: new Date().toISOString() };
  const effectiveDisable = target.disableLegacyFreeMode && plan.current.legacyDefaultMode === 'MARKETPLACE_FREE_SHIPPING';
  const { after } = await updateShippingSubsidyConfig(db, {
    enabled: target.enabled, percent: target.percent, disableLegacyFreeMode: effectiveDisable,
    expected: { enabled: plan.current.enabled, percent: plan.current.percent, rules: plan.current.rules },
  }, { id: null, note });
  return { plan, snapshot, after, ordersBefore: plan.existingOrders, ordersAfter: await countOrders(db) };
}

/** Reversão exata para o instantâneo guardado por applySubsidyTransition. */
export async function rollbackSubsidyTransition(db: any, snapshot: ShippingSubsidySnapshot, note = 'Reversão da transição de subsídio de frete'): Promise<{ before: ShippingSubsidyConfig; after: ShippingSubsidyConfig; ordersCount: number }> {
  const r = await restoreShippingSubsidyConfig(db, { enabled: snapshot.enabled, percent: snapshot.percent, legacyDefaultMode: snapshot.legacyDefaultMode, rules: snapshot.rules }, { id: null, note });
  return { ...r, ordersCount: await countOrders(db) };
}
