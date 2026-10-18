/**
 * LEDGER SOMBRA — E2: ponte entre os pontos de commit financeiro (PaymentService) e o outbox.
 *
 *  stageLedgerEventsInTx(tx, items)   DENTRO da transação financeira: grava os eventos (idempotente, em SAVEPOINT).
 *  flushLedgerStage(stage, legacy)    DEPOIS do commit: tentativa imediata de processar; o que falhar fica no outbox para o worker.
 *
 * Com LEDGER_OUTBOX_ENABLED desligado nada muda: `mode='DISABLED'` e o chamador executa EXATAMENTE o caminho da E1 (lançamento direto pós-commit).
 * Com o outbox ligado e a gravação do evento FALHANDO (ex.: tabela ausente antes da migração), `directFallback=true` aciona o caminho direto da E1 — o ledger
 * sombra continua tentando por outra via, e a reconciliação enxerga o que ficar de fora. Nenhuma falha aqui jamais derruba a confirmação financeira
 * (salvo o modo estrito, opt-in).
 */
import { isOutboxEnabled } from './outboxEvents.js';
import { enqueueLedgerEvent, enqueuePayoutLedgerEvent, processEventsNow, type EnqueueInput, type EnqueuePayoutInput } from './outboxService.js';

export interface LedgerStage {
  mode: 'DISABLED' | 'OUTBOX';
  eventIds: string[];
  /** true se ao menos uma gravação no outbox falhou => rodar também o caminho direto da E1 */
  directFallback: boolean;
}

export const NO_STAGE: LedgerStage = { mode: 'DISABLED', eventIds: [], directFallback: false };

export async function stageLedgerEventsInTx(tx: any, items: EnqueueInput[]): Promise<LedgerStage> {
  if (!isOutboxEnabled()) return { ...NO_STAGE };
  const stage: LedgerStage = { mode: 'OUTBOX', eventIds: [], directFallback: false };
  for (const item of items) {
    const r = await enqueueLedgerEvent(tx, item);
    if (r.status === 'ENQUEUED' || r.status === 'EXISTS') stage.eventIds.push(r.eventId);
    else if (r.status === 'FAILED') stage.directFallback = true;
    // DISABLED / NOT_ELIGIBLE (ledger desligado ou pedido anterior ao cutoff): nada a fazer — o ledger também ignoraria
  }
  return stage;
}

/** E8b — evento de SAQUE dentro da transação do saque (mesma disciplina de stageLedgerEventsInTx). */
export async function stagePayoutEventInTx(tx: any, item: EnqueuePayoutInput): Promise<LedgerStage> {
  if (!isOutboxEnabled()) return { ...NO_STAGE };
  const stage: LedgerStage = { mode: 'OUTBOX', eventIds: [], directFallback: false };
  const r = await enqueuePayoutLedgerEvent(tx, item);
  if (r.status === 'ENQUEUED' || r.status === 'EXISTS') stage.eventIds.push(r.eventId);
  else if (r.status === 'FAILED') stage.directFallback = true;
  return stage;
}

/**
 * Pós-commit. `legacy` é o lançamento direto da E1 (best-effort, nunca lança). `canProcessNow=false` quando o chamador roda dentro de uma transação externa
 * ainda não commitada: o worker processa depois do commit.
 */
export async function flushLedgerStage(stage: LedgerStage | undefined | null, legacy: () => Promise<void>, canProcessNow = true): Promise<void> {
  const s = stage ?? NO_STAGE;
  if (s.mode === 'DISABLED') { await legacy(); return; }
  if (canProcessNow) await processEventsNow(s.eventIds);
  if (s.directFallback) await legacy();
}
