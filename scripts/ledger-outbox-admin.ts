/**
 * LEDGER SOMBRA — E2: recuperação MANUAL e AUDITÁVEL. Somente GLOBAL_ADMIN (o --actor tem de ser o id de um usuário GLOBAL_ADMIN); cada intervenção grava
 * uma linha em audit_logs com o estado anterior e a justificativa (mín. 10 caracteres).
 *
 *   npm run ledger:outbox-admin -- status
 *   npm run ledger:outbox-admin -- list [--status NEEDS_INTERVENTION] [--limit 50]
 *   npm run ledger:outbox-admin -- requeue <eventId> --actor <userId> --reason "texto"      (recoloca na fila após corrigir a causa)
 *   npm run ledger:outbox-admin -- dismiss <eventId> --actor <userId> --reason "texto"      (descarta; DONE nunca pode ser descartado)
 *   npm run ledger:outbox-admin -- reconcile
 *   npm run ledger:outbox-admin -- findings [--status OPEN]
 *   npm run ledger:outbox-admin -- ack-finding <findingId> --actor <userId> --note "texto"
 *   npm run ledger:outbox-admin -- repair-missing --actor <userId> [--apply] [--limit 200]   (dry-run por padrão; --apply cria os eventos que faltam)
 */
import 'dotenv/config';
import { sql } from 'drizzle-orm';
import { getDb, getDbPool } from '../src/db/index.js';
import { getOutboxMetrics, requeueOutboxEvent, dismissOutboxEvent, OutboxAdminError } from '../src/server/modules/ledger/outbox/outboxService.js';
import { runLedgerReconciliation, getReconciliationMetrics, acknowledgeFinding, repairMissingEvents } from '../src/server/modules/ledger/outbox/reconciliationService.js';

const args = process.argv.slice(2);
const cmd = args[0];
const flag = (n: string) => { const i = args.indexOf(`--${n}`); return i >= 0 ? args[i + 1] : undefined; };
const rows = (r: any) => (Array.isArray(r) ? r : r?.rows ?? []);

async function main() {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL não configurada.');
  const db: any = getDb(); if (!db) throw new Error('Banco indisponível.');
  switch (cmd) {
    case 'status': console.log(JSON.stringify({ outbox: await getOutboxMetrics(), reconciliation: await getReconciliationMetrics() }, null, 2)); break;
    case 'list': {
      const st = flag('status'); const lim = Math.min(Number(flag('limit') ?? 50), 500);
      const r = rows(await db.execute(st
        ? sql`SELECT id, event_type, status, order_id, attempts, max_attempts, next_attempt_at, last_error_code, left(coalesce(last_error,''),160) AS last_error, created_at FROM ledger_outbox_events WHERE status = ${st} ORDER BY created_at LIMIT ${lim}`
        : sql`SELECT id, event_type, status, order_id, attempts, max_attempts, next_attempt_at, last_error_code, left(coalesce(last_error,''),160) AS last_error, created_at FROM ledger_outbox_events ORDER BY created_at DESC LIMIT ${lim}`));
      console.log(JSON.stringify(r, null, 2)); break;
    }
    case 'requeue': console.log(JSON.stringify(await requeueOutboxEvent({ eventId: args[1], actorUserId: flag('actor') ?? '', reason: flag('reason') ?? '' }))); break;
    case 'dismiss': console.log(JSON.stringify(await dismissOutboxEvent({ eventId: args[1], actorUserId: flag('actor') ?? '', reason: flag('reason') ?? '' }))); break;
    case 'reconcile': console.log(JSON.stringify(await runLedgerReconciliation({ triggeredBy: 'cli' }), null, 2)); break;
    case 'findings': {
      const st = flag('status') ?? 'OPEN';
      console.log(JSON.stringify(rows(await db.execute(sql`SELECT id, finding_type, severity, status, order_id, seen_count, left(detail,200) AS detail, first_seen_at, last_seen_at FROM ledger_reconciliation_findings WHERE status = ${st} ORDER BY severity, first_seen_at LIMIT 200`)), null, 2)); break;
    }
    case 'ack-finding': await acknowledgeFinding({ findingId: args[1], actorUserId: flag('actor') ?? '', note: flag('note') ?? '' }); console.log('reconhecida'); break;
    case 'repair-missing': console.log(JSON.stringify(await repairMissingEvents({ actorUserId: flag('actor') ?? '', dryRun: !args.includes('--apply'), limit: flag('limit') ? Number(flag('limit')) : undefined }), null, 2)); break;
    default: console.error('comando desconhecido. Ver cabeçalho do arquivo.'); process.exitCode = 64;
  }
}

main()
  .then(async () => { await getDbPool()?.end().catch(() => {}); })
  .catch(async (err) => { console.error(err instanceof OutboxAdminError ? `RECUSADO (${err.code}): ${err.message}` : `FALHA: ${err?.message ?? err}`); await getDbPool()?.end().catch(() => {}); process.exit(1); });
