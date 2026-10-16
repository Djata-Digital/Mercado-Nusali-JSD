/**
 * PROTEÇÃO CONTRA TESTE EM BANCO REAL (incidente 2026-10-16: um teste antigo carregou o `.env` e gravou pedidos/ledger de teste na PRODUÇÃO).
 *
 * Princípio: FALHAR DE FORMA SEGURA. Um processo que parece ser de teste/diagnóstico (script em scratch/ ou tests/, arquivo test-*.ts / *.test.ts, ou
 * NUSALI_TEST_RUN=1) só pode abrir conexão com um banco que seja, ao mesmo tempo, (1) LOCAL (loopback), (2) de nome DESCARTÁVEL e fora da lista de nomes
 * protegidos, e (3) diferente de qualquer URL de produção conhecida do ambiente. Qualquer dúvida => exceção ANTES de abrir a conexão (nada é escrito).
 *
 * Funções PURAS (sem I/O): recebem URL/ambiente/argv como parâmetro, para serem testadas sem tocar em process.env nem em banco.
 * O servidor em produção (dist/server.cjs) nunca é "processo de teste": nada muda para ele.
 */

export class TestDatabaseSafetyError extends Error {
  code = 'TEST_DB_SAFETY';
  constructor(message: string) {
    super(message);
    this.name = 'TestDatabaseSafetyError';
  }
}

/** Token exato que um script OPERACIONAL (migração/diagnóstico em scratch/) deve declarar para tocar numa base real de propósito. Nunca vale em NUSALI_TEST_RUN=1. */
export const PRODUCTION_FROM_SCRIPT_TOKEN = 'I_UNDERSTAND_THIS_CAN_WRITE_TO_PRODUCTION';

const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '[::1]']);

/**
 * Nome descartável: prefixos rt_/test_/tmp_/dev_ ou sufixos usados pelos bancos de teste do projeto (_it, _ui, _co, _tmpl, _fresh, _upgrade, _rehearsal, _l1,
 * _src, _v2, _stock, _mut*). Lista conservadora: um nome fora dela é recusado (acrescente via NUSALI_EXTRA_DISPOSABLE_DB_NAMES, nome exato).
 */
const DISPOSABLE_NAME = /^(rt_|test_|tmp_|dev_)[a-z0-9_]+$|(_test|_it|_ui|_co|_tmpl|_fresh|_upgrade|_rehearsal|_l\d+|_src|_v\d+|_stock|_mut[a-z0-9_]*)$/i;
/** Nunca aceitos como banco de teste, mesmo em loopback (cópias de restauração de produção e bancos padrão). */
const ALWAYS_PROTECTED_NAMES = ['postgres', 'template0', 'template1', 'p8d_restore', 'phase1_restore', 'restore_test'];

export interface EnvLike { [k: string]: string | undefined }

export interface ParsedDbUrl { host: string; port: string; database: string; protocol: string }

export function parseDatabaseUrl(raw: string | undefined | null): ParsedDbUrl | null {
  if (!raw || typeof raw !== 'string') return null;
  try {
    const u = new URL(raw);
    if (!/^postgres(ql)?:$/.test(u.protocol)) return null;
    return { host: u.hostname.toLowerCase(), port: u.port || '5432', database: decodeURIComponent(u.pathname.replace(/^\//, '')), protocol: u.protocol };
  } catch {
    return null;
  }
}

/** URLs de produção conhecidas no ambiente (qualquer variável de conexão que não seja a de teste). */
export function knownProductionUrls(env: EnvLike): string[] {
  return ['PRODUCTION_DATABASE_URL', 'DIRECT_URL', 'SUPABASE_DB_URL', 'DATABASE_URL']
    .map((k) => env[k])
    .filter((v): v is string => !!v);
}

export type DbVerdict = { status: 'OK'; db: ParsedDbUrl } | { status: 'REJECTED'; reason: string };

/** Decide se uma URL pode ser usada por um processo de teste. */
export function classifyTestDatabaseUrl(rawUrl: string | undefined | null, env: EnvLike = {}): DbVerdict {
  const p = parseDatabaseUrl(rawUrl);
  if (!p) return { status: 'REJECTED', reason: 'URL do banco ausente ou inválida (esperado postgres://…).' };
  if (!LOOPBACK_HOSTS.has(p.host)) return { status: 'REJECTED', reason: `host "${p.host}" não é local (loopback). Testes só podem usar um Postgres descartável na própria máquina.` };
  const extra = (env.NUSALI_EXTRA_DISPOSABLE_DB_NAMES || '').split(',').map((s) => s.trim()).filter(Boolean);
  const protectedNames = new Set([...ALWAYS_PROTECTED_NAMES, ...(env.NUSALI_PROTECTED_DB_NAMES || '').split(',').map((s) => s.trim()).filter(Boolean)].map((s) => s.toLowerCase()));
  if (protectedNames.has(p.database.toLowerCase())) return { status: 'REJECTED', reason: `o banco "${p.database}" é protegido (padrão ou cópia de restauração de produção).` };
  if (!DISPOSABLE_NAME.test(p.database) && !extra.includes(p.database)) {
    return { status: 'REJECTED', reason: `o nome do banco "${p.database}" não parece descartável (esperado prefixo rt_/test_/tmp_/dev_ ou sufixo _it/_ui/_tmpl/_rehearsal…).` };
  }
  for (const prodRaw of knownProductionUrls(env)) {
    const q = parseDatabaseUrl(prodRaw);
    if (q && q.host === p.host && q.port === p.port && q.database === p.database) {
      return { status: 'REJECTED', reason: 'a URL coincide com uma URL de produção configurada no ambiente.' };
    }
  }
  return { status: 'OK', db: p };
}

/** Este processo é um teste/diagnóstico? (por variável explícita ou pelo caminho/nome do script de entrada) */
export function isTestProcess(argv1: string | undefined, env: EnvLike): boolean {
  if (env.NUSALI_TEST_RUN === '1') return true;
  if (!argv1) return false;
  const norm = argv1.replace(/\\/g, '/');
  const base = norm.split('/').pop() || '';
  return /(^|\/)(scratch|tests)\//.test(norm) || /^test-.+\.(ts|tsx|cjs|mjs|js)$/.test(base) || /\.test\.(ts|tsx|cjs|mjs|js)$/.test(base);
}

/**
 * Chamada ANTES de abrir qualquer conexão (ver getDbPool). Não faz nada fora de processos de teste/diagnóstico. Dentro deles lança
 * TestDatabaseSafetyError se a URL não for um banco descartável local — salvo um script operacional que declare o token exato (nunca com NUSALI_TEST_RUN=1).
 */
export function assertDatabaseAllowedForProcess(connectionString: string | undefined, env: EnvLike, argv1: string | undefined): void {
  if (!isTestProcess(argv1, env)) return;
  // A URL verificada É o DATABASE_URL do processo: compará-la com ele mesmo a recusaria sempre. As demais variáveis de produção continuam na comparação.
  const { DATABASE_URL: _self, ...envForCheck } = env;
  const verdict = classifyTestDatabaseUrl(connectionString, envForCheck);
  if (verdict.status === 'OK') return;
  if (env.NUSALI_TEST_RUN !== '1' && env.NUSALI_ALLOW_PRODUCTION_DB_FROM_SCRIPT === PRODUCTION_FROM_SCRIPT_TOKEN) {
    // script operacional deliberado (migração/diagnóstico): permitido, mas nunca em silêncio
    console.warn(`[testDatabaseSafety] AVISO: script "${argv1}" usa um banco NÃO descartável por declaração explícita (${verdict.reason}).`);
    return;
  }
  throw new TestDatabaseSafetyError(
    `ABORTADO antes de conectar: processo de teste/diagnóstico ("${argv1 ?? 'NUSALI_TEST_RUN=1'}") tentou abrir um banco que não é um Postgres descartável local — ${verdict.reason} ` +
      'Rode pelo executor seguro (node scripts/with-test-env.cjs …) com LEDGER_TEST_DATABASE_URL apontando para um banco local descartável. ' +
      'Scripts operacionais que precisam de um banco real devem declarar NUSALI_ALLOW_PRODUCTION_DB_FROM_SCRIPT explicitamente.'
  );
}
