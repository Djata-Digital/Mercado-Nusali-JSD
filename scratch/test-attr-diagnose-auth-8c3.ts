/** FASE 8C.3 — testa scripts/attribute-matrix/diagnose-auth.ts (conferencia local da senha x segredo SCRAM). PostgreSQL 17 DESCARTAVEL. */
import { spawnSync } from 'child_process';
import pg from 'pg';
import crypto from 'crypto';
import { scramMatches } from '../scripts/attribute-matrix/diagnose-auth.js';
import { createRoleSql, LIMITED_WRITER_ROLE } from '../scripts/attribute-matrix/limitedWriter.js';

let passed = 0, total = 0;
const report = (l: string, ok: boolean, d?: unknown) => { total++; if (ok) passed++; console.log(`[${ok ? 'PASS' : 'FAIL'}] ${l}${ok ? '' : ' -> ' + JSON.stringify(d ?? null).slice(0, 500)}`); };
const HOST = 'localhost:55434', DB = 'p8c3_auth';
const ADMIN_URL = `postgres://postgres:postgres@${HOST}/${DB}`;
const roleUrl = (pw: string, suffix = '') => `postgresql://${LIMITED_WRITER_ROLE}${suffix}:${encodeURIComponent(pw)}@${HOST}/${DB}`;
const run = (url: string) => {
  const r = spawnSync(process.execPath, ['--import', 'tsx', 'scripts/attribute-matrix/diagnose-auth.ts'], { env: { ...process.env, ATTR_LOAD_DATABASE_URL: url, ATTR_VERIFY_ADMIN_URL: ADMIN_URL, DATABASE_URL: ADMIN_URL }, encoding: 'utf8', timeout: 120000 });
  return (r.stdout || '') + (r.stderr || '');
};

async function main() {
  const admin = new pg.Pool({ connectionString: `postgres://postgres:postgres@${HOST}/postgres`, max: 1 });
  await admin.query(`DROP DATABASE IF EXISTS ${DB}`); await admin.query(`CREATE DATABASE ${DB} TEMPLATE phase3_tmpl`);
  await admin.query(`DO $$ BEGIN IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='${LIMITED_WRITER_ROLE}') THEN EXECUTE 'DROP OWNED BY ${LIMITED_WRITER_ROLE}'; EXECUTE 'DROP ROLE ${LIMITED_WRITER_ROLE}'; END IF; END $$;`).catch(() => undefined);
  const su = new pg.Pool({ connectionString: ADMIN_URL, max: 1 });
  const setPw = async (pw: string) => { await su.query(`DO $$ BEGIN IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='${LIMITED_WRITER_ROLE}') THEN EXECUTE 'DROP OWNED BY ${LIMITED_WRITER_ROLE}'; EXECUTE 'DROP ROLE ${LIMITED_WRITER_ROLE}'; END IF; END $$;`); await su.query(createRoleSql().replace('<<DEFINA-AQUI-UMA-SENHA-LONGA-E-ALEATORIA>>', pw.replace(/'/g, "''"))); };

  // puro
  report('A1 scramMatches: confere senha certa, recusa errada e formato desconhecido => null', (() => { const salt = Buffer.from('saltsaltsaltsalt'); const sp = crypto.pbkdf2Sync('abc', salt, 4096, 32, 'sha256'); const ck = crypto.createHmac('sha256', sp).update('Client Key').digest(); const stored = crypto.createHash('sha256').update(ck).digest().toString('base64'); const sec = `SCRAM-SHA-256$4096:${salt.toString('base64')}$${stored}:xxxx`; return scramMatches('abc', sec) === true && scramMatches('abd', sec) === false && scramMatches('abc', 'md5abc') === null; })());

  const PW = 'Senha!de:teste/8c3#longa';
  await setPw(PW);
  const ok = run(roleUrl(PW));
  report('B1 senha certa (com caracteres especiais): "CONFERE", papel dentro do prazo, rota conecta; nenhum segredo impresso', /CONFERE com a senha armazenada/.test(ok) && /dentro do prazo/.test(ok) && /CONECTOU como "attr_loader_8c3"/.test(ok) && !ok.includes(PW) && !ok.includes(encodeURIComponent(PW)) && !/SCRAM-SHA-256\$/.test(ok), ok.slice(0, 600));
  const bad = run(roleUrl('Senha!de:teste/8c3#longA'));
  report('B2 senha errada (1 caractere): "NÃO CONFERE" e a rota falha com [28P01]; a senha digitada nao aparece', /NÃO CONFERE/.test(bad) && /\[28P01\]/.test(bad) && !bad.includes('longA') && !/SCRAM-SHA-256\$/.test(bad), bad.slice(0, 700));
  await setPw('Sénha-çãõ-€-123');
  const na = run(roleUrl('Sénha-çãõ-€-123'));
  report('B3 senha com acentos e simbolos (nao ASCII): confere e conecta', /CONFERE com a senha armazenada/.test(na) && /CONECTOU/.test(na) && /fora do ASCII/.test(na), na.slice(0, 500));
  await setPw('senha-com-espaco-final ');
  const sp = run(roleUrl('senha-com-espaco-final'));
  report('B4 senha digitada sem o espaco final que o SQL guardou: "NÃO CONFERE" e aviso de espaco', /NÃO CONFERE/.test(sp), sp.slice(0, 500));
  const sp2 = run(roleUrl('senha-com-espaco-final '));
  report('B5 com o espaco: confere e avisa que a senha tem espaco no fim', /CONFERE com a senha armazenada/.test(sp2) && /espaço no início\/fim/.test(sp2), sp2.slice(0, 500));
  await setPw(PW);
  await su.query(`ALTER ROLE ${LIMITED_WRITER_ROLE} VALID UNTIL '2020-01-01'`);
  const exp = run(roleUrl(PW));
  report('B6 papel expirado: reportado como EXPIRADO (a senha ainda confere) e a rota falha com [28P01]', /EXPIRADO/.test(exp) && /CONFERE com a senha armazenada/.test(exp) && /\[28P01\]/.test(exp), exp.slice(0, 600));
  await su.query(`DROP OWNED BY ${LIMITED_WRITER_ROLE}`).catch(() => undefined); await su.query(`DROP ROLE IF EXISTS ${LIMITED_WRITER_ROLE}`);
  const gone = run(roleUrl(PW));
  report('B7 papel inexistente (revogado): informa que o papel nao existe', /NÃO existe/.test(gone), gone.slice(0, 500));
  await su.end(); await admin.query(`DROP DATABASE IF EXISTS ${DB}`); await admin.end();
  console.log(`\n=== RESULTADO: ${passed}/${total} ===`);
  process.exit(passed === total ? 0 : 1);
}
main().catch((e) => { console.error('ERRO FATAL', e); process.exit(2); });
