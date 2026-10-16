#!/usr/bin/env node
'use strict';
/**
 * EXECUTOR SEGURO DE TESTES. Uso:  node scripts/with-test-env.cjs <comando…>      ex.: node scripts/with-test-env.cjs tsx tests/x.test.ts
 *
 * FALHA DE FORMA SEGURA — aborta ANTES de executar o comando (nada é escrito em lugar nenhum) se:
 *   1. LEDGER_TEST_DATABASE_URL não estiver definida (nunca cai para DATABASE_URL/.env);
 *   2. a URL não for local + nome descartável + diferente das URLs de produção do ambiente (scripts/lib/testDbSafety.cjs);
 *   3. NÃO for possível conectar e PROVAR no servidor que é o banco certo (current_database igual ao da URL, endereço do servidor local, fora de recuperação).
 * Só então executa o comando com o ambiente TRAVADO: DATABASE_URL = banco de teste; URLs de produção e Redis zerados (dotenv nunca sobrescreve variável
 * já definida); NUSALI_TEST_RUN=1; e o preload que recusa qualquer conexão pg fora do banco validado.
 *   --no-connect  pula só a prova (3) — usado nos testes unitários do próprio executor.
 */
const path = require('path');
const { spawn } = require('child_process');
const lib = require('./lib/testDbSafety.cjs');

const argv = process.argv.slice(2);
const noConnect = argv[0] === '--no-connect';
const cmd = noConnect ? argv.slice(1) : argv;
const fail = (code, msg) => { console.error(`\n[with-test-env] ABORTADO (nada foi executado): ${msg}\n`); process.exit(code); };
if (!cmd.length) fail(64, 'uso: node scripts/with-test-env.cjs <comando…>');

const url = process.env.LEDGER_TEST_DATABASE_URL;
if (!url) fail(78, 'LEDGER_TEST_DATABASE_URL não definida. Defina-a explicitamente para um Postgres local descartável (ex.: postgres://postgres:postgres@localhost:55434/rt_db).');
const verdict = lib.classifyTestDatabaseUrl(url, process.env);
if (verdict.status !== 'OK') fail(78, verdict.reason);

async function prove() {
  const pg = require('pg');
  const c = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 8000 });
  try { await c.connect(); } catch (e) { fail(78, `não foi possível conectar ao banco de teste (${e.message}). Suba o Postgres descartável antes.`); }
  try {
    const r = (await c.query(`select current_database() db, inet_server_addr()::text addr, pg_is_in_recovery() rec`)).rows[0];
    if (r.db !== verdict.db.database) fail(78, `current_database()="${r.db}" ≠ nome na URL "${verdict.db.database}".`);
    if (!lib.isLocalServerAddress(r.addr)) fail(78, `o servidor respondeu de um endereço não local (${r.addr}).`);
    if (r.rec) fail(78, 'o banco está em modo de recuperação/réplica — não é um banco de teste gravável.');
  } finally { await c.end().catch(() => {}); }
}

(async () => {
  if (!noConnect) await prove();
  const preload = path.join(__dirname, 'test-db-guard-preload.cjs').replace(/\\/g, '/');
  const env = {
    ...process.env,
    DATABASE_URL: url,
    PRODUCTION_DATABASE_URL: '', DIRECT_URL: '', SUPABASE_DB_URL: '',
    REDIS_URL: '',
    NODE_ENV: 'test',
    NUSALI_TEST_RUN: '1',
    NUSALI_TEST_DB_ALLOWED_URL: url,
    NUSALI_ALLOW_PRODUCTION_DB_FROM_SCRIPT: '',
    NODE_OPTIONS: `${process.env.NODE_OPTIONS || ''} --require "${preload}"`.trim(),
  };
  const child = spawn(cmd.join(' '), { stdio: 'inherit', shell: true, env });
  child.on('exit', (code, sig) => process.exit(code == null ? (sig ? 1 : 0) : code));
})().catch((e) => fail(70, e.message));
