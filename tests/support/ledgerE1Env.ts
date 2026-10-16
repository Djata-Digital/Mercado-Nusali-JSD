/**
 * Ambiente dos testes de ledger: tem de ser o PRIMEIRO import do teste (o ledger lê LEDGER_SHADOW_CUTOFF_AT ao carregar o módulo).
 * Só Postgres local descartável (o guarda aborta em qualquer outro caso); ledger sombra LIGADO com cutoff no passado; Redis em branco.
 */
import { assertLedgerTestDatabaseGuard } from './ledgerTestDbGuard.js';

process.env.REDIS_URL = '';
process.env.NODE_ENV = 'test';
process.env.SKIP_RUNTIME_ALIGN = 'true';
process.env.LEDGER_SHADOW_CUTOFF_AT = '2000-01-01T00:00:00Z';
process.env.JWT_ACCESS_SECRET = process.env.JWT_ACCESS_SECRET || 'test_fixture_jwt_secret_never_real_0123456789';
process.env.ASAAS_WEBHOOK_AUTH_TOKEN = process.env.ASAAS_WEBHOOK_AUTH_TOKEN || 'test_webhook_token_fixture';

export const ledgerTestDbUrl = assertLedgerTestDatabaseGuard();
process.env.DATABASE_URL = ledgerTestDbUrl;
if (!['localhost', '127.0.0.1'].includes(new URL(ledgerTestDbUrl).hostname)) throw new Error('Somente banco local descartavel.');
