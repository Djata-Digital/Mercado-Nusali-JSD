import type { Response, NextFunction } from 'express';
import { eq } from 'drizzle-orm';
import type { AuthRequest } from './authMiddleware.js';

/**
 * FASE — RBAC TERRITORIAL E FINANCEIRO
 *
 * Modelo de escopo administrativo, derivado SOMENTE de vínculos reais já
 * existentes no banco (nada inventado):
 *
 * - GLOBAL_ADMIN / ADMIN: sem restrição territorial. Nenhum fluxo de criação
 *   de conta atribui país "de verdade" a essas roles — `users.countryCode`
 *   nelas é só o valor de cadastro, não uma atribuição de território (ao
 *   contrário de COUNTRY_REPRESENTATIVE/REGIONAL_SUPERVISOR, que SÃO criados
 *   com país deliberadamente atribuído via POST /admin/country-reps e
 *   POST /admin/supervisors).
 * - COUNTRY_REPRESENTATIVE: escopo = users.countryCode (vínculo real,
 *   atribuído na criação da conta).
 * - REGIONAL_SUPERVISOR: escopo = users.countryCode (MESMO limite de país).
 *   Não existe hoje nenhuma coluna regionId em users/sellers/orders/
 *   escrow_accounts/seller_payouts/disputes. O único "vínculo" região↔pessoa
 *   é `regions.supervisorEmail`, um campo de texto livre sem FK, sem
 *   unicidade garantida, comparado por e-mail — não é confiável o
 *   suficiente para autorizar acesso financeiro. Por isso o escopo regional
 *   verdadeiro (sub-país) fica BLOQUEADO nesta fase: REGIONAL_SUPERVISOR
 *   fica restrito ao nível de PAÍS, o limite mais estreito que os dados
 *   atuais permitem garantir com segurança, nunca mais amplo que isso.
 *   Ver REGIONAL_SCOPE no relatório de fechamento desta fase.
 * - Qualquer outra role interna (FINANCE, SUPPORT, SUPPORT_AGENT,
 *   LOGISTICS*, KYC_ANALYST, RISK_ANALYST, WAREHOUSE_*, HUB_MANAGER) não faz
 *   parte do modelo territorial pedido nesta fase — comportamento
 *   inalterado (GLOBAL), igual a antes desta fase.
 */

export type AdministrativeScope =
  | { kind: 'GLOBAL' }
  | { kind: 'COUNTRY'; countryCode: string; regionBlocked: boolean };

const COUNTRY_SCOPED_ROLES = new Set(['COUNTRY_REPRESENTATIVE', 'REGIONAL_SUPERVISOR']);

export function resolveAdministrativeScope(user: { role?: string; countryCode?: string } | undefined): AdministrativeScope {
  const role = (user?.role || '').toUpperCase();
  if (COUNTRY_SCOPED_ROLES.has(role)) {
    return {
      kind: 'COUNTRY',
      countryCode: (user?.countryCode || '').toUpperCase(),
      regionBlocked: role === 'REGIONAL_SUPERVISOR',
    };
  }
  return { kind: 'GLOBAL' };
}

export class ScopeError extends Error {
  status: number;
  code: string;
  constructor(message: string, code = 'COUNTRY_SCOPE_FORBIDDEN', status = 403) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

/**
 * Nunca aceita o país-alvo vindo de query/body do cliente — sempre compara
 * contra o escopo resolvido a partir da identidade autenticada (req.user).
 */
export function assertCountryAccess(scope: AdministrativeScope, targetCountryCode: string | null | undefined) {
  if (scope.kind === 'GLOBAL') return;
  const target = (targetCountryCode || '').toUpperCase();
  if (!scope.countryCode || !target || target !== scope.countryCode) {
    throw new ScopeError('Este recurso pertence a um país fora do seu escopo administrativo.');
  }
}

// Filtro de query pelo país do escopo, ou undefined para GLOBAL (sem filtro).
export function scopeCountryFilter(scope: AdministrativeScope, column: any) {
  if (scope.kind === 'GLOBAL') return undefined;
  return eq(column, scope.countryCode);
}

// ---------------------------------------------------------------------------
// Fechamento RBAC para lançamento — regra temporária de escopo para
// shipments/logística (seção 1 da fase de fechamento):
//
// GLOBAL_ADMIN: vê tudo, incluindo remessas internacionais.
// COUNTRY_REPRESENTATIVE / REGIONAL_SUPERVISOR: só remessas 100% domésticas
// do país autorizado (origin_country = destination_country = countryCode).
// Uma remessa internacional (origem OU destino fora do país autorizado, ou
// os dois países diferentes entre si) fica visível SOMENTE para GLOBAL_ADMIN
// nesta fase — não existe regionId confiável para decidir de outra forma.
// ---------------------------------------------------------------------------

export function isShipmentWithinScope(
  scope: AdministrativeScope,
  originCountry: string | null | undefined,
  destinationCountry: string | null | undefined
): boolean {
  if (scope.kind === 'GLOBAL') return true;
  const origin = (originCountry || '').toUpperCase();
  const destination = (destinationCountry || '').toUpperCase();
  return !!scope.countryCode && origin === scope.countryCode && destination === scope.countryCode;
}

export function assertShipmentScopeAccess(
  scope: AdministrativeScope,
  originCountry: string | null | undefined,
  destinationCountry: string | null | undefined
) {
  if (!isShipmentWithinScope(scope, originCountry, destinationCountry)) {
    throw new ScopeError('Esta remessa é internacional ou pertence a outro país e está fora do seu escopo administrativo.');
  }
}

// ---------------------------------------------------------------------------
// Painel Admin — Tarifas de Frete (shipping_rates). Diferente de shipments
// (que exige origem E destino dentro do país autorizado — parcela física
// real), uma TARIFA é uma configuração comercial: um admin de país deve
// poder configurar tanto rotas de exportação (origem=seu país) quanto de
// importação (destino=seu país). Por isso o critério aqui é OR, não AND.
// ---------------------------------------------------------------------------

export function isShippingRateWithinScope(
  scope: AdministrativeScope,
  originCountry: string | null | undefined,
  destinationCountry: string | null | undefined
): boolean {
  if (scope.kind === 'GLOBAL') return true;
  const origin = (originCountry || '').toUpperCase();
  const destination = (destinationCountry || '').toUpperCase();
  return !!scope.countryCode && (origin === scope.countryCode || destination === scope.countryCode);
}

export function assertShippingRateScopeAccess(
  scope: AdministrativeScope,
  originCountry: string | null | undefined,
  destinationCountry: string | null | undefined
) {
  if (!isShippingRateWithinScope(scope, originCountry, destinationCountry)) {
    throw new ScopeError('Esta tarifa de frete não envolve o seu país e está fora do seu escopo administrativo.', 'SHIPPING_RATE_SCOPE_FORBIDDEN');
  }
}

// ---------------------------------------------------------------------------
// Permissões financeiras mínimas. Reaproveita o conceito já existente em
// adminRoutes.ts (ROLE_PERMISSION_CODES: view_financials / manage_disputes)
// em vez de criar dezenas de códigos novos.
// ---------------------------------------------------------------------------

export const FINANCE_APPROVAL_ROLES = new Set(['GLOBAL_ADMIN', 'ADMIN', 'COUNTRY_REPRESENTATIVE', 'FINANCE']);
export const DISPUTE_RESOLVE_ROLES = new Set([...FINANCE_APPROVAL_ROLES, 'REGIONAL_SUPERVISOR']);

export function requireFinanceApproval(req: AuthRequest, res: Response, next: NextFunction) {
  const role = (req.user?.role || '').toUpperCase();
  if (!FINANCE_APPROVAL_ROLES.has(role)) {
    return res.status(403).json({
      success: false,
      error: {
        code: 'FINANCE_PERMISSION_REQUIRED',
        message: 'Esta ação financeira exige permissão de finanças (Administrador, Representante Nacional ou Financeiro).',
      },
    });
  }
  return next();
}

export function requireDisputeResolvePermission(req: AuthRequest, res: Response, next: NextFunction) {
  const role = (req.user?.role || '').toUpperCase();
  if (!DISPUTE_RESOLVE_ROLES.has(role)) {
    return res.status(403).json({
      success: false,
      error: {
        code: 'DISPUTE_RESOLVE_PERMISSION_REQUIRED',
        message: 'Você não tem permissão para resolver disputas.',
      },
    });
  }
  return next();
}
