/**
 * FASE 8C.3 — renovacao do papel temporario como no Supabase: o usuario administrador NAO e superusuario (so CREATEROLE) e, ao criar o
 * papel, recebe apenas ADMIN OPTION (sem herdar/assumir o papel). Reproduz o 42501 do DROP OWNED BY e prova a renovacao com ALTER ROLE.
 * PostgreSQL 17 DESCARTAVEL. Nunca producao.
 */
import pg from 'pg';
import { LIMITED_WRITER_ROLE as ROLE, createRoleSql, revokeRoleSql, verifyLimitedWriterSession } from '../scripts/attribute-matrix/limitedWriter.js';

let passed = 0, total = 0;
const report = (l: string, ok: boolean, d?: unknown) => { total++; if (ok) passed++; console.log(`[${ok ? 'PASS' : 'FAIL'}] ${l}${ok ? '' : ' -> ' + JSON.stringify(d ?? null).slice(0, 500)}`); };
const HOST = 'localhost:55434', DB = 'p8c3_renew', SB = 'sb_postgres', SBPW = 'sbpw';
const MARK = '<<DEFINA-AQUI-UMA-SENHA-LONGA-E-ALEATORIA>>';
const sql = (pw: string) => createRoleSql().split(MARK).join(pw);
const PW = (c: string) => `Senha${c}`.padEnd(40, c);

async function main() {
  const A = new pg.Pool({ connectionString: `postgres://postgres:postgres@${HOST}/postgres`, max: 1 });
  await A.query(`DROP DATABASE IF EXISTS ${DB}`); await A.query(`CREATE DATABASE ${DB} TEMPLATE phase3_tmpl`);
  for (const r of [SB, ROLE]) await A.query(`DROP ROLE IF EXISTS ${r}`).catch(() => undefined);
  await A.query(`CREATE ROLE ${SB} LOGIN PASSWORD '${SBPW}' CREATEROLE NOSUPERUSER`);
  const su = new pg.Pool({ connectionString: `postgres://postgres:postgres@${HOST}/${DB}`, max: 1 });
  // o administrador do Supabase e dono das tabelas e do schema public, sem ser superusuario
  await su.query(`DO $$ DECLARE r record; BEGIN FOR r IN SELECT c.relname, c.relkind FROM pg_class c WHERE c.relnamespace='public'::regnamespace AND c.relkind IN ('r','p','v','m','S') LOOP EXECUTE format('ALTER %s public.%I OWNER TO ${SB}', CASE r.relkind WHEN 'S' THEN 'SEQUENCE' WHEN 'v' THEN 'VIEW' WHEN 'm' THEN 'MATERIALIZED VIEW' ELSE 'TABLE' END, r.relname); END LOOP; END $$; ALTER SCHEMA public OWNER TO ${SB}; GRANT CONNECT ON DATABASE ${DB} TO ${SB};`);
  const sb = new pg.Pool({ connectionString: `postgres://${SB}:${SBPW}@${HOST}/${DB}`, max: 1 });
  const roleUrl = (pw: string) => `postgres://${ROLE}:${pw}@${HOST}/${DB}`;
  const sessionOk = async (pw: string) => { const p = new pg.Pool({ connectionString: roleUrl(pw), max: 1 }); p.on('error', () => undefined); try { return await verifyLimitedWriterSession(p); } catch (e: any) { return e as Error; } finally { await p.end().catch(() => undefined); } };
  const loginOk = async (pw: string) => { const p = new pg.Pool({ connectionString: roleUrl(pw), max: 1 }); p.on('error', () => undefined); try { await p.query('select 1'); return true; } catch { return false; } finally { await p.end().catch(() => undefined); } };
  const facts = async () => (await su.query(`select rolcanlogin, rolconnlimit, rolvaliduntil, rolconfig, rolsuper, rolcreaterole, rolcreatedb, rolreplication, rolbypassrls, rolinherit from pg_roles where rolname='${ROLE}'`)).rows[0];

  // ---- causa raiz
  await sb.query(sql(PW('1')));
  const mem = (await su.query(`select m.admin_option, m.inherit_option, m.set_option from pg_auth_members m join pg_roles r on r.oid=m.roleid join pg_roles u on u.oid=m.member where r.rolname='${ROLE}' and u.rolname='${SB}'`)).rows[0];
  report('C1 o administrador (CREATEROLE, nao superusuario) recebe so ADMIN OPTION sobre o papel criado: sem INHERIT e sem SET', mem?.admin_option === true && mem?.inherit_option === false && mem?.set_option === false, mem);
  const dropOwned = await sb.query(`DROP OWNED BY ${ROLE}`).then(() => 'OK').catch((e) => e.code + ' ' + e.message);
  report('C2 REPRODUZIDO: DROP OWNED BY falha com 42501 "permission denied to drop objects" (o erro do script antigo)', /^42501 permission denied to drop objects/.test(dropOwned), dropOwned);

  // ---- criacao (papel inexistente) pelo novo SQL
  await su.query(`REVOKE ALL ON ALL TABLES IN SCHEMA public FROM ${ROLE}`); await su.query(`REVOKE ALL ON SCHEMA public FROM ${ROLE}`); await su.query(`DROP ROLE ${ROLE}`);
  const e1 = await sb.query(sql(PW('A'))).then(() => null, (e) => e);
  const s1 = await sessionOk(PW('A'));
  report('N1 papel inexistente: o novo SQL CRIA (como administrador nao superusuario) e a sessao do papel passa na verificacao completa', !e1 && !(s1 instanceof Error) && (s1 as any).minutesLeft > 170, e1?.message ?? (s1 as any)?.message);
  const f1 = await facts();
  report('N2 atributos exatos: login, limite 2 conexoes, sem poderes administrativos, statement_timeout 60s e idle_in_transaction 30s', f1.rolcanlogin && f1.rolconnlimit === 2 && !f1.rolsuper && !f1.rolcreaterole && !f1.rolcreatedb && !f1.rolreplication && !f1.rolbypassrls && !f1.rolinherit && f1.rolconfig.includes('statement_timeout=60s') && f1.rolconfig.includes('idle_in_transaction_session_timeout=30s'), f1);

  // ---- renovacao do papel EXISTENTE E EXPIRADO, sem DROP
  await su.query(`ALTER ROLE ${ROLE} VALID UNTIL '2020-01-01'`);
  report('R0 pre-condicao: papel expirado nao consegue logar nem com a senha certa', (await loginOk(PW('A'))) === false);
  const e2 = await sb.query(sql(PW('B'))).then(() => null, (e) => e);
  const s2 = await sessionOk(PW('B'));
  report('R1 RENOVACAO: o novo SQL roda sem erro como administrador, o prazo volta a ~3 h e a sessao passa na verificacao', !e2 && !(s2 instanceof Error) && (s2 as any).minutesLeft > 170 && (s2 as any).minutesLeft <= 185, e2?.message ?? (s2 as any)?.message);
  report('R2 a senha ANTIGA deixa de funcionar e a NOVA funciona', (await loginOk(PW('A'))) === false && (await loginOk(PW('B'))) === true);
  const f2 = await facts();
  report('R3 limites preservados na renovacao: 2 conexoes, sem poderes administrativos, configuracoes de tempo mantidas', f2.rolconnlimit === 2 && !f2.rolsuper && !f2.rolcreaterole && !f2.rolcreatedb && !f2.rolreplication && !f2.rolbypassrls && f2.rolconfig.includes('statement_timeout=60s'), f2);

  // ---- privilegios voltam a ser EXATAMENTE os minimos (inclusive se alguem tiver ampliado)
  await su.query(`GRANT UPDATE ON public.products TO ${ROLE}; GRANT INSERT ON public.orders TO ${ROLE}; GRANT UPDATE (commission_rate) ON public.categories TO ${ROLE}; GRANT DELETE ON public.audit_logs TO ${ROLE}; ALTER ROLE ${ROLE} CONNECTION LIMIT 50`);
  const bad = await sessionOk(PW('B'));
  report('P0 pre-condicao: papel com privilegios ampliados e RECUSADO pela verificacao de sessao', bad instanceof Error && /EXCESS_PRIVILEGES/.test(bad.message), (bad as Error).message?.slice(0, 120));
  const e3 = await sb.query(sql(PW('C'))).then(() => null, (e) => e);
  const s3 = await sessionOk(PW('C'));
  const f3 = await facts();
  report('P1 a renovacao REVOGA os privilegios extras e restaura o limite: a sessao volta a passar e o limite e 2', !e3 && !(s3 instanceof Error) && f3.rolconnlimit === 2, e3?.message ?? (s3 as any)?.message ?? f3);
  const priv = (await su.query(`select has_table_privilege('${ROLE}','public.products','UPDATE') p, has_table_privilege('${ROLE}','public.orders','INSERT') o, has_any_column_privilege('${ROLE}','public.categories','UPDATE') c, has_table_privilege('${ROLE}','public.audit_logs','DELETE') a, has_table_privilege('${ROLE}','public.category_attributes','INSERT') ci, has_table_privilege('${ROLE}','public.category_attributes','DELETE') cd, has_table_privilege('${ROLE}','public.audit_logs','INSERT') ai, has_table_privilege('${ROLE}','public.categories','SELECT') cs`)).rows[0];
  report('P2 privilegios finais exatos: sem UPDATE/INSERT/DELETE indevidos; com INSERT+DELETE em atributos, INSERT em auditoria e SELECT onde precisa', !priv.p && !priv.o && !priv.c && !priv.a && priv.ci && priv.cd && priv.ai && priv.cs, priv);

  // ---- idempotencia
  const e4 = await sb.query(sql(PW('D'))).then(() => null, (e) => e);
  const e5 = await sb.query(sql(PW('E'))).then(() => null, (e) => e);
  report('I1 rodar o SQL varias vezes seguidas e seguro (idempotente) e a ultima senha vale', !e4 && !e5 && (await loginOk(PW('E'))) && !(await loginOk(PW('D'))));

  // ---- desativacao (revoke) sem DROP OWNED
  await su.query(`ALTER ROLE ${ROLE} VALID UNTIL '2030-01-01'`);
  const held = new pg.Client({ connectionString: roleUrl(PW('E')) }); held.on('error', () => undefined); await held.connect();
  const rv = await sb.query(revokeRoleSql()).then(() => null, (e) => e);
  const after = await su.query(`select count(*)::int n, count(*) filter (where rolcanlogin)::int login from pg_roles where rolname='${ROLE}'`);
  report('V1 revogacao como administrador nao superusuario: sem erro; papel removido ou desativado (sem login)', !rv && after.rows[0].login === 0, rv?.message ?? after.rows[0]);
  report('V2 depois da revogacao: nova conexao recusada', (await loginOk(PW('E'))) === false);
  await held.end().catch(() => undefined);
  const state = after.rows[0].n === 0 ? 'removido' : (await su.query(`select has_table_privilege('${ROLE}','public.category_attributes','INSERT') i`)).rows[0].i === false ? 'desativado sem privilegios' : 'COM PRIVILEGIOS';
  report(`V3 estado final seguro (${state})`, state !== 'COM PRIVILEGIOS', state);
  const e6 = await sb.query(revokeRoleSql()).then(() => null, (e) => e);
  report('V4 a revogacao e idempotente (rodar de novo nao falha)', !e6, e6?.message);
  // ---- recriar depois de revogar
  const e7 = await sb.query(sql(PW('F'))).then(() => null, (e) => e);
  const s7 = await sessionOk(PW('F'));
  report('V5 apos a revogacao o mesmo SQL recria/renova e a sessao passa na verificacao', !e7 && !(s7 instanceof Error), e7?.message ?? (s7 as any)?.message);

  await sb.end(); await su.end();
  await A.query(`DROP DATABASE IF EXISTS ${DB}`);
  for (const r of [ROLE, SB]) await A.query(`DROP ROLE IF EXISTS ${r}`).catch(() => undefined);
  await A.end();
  console.log(`\n=== RESULTADO: ${passed}/${total} ===`);
  process.exit(passed === total ? 0 : 1);
}
main().catch((e) => { console.error('ERRO FATAL', e); process.exit(2); });
