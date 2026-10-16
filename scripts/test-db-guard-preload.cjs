'use strict';
/**
 * PRELOAD (node --require) de segurança para testes. Ativo só quando NUSALI_TEST_RUN=1 (definido por scripts/with-test-env.cjs). Troca pg.Client#connect
 * por uma versão que RECUSA (antes de qualquer pacote de rede) qualquer conexão cujo host+porta+banco não seja EXATAMENTE o banco de teste validado
 * (NUSALI_TEST_DB_ALLOWED_URL). Cobre conexões diretas (`new pg.Pool(...)`, `new pg.Client(...)`, drizzle) que não passam por getDb().
 */
const lib = require('./lib/testDbSafety.cjs');
if (process.env.NUSALI_TEST_RUN === '1') {
  const allowed = lib.parseDatabaseUrl(process.env.NUSALI_TEST_DB_ALLOWED_URL);
  const pg = require('pg');
  const original = pg.Client.prototype.connect;
  pg.Client.prototype.connect = function guardedConnect(cb) {
    const p = this.connectionParameters || {};
    const host = String(p.host || 'localhost').toLowerCase();
    const port = String(p.port || 5432);
    const database = p.database;
    const ok = allowed && host === allowed.host && port === allowed.port && database === allowed.database;
    if (!ok) {
      const err = new Error(`TEST_DB_SAFETY: conexão RECUSADA para ${host}:${port}/${database} — em teste só é permitido o banco descartável validado (${allowed ? `${allowed.host}:${allowed.port}/${allowed.database}` : 'nenhum configurado'}).`);
      err.code = 'TEST_DB_SAFETY';
      if (typeof cb === 'function') { process.nextTick(() => cb(err)); return undefined; }
      return Promise.reject(err);
    }
    return original.apply(this, arguments);
  };
}
