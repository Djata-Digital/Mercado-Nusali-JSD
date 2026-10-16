/**
 * Guarda de segurança para testes financeiros/ledger destrutivos ou que
 * dependem de imutabilidade real (POSTED/REVERSED não-deletável).
 *
 * Fase 5A.2, Parte 3 item 10: nenhum teste que cria transactions POSTED de
 * verdade (e portanto deixa resíduo permanente por design) pode rodar contra
 * o banco operacional de novo — foi exatamente isso que aconteceu na Fase 5A/
 * 5A.1 e exigiu uma limpeza excepcional one-time. Este guard torna esse erro
 * estruturalmente difícil de repetir: qualquer script de teste financeiro
 * chama assertLedgerTestDatabaseGuard() como a PRIMEIRA linha, antes de abrir
 * qualquer conexão, e ele aborta (lança, não retorna) se:
 *
 *   1. NODE_ENV === 'production'                          -> nunca, sob nenhuma
 *      circunstância, mesmo que alguém configure as outras variáveis certas.
 *   2. LEDGER_TEST_DATABASE_URL ausente/vazia              -> sem banco de teste
 *      explícito, não roda. Não cai para DATABASE_URL como default.
 *   3. LEDGER_TEST_DATABASE_URL === DATABASE_URL           -> mesmo valor não é
 *      permitido, mesmo que alguém aponte as duas para o Postgres de teste por
 *      engano — a comparação é textual simples, de propósito (nenhuma tentativa
 *      de normalizar/resolver DNS, que adicionaria complexidade sem necessidade).
 *
 * Uso pretendido (próxima vez que a suíte de ledger for reescrita para rodar
 * contra scratch/../docker-compose.dev.yml, não contra o Supabase operacional):
 *
 *   import { assertLedgerTestDatabaseGuard } from './ledgerTestDbGuard.js';
 *   const testDbUrl = assertLedgerTestDatabaseGuard();
 *   const pool = new pg.Pool({ connectionString: testDbUrl });
 *
 * Este arquivo só prepara o guard — não foi conectado à suíte existente nem
 * criou nenhuma infraestrutura nova (Fase 5A.2, Parte 3, item 10: "pode
 * preparar a configuração/script, mas não criar infraestrutura externa").
 */

export class LedgerTestDatabaseGuardError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'LedgerTestDatabaseGuardError';
  }
}

export interface GuardEnv {
  NODE_ENV?: string;
  LEDGER_TEST_DATABASE_URL?: string;
  DATABASE_URL?: string;
}

/**
 * Pura (recebe o "env" como parâmetro) para ser testável sem precisar
 * manipular process.env de verdade — ver scratch/test-ledger-test-db-guard.ts.
 *
 * Discriminante em string ('OK'/'REJECTED'), não boolean: narrowing de union por
 * negação (`!result.ok`) de um discriminante boolean (`ok: true|false`) não se
 * comporta de forma confiável neste toolchain (mesmo problema já documentado em
 * deliveryConfirmedEntries.ts) — string literal narrowing é o padrão testado e
 * funcionando neste projeto.
 */
export function checkLedgerTestDatabaseGuard(env: GuardEnv): { status: 'OK'; url: string } | { status: 'REJECTED'; reason: string } {
  if (env.NODE_ENV === 'production') {
    return { status: 'REJECTED', reason: 'NODE_ENV=production — testes financeiros destrutivos nunca rodam em produção, independente de qualquer outra configuração.' };
  }
  const testUrl = env.LEDGER_TEST_DATABASE_URL;
  if (!testUrl) {
    return { status: 'REJECTED', reason: 'LEDGER_TEST_DATABASE_URL não configurada. Configure-a apontando para o Postgres de teste isolado (docker-compose.dev.yml) antes de rodar testes financeiros destrutivos/imutáveis.' };
  }
  if (testUrl === env.DATABASE_URL) {
    return { status: 'REJECTED', reason: 'LEDGER_TEST_DATABASE_URL é idêntica a DATABASE_URL — isso apontaria os testes destrutivos para o banco operacional. Configure um banco de teste realmente separado.' };
  }
  return { status: 'OK', url: testUrl };
}

/** Wrapper que lança em vez de retornar — para uso direto no topo de um script de teste. */
export function assertLedgerTestDatabaseGuard(env: GuardEnv = process.env as GuardEnv): string {
  const result = checkLedgerTestDatabaseGuard(env);
  if (result.status === 'REJECTED') {
    throw new LedgerTestDatabaseGuardError(`ABORTADO: ${result.reason}`);
  }
  // ISOLAMENTO DE REDIS: o `.env` aponta REDIS_URL para o Redis REAL (o mesmo da produção).
  // Testes que sobem roteadores (limitadores de taxa, cache) conectariam nele e gravariam
  // contadores/cache de teste. Zerar aqui faz src/db/redis.ts cair no fallback em memória
  // (ele lê REDIS_URL de forma preguiçosa, na primeira chamada). Só vale para o ambiente real
  // de `process.env`; chamadas com `env` injetado (testes unitários do guard) não são afetadas.
  if (env === (process.env as GuardEnv)) {
    process.env.REDIS_URL = '';
  }
  return result.url;
}
