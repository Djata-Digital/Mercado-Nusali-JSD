/**
 * Fase 1 do AUTO-RELEASE de escrow — reconciliador financeiro persistente
 * baseado em Postgres (nunca Redis/BullMQ como requisito de correção
 * financeira).
 *
 * ARQUITETURA (auditoria desta fase):
 *   - Não existia, antes desta fase, nenhum mecanismo de "internal endpoint"
 *     protegido por segredo de ambiente — o único precedente é
 *     AsaasWebhookService.isTokenValid (ASAAS_WEBHOOK_AUTH_TOKEN, comparação
 *     com crypto.timingSafeEqual), reaproveitado aqui como padrão para
 *     INTERNAL_JOBS_SECRET.
 *   - Não existe nenhum scheduler (sem node-cron, sem setInterval, sem BullMQ
 *     repeatable job, sem Render Cron/render.yaml) — nesta fase,
 *     deliberadamente, continua não existindo. Este arquivo só implementa o
 *     reconciliador em si; NADA aqui o aciona automaticamente.
 *   - platformSettings é key/value JSONB (ver src/db/schema.ts), lido/escrito
 *     via GET/POST /admin/settings — reaproveitado sem alterações de schema.
 *
 * REGRA CENTRAL (nunca duplicada): este arquivo NUNCA implementa lógica
 * financeira própria — ele só decide QUAIS orderIds são candidatos e chama
 * PaymentService.finalizeDelivery(orderId, {source:'AUTO'}), a MESMA função
 * já usada e testada pelo fluxo manual do comprador. finalizeDelivery (via
 * releaseEscrowForOrder) já revalida do zero, sob o advisory lock
 * (pg_advisory_xact_lock(hashtext(orderId))): disputa ativa, payment
 * elegível, escrow.status, shipments DELIVERED, prova operacional. Este
 * arquivo nunca escreve em wallets/escrow_accounts diretamente.
 */
import { getDb } from '../../../db/index.js';
import { escrowAccounts, platformSettings } from '../../../db/schema.js';
import { eq, and, isNotNull, lte, asc, inArray } from 'drizzle-orm';
import { logger } from '../../infra/logger.js';
import { PaymentService } from './paymentService.js';
import { resolveEscrowHoldingHours } from '../logistics/shipmentService.js';

export const ESCROW_AUTO_RELEASE_DEFAULT_BATCH_SIZE = 25;
export const ESCROW_AUTO_RELEASE_MAX_BATCH_SIZE = 200;

// Discriminante em string ('enabled'/'disabled'), não boolean — o narrowing
// de union por negação de um discriminante booleano não se comporta de forma
// confiável neste toolchain (mesmo problema já documentado no projeto, ver
// scratch/ledgerTestDbGuard.ts).
export type AutoReleaseConfig =
  | { status: 'enabled'; hours: number }
  | { status: 'disabled'; reason: string };

/**
 * FAIL CLOSED por design: qualquer ausência/valor inválido em QUALQUER uma
 * das duas configurações resulta em `status:'disabled'`. Ausência NUNCA é
 * interpretada como `true` — só o valor booleano literal `true` habilita.
 * escrowHoldingHours reaproveita EXATAMENTE a mesma validação (1-168h) já
 * usada em shipmentService.ts para calcular releaseEligibleAt — nunca uma
 * segunda regra divergente.
 */
export async function resolveAutoReleaseConfig(db: any): Promise<AutoReleaseConfig> {
  const rows = await db
    .select({ key: platformSettings.key, valueJson: platformSettings.valueJson })
    .from(platformSettings)
    .where(inArray(platformSettings.key, ['autoReleaseEnabled', 'escrowHoldingHours']));

  const settingsMap = new Map<string, any>(rows.map((r: any) => [r.key, r.valueJson]));

  const autoReleaseEnabledRaw = settingsMap.get('autoReleaseEnabled');
  if (autoReleaseEnabledRaw !== true) {
    return {
      status: 'disabled',
      reason: 'AUTO_RELEASE_DISABLED: platformSettings.autoReleaseEnabled não está explicitamente true (ausente/false/valor inválido tratado igual — fail closed).',
    };
  }

  // Reaproveita EXATAMENTE a mesma validação de faixa (1-168h) de
  // resolveEscrowHoldingHours — mas NÃO aceita o fallback "default" dela.
  // resolveEscrowHoldingHours foi desenhada para o cálculo de
  // releaseEligibleAt na entrega (onde ausência -> default 48h é seguro,
  // pois só afasta um timestamp, nunca bloqueia a entrega). Para o SCANNER,
  // a exigência desta fase é mais estrita: "ausente" também é fail-closed —
  // só `source:'configured'` (chave explicitamente presente e válida) é
  // aceito. A validação de faixa em si (1-168h, numérico) nunca é duplicada
  // aqui, só reutilizada.
  const hoursResult = await resolveEscrowHoldingHours(db);
  if ('invalid' in hoursResult || hoursResult.source !== 'configured') {
    return {
      status: 'disabled',
      reason: 'ESCROW_HOLDING_HOURS_NOT_EXPLICITLY_CONFIGURED: platformSettings.escrowHoldingHours precisa estar explicitamente presente e válida (1-168h) para o scanner — ausência (mesmo com fallback de 48h disponível para outros fluxos) não habilita o AUTO-release.',
    };
  }

  return { status: 'enabled', hours: hoursResult.hours };
}

export type AutoReleaseOrderStatus = 'released' | 'skipped' | 'blocked' | 'failed';

export interface AutoReleaseOrderResult {
  orderId: string;
  status: AutoReleaseOrderStatus;
  code?: string;
}

export interface AutoReleaseRunResult {
  status: 'disabled' | 'completed';
  reason?: string;
  hours?: number;
  batchSize: number;
  candidateCount: number;
  results: AutoReleaseOrderResult[];
}

/**
 * Mapeia a mensagem real lançada por finalizeDelivery/releaseEscrowForOrder
 * (sempre no formato "CODIGO_REAL: descrição") para o código de classificação
 * pedido nesta fase. Nunca inventa um código novo no backend — só agrupa os
 * códigos REAIS já auditados em categorias estáveis para o reconciliador.
 */
function classifyFailureCode(message: string): string {
  if (message.includes('ESCROW_BLOCKED_BY_ACTIVE_DISPUTE')) return 'ACTIVE_DISPUTE';
  if (message.includes('PAYMENT_NOT_ELIGIBLE_FOR_RELEASE') || message.includes('PAYMENT_NOT_CONFIRMED')) return 'PAYMENT_NOT_ELIGIBLE';
  if (message.includes('ORDER_NOT_FULLY_DELIVERED')) return 'NOT_FULLY_DELIVERED';
  if (message.includes('AUTO_RELEASE_MISSING_OPERATIONAL_PROOF')) return 'MISSING_OPERATOR_PROOF';
  if (message.includes('ESCROW_STATE_CHANGED_CONCURRENTLY') || message.includes('ESCROW_ALREADY_REVERSED') || message.includes('ESCROW_CURRENCY_MISMATCH')) return 'ESCROW_STATE_CHANGED';
  if (message.includes('AUTO_RELEASE_NOT_ELIGIBLE') || message.includes('AUTO_RELEASE_WINDOW_NOT_EXPIRED')) return 'NOT_ELIGIBLE';
  return 'UNKNOWN_ERROR';
}

const BLOCKED_CODES = new Set(['ACTIVE_DISPUTE', 'PAYMENT_NOT_ELIGIBLE', 'NOT_FULLY_DELIVERED', 'MISSING_OPERATOR_PROOF', 'ESCROW_STATE_CHANGED', 'NOT_ELIGIBLE']);

/**
 * Processa UM candidato de forma totalmente independente — uma falha aqui
 * nunca aborta o lote inteiro (try/catch por orderId). Cada chamada abre sua
 * PRÓPRIA transação (nunca reaproveitada entre candidatos), então o
 * advisory lock de um orderId nunca é seguro por um candidato anterior.
 */
async function processOneCandidate(db: any, orderId: string): Promise<AutoReleaseOrderResult> {
  try {
    const result: any = await db.transaction((tx: any) => PaymentService.finalizeDelivery(orderId, { source: 'AUTO' }, tx));
    if (result?.data?.alreadyReleased) {
      logger.info({ orderId }, 'ESCROW_AUTO_RELEASE_ORDER_SKIPPED');
      return { orderId, status: 'skipped', code: 'ALREADY_RELEASED' };
    }
    logger.info({ orderId }, 'ESCROW_AUTO_RELEASE_ORDER_PROCESSED');
    return { orderId, status: 'released' };
  } catch (err: any) {
    const message = String(err?.message || '');
    const code = classifyFailureCode(message);
    if (BLOCKED_CODES.has(code)) {
      logger.info({ orderId, code }, 'ESCROW_AUTO_RELEASE_ORDER_BLOCKED');
      return { orderId, status: 'blocked', code };
    }
    // Nunca loga a mensagem crua (pode conter detalhes internos) — só o
    // código de classificação e o orderId. Nenhum PII, nenhum segredo.
    logger.warn({ orderId, code }, 'ESCROW_AUTO_RELEASE_ORDER_FAILED');
    return { orderId, status: 'failed', code };
  }
}

/**
 * Ponto de entrada único do reconciliador. NÃO é chamado por nenhum
 * cron/scheduler nesta fase — só pelo endpoint interno protegido, e pelos
 * testes. Sempre reavalia autoReleaseEnabled/escrowHoldingHours do zero a
 * cada execução (nunca cacheado) — se a configuração for corrigida/quebrada
 * entre duas execuções, o comportamento reflete o estado ATUAL, nunca um
 * valor obtido em execução anterior.
 */
export async function runEscrowAutoReleaseOnce(options?: { batchSize?: number }): Promise<AutoReleaseRunResult> {
  const db = getDb();
  if (!db) throw new Error('Banco de dados indisponível.');

  logger.info({}, 'ESCROW_AUTO_RELEASE_JOB_STARTED');

  const config = await resolveAutoReleaseConfig(db);
  const batchSize = Math.min(Math.max(Math.floor(options?.batchSize ?? ESCROW_AUTO_RELEASE_DEFAULT_BATCH_SIZE), 1), ESCROW_AUTO_RELEASE_MAX_BATCH_SIZE);

  if (config.status === 'disabled') {
    logger.info({ reason: config.reason }, 'ESCROW_AUTO_RELEASE_JOB_DISABLED');
    return { status: 'disabled', reason: config.reason, batchSize, candidateCount: 0, results: [] };
  }

  // Seleção de candidatos: SOMENTE pré-seleção (nunca a decisão final).
  // releaseEligibleAt NULL é estruturalmente excluído por isNotNull() — nunca
  // interpretado como vencido. Nenhuma inferência a partir de
  // shipments.deliveredAt aqui. Ordenação determinística, sem OFFSET (fila
  // financeira nunca pagina por offset — cada execução processa os mais
  // antigos primeiro; itens já processados saem de 'held' e não reaparecem).
  const candidates = await db
    .select({ orderId: escrowAccounts.orderId })
    .from(escrowAccounts)
    .where(and(eq(escrowAccounts.status, 'held'), isNotNull(escrowAccounts.releaseEligibleAt), lte(escrowAccounts.releaseEligibleAt, new Date())))
    .orderBy(asc(escrowAccounts.releaseEligibleAt), asc(escrowAccounts.orderId))
    .limit(batchSize);

  logger.info({ candidateCount: candidates.length, hours: config.hours }, 'ESCROW_AUTO_RELEASE_CANDIDATES_FOUND');

  const results: AutoReleaseOrderResult[] = [];
  for (const candidate of candidates) {
    // Cada orderId é processado de forma totalmente independente — uma
    // exceção não tratada aqui já é capturada dentro de processOneCandidate,
    // mas o try/catch externo é uma segunda camada de segurança para nunca
    // deixar o `for` abortar o lote por qualquer motivo inesperado.
    try {
      results.push(await processOneCandidate(db, candidate.orderId));
    } catch (unexpectedErr: any) {
      logger.warn({ orderId: candidate.orderId, code: 'UNEXPECTED_ERROR' }, 'ESCROW_AUTO_RELEASE_ORDER_FAILED');
      results.push({ orderId: candidate.orderId, status: 'failed', code: 'UNEXPECTED_ERROR' });
    }
  }

  logger.info(
    {
      candidateCount: candidates.length,
      released: results.filter((r) => r.status === 'released').length,
      skipped: results.filter((r) => r.status === 'skipped').length,
      blocked: results.filter((r) => r.status === 'blocked').length,
      failed: results.filter((r) => r.status === 'failed').length,
    },
    'ESCROW_AUTO_RELEASE_JOB_COMPLETED'
  );

  return { status: 'completed', hours: config.hours, batchSize, candidateCount: candidates.length, results };
}
