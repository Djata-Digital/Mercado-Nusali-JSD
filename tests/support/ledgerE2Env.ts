/**
 * Ambiente dos testes do outbox do ledger (E2): primeiro import do teste. Só Postgres local descartável (guarda), ledger sombra LIGADO com cutoff em 2026-01-01
 * (pedidos criados nos testes são posteriores; pedidos "antigos" são simulados recuando orders.created_at), outbox LIGADO, Redis em branco.
 */
import { assertLedgerTestDatabaseGuard } from './ledgerTestDbGuard.js';

process.env.REDIS_URL = '';
process.env.NODE_ENV = 'test';
process.env.SKIP_RUNTIME_ALIGN = 'true';
process.env.LEDGER_SHADOW_CUTOFF_AT = '2026-01-01T00:00:00Z';
process.env.LEDGER_OUTBOX_ENABLED = 'true';
delete process.env.LEDGER_OUTBOX_STRICT;
process.env.JWT_ACCESS_SECRET = process.env.JWT_ACCESS_SECRET || 'test_fixture_jwt_secret_never_real_0123456789';
process.env.ASAAS_WEBHOOK_AUTH_TOKEN = process.env.ASAAS_WEBHOOK_AUTH_TOKEN || 'test_webhook_token_fixture';

export const ledgerTestDbUrl = assertLedgerTestDatabaseGuard();
process.env.DATABASE_URL = ledgerTestDbUrl;
if (!['localhost', '127.0.0.1'].includes(new URL(ledgerTestDbUrl).hostname)) throw new Error('Somente banco local descartavel.');
