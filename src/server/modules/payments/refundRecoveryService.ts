/**
 * Fase M1-B — recovery operacional de refunds provider-managed reservados e
 * nunca submetidos ("reserved-but-not-submitted", achado D1 da auditoria
 * M1). MESMO padrão exato de escrowAutoReleaseService.ts (Fase 1 do
 * AUTO-RELEASE): scanner read-only + job idempotente, protegido pelo MESMO
 * endpoint interno (INTERNAL_JOBS_SECRET), SEM scheduler nesta fase.
 *
 * REGRA CENTRAL (nunca duplicada, auditada antes de escrever este arquivo):
 * este módulo NUNCA implementa lógica financeira própria — ele só decide
 * QUAIS refundIds são candidatos e chama
 * `resumeUnsubmittedReservedRefund(refundId)` (= `submitReservedRefund`,
 * D.4/D.7.1), a MESMA função já usada pelo retry manual do admin
 * (resolveDispute). Toda a segurança contra double-POST já existe DENTRO
 * dessa função (CAS `UPDATE refunds SET status='provider_pending' WHERE
 * status='pending'` — a ÚNICA autoridade sobre "quem chama o provider").
 * Este arquivo nunca escreve em refunds/wallets/escrow_accounts
 * diretamente — nem mesmo o estado 'provider_pending'.
 *
 * Por que chamar em QUALQUER refundId encontrado é seguro mesmo sob
 * corrida: se outro caminho (resolveDispute em andamento, um segundo job
 * concorrente, um retry manual) já ganhou o CAS entre o scanner ler a linha
 * e este job chamar `resumeUnsubmittedReservedRefund`, a função retorna
 * `SKIPPED_NOT_FIRST_SENDER` sem NENHUM POST novo — o scanner é só uma
 * otimização de "o que vale a pena tentar", nunca parte da camada de
 * segurança.
 */
import { getDb } from '../../../db/index.js';
import { refunds } from '../../../db/schema.js';
import { eq, and, isNull, isNotNull, lte, asc } from 'drizzle-orm';
import { logger } from '../../infra/logger.js';
import { resumeUnsubmittedReservedRefund } from './refundService.js';

export const REFUND_RECOVERY_DEFAULT_BATCH_SIZE = 25;
export const REFUND_RECOVERY_MAX_BATCH_SIZE = 200;

/**
 * Idade mínima (ms) antes de um refund 'pending'+providerRequestedAt NULL
 * ser considerado candidato a recovery — NÃO é uma proteção de segurança
 * (essa já existe 100% dentro do CAS de submitReservedRefund, ver acima),
 * é só para não competir desnecessariamente com uma chamada normal ainda
 * em voo. Derivado, não inventado: `reserveOrderRefund`/`reserveSurplusRefund`
 * commitam a reserva (Phase 1) e o caminho normal (ex.: resolveDispute)
 * chama `submitReservedRefund` (Phase 2) LOGO EM SEGUIDA, na mesma cadeia
 * síncrona de `await`s — sob operação saudável esse intervalo é de
 * milissegundos, nunca segundos. A única constante de tempo já
 * estabelecida no sistema para "quanto tempo uma operação externa pode
 * legitimamente levar" é o timeout HTTP do AsaasClient (`timeoutMs`
 * default = 10000ms, ver clients/asaasClient.ts). Uso 3x esse valor
 * (30000ms) como piso: folga generosa acima de qualquer atraso plausível
 * de scheduling/GC/round-trip de DB no caminho normal, sem deixar um
 * refund genuinamente órfão esperando muito tempo por recovery.
 */
export const REFUND_RECOVERY_MIN_AGE_MS = 30000;

export interface RecoverableRefundCandidate {
  id: string;
  orderId: string | null;
  purchaseGroupId: string | null;
  paymentId: string;
  createdAt: Date;
}

/**
 * Fase M1-B.2 — SCANNER READ-ONLY. Zero write. Critério validado contra a
 * máquina de estados real (auditoria desta fase):
 *
 *   status = 'pending' AND provider_requested_at IS NULL
 *     -> único estado em que NENHUMA tentativa de submissão pode ter
 *        ganhado o CAS ainda (providerRequestedAt só é gravado DENTRO do
 *        mesmo UPDATE atômico que muda status para 'provider_pending' —
 *        logo 'pending'+providerRequestedAt NOT NULL é estruturalmente
 *        IMPOSSÍVEL hoje; se for encontrado, é corrupção/manipulação
 *        externa, nunca assumido seguro — por isso NÃO faço essa segunda
 *        combinação fazer parte do critério "recuperável").
 *
 *   provider_correlation_key IS NOT NULL AND provider IS NOT NULL
 *     -> defesa em profundidade (fail-close): reservas provider-managed
 *        sempre gravam os dois no mesmo INSERT da reserva (D.4); uma linha
 *        'pending'+providerRequestedAt NULL sem eles seria uma reserva
 *        legada/corrompida — nunca tentada aqui.
 *
 *   provider_raw_response IS NULL
 *     -> nenhuma evidência de submissão prévia (não deveria ser possível
 *        já que providerRawResponse só é escrito na Fase 3 de
 *        submitReservedRefund, sempre precedida por providerRequestedAt —
 *        mas incluído explicitamente para nunca confiar cegamente).
 *
 *   created_at <= NOW() - REFUND_RECOVERY_MIN_AGE_MS
 *     -> ver justificativa da constante acima.
 *
 * ORDER BY created_at ASC, id ASC (determinístico, sem OFFSET) — os
 * candidatos mais antigos primeiro; uma vez recuperado (status muda para
 * provider_pending/processed/failed via o CAS real), a linha sai
 * naturalmente do critério e nunca reaparece.
 */
export async function findRecoverableRefunds(db: any, batchSize: number): Promise<RecoverableRefundCandidate[]> {
  const cutoff = new Date(Date.now() - REFUND_RECOVERY_MIN_AGE_MS);
  const rows = await db
    .select({
      id: refunds.id,
      orderId: refunds.orderId,
      purchaseGroupId: refunds.purchaseGroupId,
      paymentId: refunds.paymentId,
      createdAt: refunds.createdAt,
    })
    .from(refunds)
    .where(and(
      eq(refunds.status, 'pending'),
      isNull(refunds.providerRequestedAt),
      isNotNull(refunds.providerCorrelationKey),
      isNotNull(refunds.provider),
      isNull(refunds.providerRawResponse),
      lte(refunds.createdAt, cutoff)
    ))
    .orderBy(asc(refunds.createdAt), asc(refunds.id))
    .limit(batchSize);
  return rows;
}

export type RefundRecoveryOutcomeStatus = 'submitted' | 'skipped' | 'ambiguous' | 'failed' | 'error';

export interface RefundRecoveryCandidateResult {
  refundId: string;
  status: RefundRecoveryOutcomeStatus;
  /** outcome bruto de resumeUnsubmittedReservedRefund — nunca inclui
   * providerRawResponse/segredo, só o discriminante de outcome já
   * sanitizado pelo próprio refundService.ts. */
  outcome?: string;
}

/**
 * Fase M1-B.3 — processa UM candidato de forma totalmente independente
 * (mesmo padrão de processOneCandidate em escrowAutoReleaseService.ts):
 * uma falha aqui nunca aborta o lote inteiro. Delega 100% para
 * `resumeUnsubmittedReservedRefund` — nenhum write financeiro ad hoc.
 */
async function processOneRefundCandidate(refundId: string): Promise<RefundRecoveryCandidateResult> {
  try {
    const result = await resumeUnsubmittedReservedRefund(refundId);
    switch (result.outcome) {
      case 'SKIPPED_NOT_FIRST_SENDER':
        // Outro caminho (resolveDispute em voo, outro job, retry manual) já
        // ganhou o CAS entre o scanner ler e este job chamar — ZERO POST
        // novo foi feito por esta chamada. Não é uma falha.
        logger.info({ refundId }, 'REFUND_RECOVERY_SKIPPED_NOT_FIRST_SENDER');
        return { refundId, status: 'skipped', outcome: result.outcome };
      case 'SUBMITTED':
        // A chamada externa de fato aconteceu através desta invocação —
        // localStatus resultante (provider_pending/failed/ambiguous_timeout,
        // conforme providerStatus bruto) já foi decidido e persistido
        // inteiramente dentro de submitReservedRefund/
        // persistRefundProviderOutcome — este job nunca decide isso de novo.
        logger.info({ refundId, providerStatus: result.providerStatus }, 'REFUND_RECOVERY_SUBMITTED');
        return { refundId, status: 'submitted', outcome: result.outcome };
      case 'DEFINITIVE_FAILURE':
        logger.warn({ refundId }, 'REFUND_RECOVERY_DEFINITIVE_FAILURE');
        return { refundId, status: 'failed', outcome: result.outcome };
      case 'AMBIGUOUS_EXTERNAL_RESULT':
      case 'RESPONSE_CORRELATION_FAILURE':
        // Submissão real foi tentada (POST feito) mas o resultado não pôde
        // ser confirmado/correlacionado de imediato — precisa de
        // reconciliação (D.5/D.6), nunca um novo POST. Reportado separado
        // de 'submitted' só para visibilidade operacional; nenhuma ação
        // adicional deste job (mesmo mapeamento de status local que
        // persistRefundProviderOutcome já usa: 'ambiguous_timeout').
        logger.info({ refundId, outcome: result.outcome }, 'REFUND_RECOVERY_AMBIGUOUS');
        return { refundId, status: 'ambiguous', outcome: result.outcome };
      default:
        // Enum fechado auditado (SubmitReservedRefundResult['outcome']) —
        // um valor fora desses nunca deveria chegar aqui. Fail closed:
        // reporta como erro para investigação, nunca assume sucesso.
        logger.warn({ refundId, outcome: (result as any).outcome }, 'REFUND_RECOVERY_UNKNOWN_OUTCOME');
        return { refundId, status: 'error', outcome: (result as any).outcome };
    }
  } catch (err: any) {
    // Nunca loga a mensagem crua (pode conter detalhe interno) — só o
    // refundId. Nenhum PII, nenhum segredo, nenhum providerRawResponse.
    logger.warn({ refundId }, 'REFUND_RECOVERY_ERROR');
    return { refundId, status: 'error' };
  }
}

export interface RefundRecoveryRunResult {
  status: 'completed';
  batchSize: number;
  minAgeMs: number;
  candidateCount: number;
  results: RefundRecoveryCandidateResult[];
}

/**
 * Ponto de entrada único do recovery. NÃO é chamado por nenhum
 * cron/scheduler nesta fase — só pelo endpoint interno protegido, e pelos
 * testes (mesmo padrão de runEscrowAutoReleaseOnce).
 */
export async function runRefundRecoveryOnce(options?: { batchSize?: number; db?: any }): Promise<RefundRecoveryRunResult> {
  const db = options?.db ?? getDb();
  if (!db) throw new Error('Banco de dados indisponível.');

  logger.info({}, 'REFUND_RECOVERY_JOB_STARTED');

  const batchSize = Math.min(Math.max(Math.floor(options?.batchSize ?? REFUND_RECOVERY_DEFAULT_BATCH_SIZE), 1), REFUND_RECOVERY_MAX_BATCH_SIZE);
  const candidates = await findRecoverableRefunds(db, batchSize);

  logger.info({ candidateCount: candidates.length }, 'REFUND_RECOVERY_CANDIDATES_FOUND');

  const results: RefundRecoveryCandidateResult[] = [];
  for (const candidate of candidates) {
    try {
      results.push(await processOneRefundCandidate(candidate.id));
    } catch (unexpectedErr: any) {
      logger.warn({ refundId: candidate.id }, 'REFUND_RECOVERY_UNEXPECTED_ERROR');
      results.push({ refundId: candidate.id, status: 'error' });
    }
  }

  logger.info(
    {
      candidateCount: candidates.length,
      submitted: results.filter((r) => r.status === 'submitted').length,
      skipped: results.filter((r) => r.status === 'skipped').length,
      ambiguous: results.filter((r) => r.status === 'ambiguous').length,
      failed: results.filter((r) => r.status === 'failed').length,
      error: results.filter((r) => r.status === 'error').length,
    },
    'REFUND_RECOVERY_JOB_COMPLETED'
  );

  return { status: 'completed', batchSize, minAgeMs: REFUND_RECOVERY_MIN_AGE_MS, candidateCount: candidates.length, results };
}
