'use strict';
/**
 * Espelho CommonJS de src/db/testDatabaseSafety.ts para os scripts de Node puro (executor + preload). A PARIDADE entre as duas implementações é
 * garantida por tests/test-db-safety.test.ts (mesma tabela de URLs/ambientes decide igual nas duas). Sem I/O.
 */
const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '[::1]']);
const DISPOSABLE_NAME = /^(rt_|test_|tmp_|dev_)[a-z0-9_]+$|(_test|_it|_ui|_co|_tmpl|_fresh|_upgrade|_rehearsal|_l\d+|_src|_v\d+|_stock|_mut[a-z0-9_]*)$/i;
const ALWAYS_PROTECTED_NAMES = ['postgres', 'template0', 'template1', 'p8d_restore', 'phase1_restore', 'restore_test'];

function parseDatabaseUrl(raw) {
  if (!raw || typeof raw !== 'string') return null;
  try {
    const u = new URL(raw);
    if (!/^postgres(ql)?:$/.test(u.protocol)) return null;
    return { host: u.hostname.toLowerCase(), port: u.port || '5432', database: decodeURIComponent(u.pathname.replace(/^\//, '')), protocol: u.protocol };
  } catch { return null; }
}
function knownProductionUrls(env) {
  return ['PRODUCTION_DATABASE_URL', 'DIRECT_URL', 'SUPABASE_DB_URL', 'DATABASE_URL'].map((k) => env[k]).filter(Boolean);
}
function classifyTestDatabaseUrl(rawUrl, env = {}) {
  const p = parseDatabaseUrl(rawUrl);
  if (!p) return { status: 'REJECTED', reason: 'URL do banco ausente ou inválida (esperado postgres://…).' };
  if (!LOOPBACK_HOSTS.has(p.host)) return { status: 'REJECTED', reason: `host "${p.host}" não é local (loopback). Testes só podem usar um Postgres descartável na própria máquina.` };
  const extra = (env.NUSALI_EXTRA_DISPOSABLE_DB_NAMES || '').split(',').map((s) => s.trim()).filter(Boolean);
  const prot = new Set([...ALWAYS_PROTECTED_NAMES, ...(env.NUSALI_PROTECTED_DB_NAMES || '').split(',').map((s) => s.trim()).filter(Boolean)].map((s) => s.toLowerCase()));
  if (prot.has(p.database.toLowerCase())) return { status: 'REJECTED', reason: `o banco "${p.database}" é protegido (padrão ou cópia de restauração de produção).` };
  if (!DISPOSABLE_NAME.test(p.database) && !extra.includes(p.database)) return { status: 'REJECTED', reason: `o nome do banco "${p.database}" não parece descartável (esperado prefixo rt_/test_/tmp_/dev_ ou sufixo _it/_ui/_tmpl/_rehearsal…).` };
  for (const prodRaw of knownProductionUrls(env)) {
    const q = parseDatabaseUrl(prodRaw);
    if (q && q.host === p.host && q.port === p.port && q.database === p.database) return { status: 'REJECTED', reason: 'a URL coincide com uma URL de produção configurada no ambiente.' };
  }
  return { status: 'OK', db: p };
}
/** o endereço do servidor visto pelo próprio Postgres tem de ser loopback ou a rede privada do Docker (nunca um IP público). */
function isLocalServerAddress(addr) {
  if (addr == null) return true; // socket unix
  const a = String(addr).replace(/\/\d+$/, '');
  return a === '::1' || /^127\./.test(a) || /^172\.(1[6-9]|2\d|3[01])\./.test(a) || /^192\.168\./.test(a) || /^10\./.test(a);
}
module.exports = { parseDatabaseUrl, classifyTestDatabaseUrl, knownProductionUrls, isLocalServerAddress, LOOPBACK_HOSTS };
