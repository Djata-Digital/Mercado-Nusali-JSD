/**
 * FASE 8C.3 — papel DEDICADO de privilegios minimos (limitedWriter.ts): o SQL de criacao/revogacao e a verificacao da SESSAO, em
 * PostgreSQL 17 DESCARTAVEL. Prova: (1) a carga completa (847) e a reversao funcionam COM o papel; (2) o papel NAO consegue escrever em
 * mais nada; (3) cada desvio do papel e recusado pela verificacao; (4) a revogacao remove o acesso. Nunca producao.
 * (Este teste NAO liga o carregador a producao: a integracao com loaderSafety/load.ts depende de decisao do responsavel.)
 */
import fs from 'fs';
import pg from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import * as schema from '../src/db/schema.js';
import { ALL_PLANS } from '../src/data/attributeMatrix/index.js';
import { buildTree, compileOperations, resolveMatrix } from '../src/data/attributeMatrix/engine.js';
import { applyOperations, rollbackOperations } from '../scripts/attribute-matrix/applyEngine.js';
import { verifyEffective } from '../scripts/attribute-matrix/verifyEffective.js';
import { LIMITED_WRITER_ROLE, createRoleSql, revokeRoleSql, urlUserMatchesLimitedRole, verifyLimitedWriterSession } from '../scripts/attribute-matrix/limitedWriter.js';

let passed = 0, total = 0;
const report = (l: string, ok: boolean, d?: unknown) => { total++; if (ok) passed++; console.log(`[${ok ? 'PASS' : 'FAIL'}] ${l}${ok ? '' : ' -> ' + JSON.stringify(d ?? null).slice(0, 500)}`); };
const HOST = 'localhost:55434';
const ADMIN = `postgres://postgres:postgres@${HOST}/postgres`;
const PASS = 'senha_de_teste_8c3_longa_e_aleatoria';
const dbUrl = (db: string, user = 'postgres', pw = 'postgres') => `postgres://${user}:${pw}@${HOST}/${db}`;

async function main() {
  const admin = new pg.Pool({ connectionString: ADMIN, max: 1 });
  const DB = 'p8c3_role';
  await admin.query(`DROP DATABASE IF EXISTS ${DB}`); await admin.query(`CREATE DATABASE ${DB} TEMPLATE phase3_tmpl`);
  const su = new pg.Pool({ connectionString: dbUrl(DB), max: 2 });
  const inv = JSON.parse(fs.readFileSync('docs/attribute-matrix/v1/categories.inventory.raw.json', 'utf8'));
  for (const c of inv.categories.filter((x: any) => !x.parent_id)) await su.query('INSERT INTO categories (id,name,slug,icon,display_order,is_active,created_at) VALUES ($1,$2,$3,$4,$5,$6,now())', [c.id, c.name, c.slug, c.icon, c.display_order ?? 0, c.is_active]);
  for (const c of inv.categories.filter((x: any) => x.parent_id)) await su.query('INSERT INTO categories (id,name,slug,icon,parent_id,display_order,is_active,created_at) VALUES ($1,$2,$3,$4,$5,$6,$7,now())', [c.id, c.name, c.slug, c.icon, c.parent_id, c.display_order ?? 0, c.is_active]);
  const sqlCreate = createRoleSql().replace('<<DEFINA-AQUI-UMA-SENHA-LONGA-E-ALEATORIA>>', PASS);

  // ---- A. pura
  report('A1 o usuario da URL e reconhecido com e sem sufixo do pooler ("papel.refprojeto"); outros usuarios nao', urlUserMatchesLimitedRole(LIMITED_WRITER_ROLE) && urlUserMatchesLimitedRole(`${LIMITED_WRITER_ROLE}.abcdefghij`) && !urlUserMatchesLimitedRole('postgres') && !urlUserMatchesLimitedRole(`x${LIMITED_WRITER_ROLE}`) && !urlUserMatchesLimitedRole('postgres.abcdefghij'));
  report('A2 o prazo do papel nunca excede o teto de 3 h na geracao do SQL', (() => { try { createRoleSql(4); return false; } catch { return true; } })() && /interval '3 hours'/.test(createRoleSql()));

  // ---- B. criacao pelo SQL e uso
  await su.query(sqlCreate);
  const role = new pg.Pool({ connectionString: dbUrl(DB, LIMITED_WRITER_ROLE, PASS), max: 2 });
  const rep = await verifyLimitedWriterSession(role).catch((e) => e);
  report('B1 sessao do papel criado pelo SQL e APROVADA (papel exato, prazo ate 3 h, sem atributos admin, sem heranca, sem CREATE, escrita so em category_attributes e audit_logs)', !(rep instanceof Error) && rep.role === LIMITED_WRITER_ROLE && rep.minutesLeft > 170 && rep.minutesLeft <= 185 && rep.allowedWrites.sort().join() === 'public.audit_logs:INSERT,public.category_attributes:DELETE,public.category_attributes:INSERT', rep instanceof Error ? rep.message : rep);
  const roleDb = drizzle(role, { schema });
  const tree = buildTree(inv.categories);
  const resolution = resolveMatrix(ALL_PLANS, tree);
  const ops = compileOperations(ALL_PLANS, tree, resolution);
  // leituras do preflight do carregador sob o papel
  const pre = await role.query('SELECT id, slug, parent_id FROM categories').then((r) => r.rows.length).catch((e) => e.message);
  const cols = await role.query("SELECT column_name FROM information_schema.columns WHERE table_name = 'category_attributes'").then((r) => r.rows.length).catch((e) => e.message);
  const chk = await role.query("SELECT pg_get_constraintdef(oid) d FROM pg_constraint WHERE conname = 'category_attributes_source_check'").then((r) => /seed/.test(r.rows[0]?.d || '')).catch((e) => e.message);
  report('B2 leituras do pre-voo funcionam com os privilegios minimos (categorias 322, colunas, CHECK de origem)', pre === 322 && cols >= 24 && chk === true, { pre, cols, chk });
  const dry = await applyOperations(roleDb, ops, { dryRun: true });
  report('B3 dry-run sob o papel: 847 a criar, 0 deriva, 0 erros', dry.created === 847 && dry.errors.length === 0 && dry.drift.length === 0, dry.errors.slice(0, 2));
  const pilot = await applyOperations(roleDb, ops, { batchSize: 50, stopAfter: 100 });
  const cnt = async () => Number((await su.query('SELECT count(*)::int n FROM category_attributes')).rows[0].n);
  report('B4 piloto sob o papel (100 operacoes, lotes de 50): exatamente 100 linhas, todas source=seed, sem erro', pilot.created === 100 && pilot.stoppedEarly && pilot.errors.length === 0 && (await cnt()) === 100 && Number((await su.query("SELECT count(*)::int n FROM category_attributes WHERE source='seed'")).rows[0].n) === 100, pilot.errors.slice(0, 2));
  const rest = await applyOperations(roleDb, ops, { batchSize: 50 });
  report('B5 restante sob o papel: cria as 747 restantes (pula as 100), total 847, 0 deriva', rest.created === 747 && rest.skipped === 100 && rest.errors.length === 0 && rest.drift.length === 0 && (await cnt()) === 847, rest.errors.slice(0, 2));
  const idBySlug = new Map<string, string>(inv.categories.map((c: any) => [c.slug, c.id]));
  const ver = await verifyEffective(roleDb, resolution.effective, idBySlug);
  report('B6 verificacao dos efetivos das 322 categorias sob o papel: sem divergencia', ver.checked === 322 && ver.mismatches.length === 0, ver.mismatches.slice(0, 2));
  const aud = await role.query(`INSERT INTO audit_logs (id, action, resource, details_json, created_at) VALUES ('audit_t1', 'system.attribute_matrix.window_opened', 'category_attributes', '{"t":1}', now())`).then(() => true).catch((e) => e.message);
  report('B7 o papel consegue gravar a auditoria da janela (INSERT em audit_logs)', aud === true, aud);

  // ---- C. o papel NAO consegue escrever em mais nada
  const denied = async (sql: string) => role.query(sql).then(() => 'PERMITIDO').catch((e) => (/permission denied/.test(e.message) ? 'negado' : e.message.slice(0, 60)));
  const attempts: Array<[string, string]> = [
    ['UPDATE products', "UPDATE products SET title = 'x'"],
    ['DELETE products', 'DELETE FROM products'],
    ['INSERT orders', "INSERT INTO orders (id) VALUES ('x')"],
    ['UPDATE orders', "UPDATE orders SET status = 'x'"],
    ['UPDATE categories (inclui comissao)', "UPDATE categories SET commission_rate = 10"],
    ['DELETE categories', 'DELETE FROM categories'],
    ['UPDATE category_attributes', "UPDATE category_attributes SET name = 'x'"],
    ['TRUNCATE category_attributes', 'TRUNCATE category_attributes'],
    ['UPDATE audit_logs', "UPDATE audit_logs SET action = 'x'"],
    ['DELETE audit_logs', 'DELETE FROM audit_logs'],
    ['INSERT platform_settings', "INSERT INTO platform_settings (key, value_json) VALUES ('defaultSellerCommissionPercent', '10')"],
    ['UPDATE sellers', "UPDATE sellers SET commission_rate = 1"],
    ['INSERT escrow_accounts', "INSERT INTO escrow_accounts (id) VALUES ('x')"],
    ['UPDATE inventory', 'UPDATE inventory SET quantity_on_hand = 1'],
    ['CREATE TABLE', 'CREATE TABLE intruso (id int)'],
    ['SELECT users (dados pessoais)', 'SELECT email FROM users'],
    ['SELECT payments', 'SELECT * FROM payments'],
  ];
  const results = await Promise.all(attempts.map(async ([label, sql]) => [label, await denied(sql)] as const));
  report(`C1 privilegio minimo: ${attempts.length} operacoes fora do escopo (escrita em produtos, pedidos, categorias/comissoes, estoque, pagamentos, escrow, configuracoes, auditoria existente, DDL; leitura de usuarios e pagamentos) sao NEGADAS pelo banco`, results.every(([, r]) => r === 'negado'), results.filter(([, r]) => r !== 'negado'));
  report('C2 nada foi alterado fora das tabelas de atributos/auditoria (categorias 322 intactas; 0 produtos; 0 pedidos)', Number((await su.query('SELECT count(*)::int n FROM categories')).rows[0].n) === 322 && Number((await su.query('SELECT count(*)::int n FROM products')).rows[0].n) === 0 && Number((await su.query('SELECT count(*)::int n FROM orders')).rows[0].n) === 0);

  // ---- D. reversao sob o papel (DELETE permitido apenas em category_attributes)
  const rbAll = await rollbackOperations(roleDb, ops, {});
  report('D2 reversao completa sob o papel: 0 atributos restantes', rbAll.blocked.length === 0 && (await cnt()) === 0, rbAll.blocked.slice(0, 1));
  await applyOperations(roleDb, ops, { batchSize: 100 });

  // ---- E. cada desvio do papel e RECUSADO pela verificacao de sessao
  const variant = async (name: string, mutate: string, expect: RegExp, connectAs = LIMITED_WRITER_ROLE) => {
    await su.query(`DO $$ BEGIN IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='${LIMITED_WRITER_ROLE}') THEN EXECUTE 'DROP OWNED BY ${LIMITED_WRITER_ROLE}'; EXECUTE 'DROP ROLE ${LIMITED_WRITER_ROLE}'; END IF; END $$;`).catch(() => undefined);
    await su.query(sqlCreate);
    if (mutate) await su.query(mutate);
    const p = new pg.Pool({ connectionString: dbUrl(DB, connectAs, PASS), max: 1 });
    const r = await verifyLimitedWriterSession(p).then(() => 'APROVADA').catch((e) => e.message);
    await p.end().catch(() => undefined);
    report(`E ${name} => recusado`, expect.test(String(r)), String(r).slice(0, 200));
  };
  await variant('papel com privilegio de UPDATE em produtos', `GRANT UPDATE ON public.products TO ${LIMITED_WRITER_ROLE}`, /EXCESS_PRIVILEGES.*products/);
  await variant('papel com INSERT em pedidos', `GRANT INSERT ON public.orders TO ${LIMITED_WRITER_ROLE}`, /EXCESS_PRIVILEGES.*orders/);
  await variant('papel com UPDATE so em uma coluna de categorias (comissao)', `GRANT UPDATE (commission_rate) ON public.categories TO ${LIMITED_WRITER_ROLE}`, /EXCESS_PRIVILEGES.*categories/);
  await variant('papel com DELETE em audit_logs', `GRANT DELETE ON public.audit_logs TO ${LIMITED_WRITER_ROLE}`, /EXCESS_PRIVILEGES.*audit_logs/);
  await variant('papel com TRUNCATE em category_attributes', `GRANT TRUNCATE ON public.category_attributes TO ${LIMITED_WRITER_ROLE}`, /EXCESS_PRIVILEGES.*category_attributes/);
  await variant('papel sem INSERT em audit_logs (nao conseguiria auditar)', `REVOKE INSERT ON public.audit_logs FROM ${LIMITED_WRITER_ROLE}`, /MISSING_PRIVILEGE/);
  await variant('papel sem prazo (VALID UNTIL infinity)', `ALTER ROLE ${LIMITED_WRITER_ROLE} VALID UNTIL 'infinity'`, /NO_EXPIRY/);
  await variant('papel com prazo de 2 dias', `ALTER ROLE ${LIMITED_WRITER_ROLE} VALID UNTIL '${new Date(Date.now() + 48 * 3600 * 1000).toISOString()}'`, /TTL_TOO_LONG/);
  await variant('papel com SUPERUSER', `ALTER ROLE ${LIMITED_WRITER_ROLE} SUPERUSER`, /TOO_POWERFUL/);
  await variant('papel com CREATEROLE', `ALTER ROLE ${LIMITED_WRITER_ROLE} CREATEROLE`, /TOO_POWERFUL/);
  await variant('papel com BYPASSRLS', `ALTER ROLE ${LIMITED_WRITER_ROLE} BYPASSRLS`, /TOO_POWERFUL/);
  await variant('papel membro de outro papel', `DROP ROLE IF EXISTS grupo_x; CREATE ROLE grupo_x NOLOGIN; GRANT grupo_x TO ${LIMITED_WRITER_ROLE}`, /INHERITS_ROLES/);
  await variant('papel com CREATE no schema public', `GRANT CREATE ON SCHEMA public TO ${LIMITED_WRITER_ROLE}`, /CAN_CREATE_IN_SCHEMA/);
  await variant('papel com CREATE no banco', `GRANT CREATE ON DATABASE ${DB} TO ${LIMITED_WRITER_ROLE}`, /CAN_CREATE_IN_DATABASE/);
  // outro usuario (mesmo com os mesmos privilegios) nao serve
  await su.query(`DROP ROLE IF EXISTS outro_papel`).catch(() => undefined);
  await su.query(`CREATE ROLE outro_papel LOGIN PASSWORD '${PASS}' VALID UNTIL '${new Date(Date.now() + 3600 * 1000).toISOString()}'`);
  const op = new pg.Pool({ connectionString: dbUrl(DB, 'outro_papel', PASS), max: 1 });
  const orr = await verifyLimitedWriterSession(op).then(() => 'APROVADA').catch((e) => e.message);
  await op.end();
  report('E superusuario / outro papel (nome diferente) => recusado (LIMITED_WRITER_ROLE_MISMATCH)', /ROLE_MISMATCH/.test(orr), orr.slice(0, 120));
  const sp = new pg.Pool({ connectionString: dbUrl(DB), max: 1 });
  const srr = await verifyLimitedWriterSession(sp).then(() => 'APROVADA').catch((e) => e.message);
  await sp.end();
  report('E credencial de superusuario (a do app/administrador) => recusada', /ROLE_MISMATCH/.test(srr), srr.slice(0, 120));
  // prazo vencido: o proprio banco recusa a conexao
  await su.query(`DO $$ BEGIN IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='${LIMITED_WRITER_ROLE}') THEN EXECUTE 'DROP OWNED BY ${LIMITED_WRITER_ROLE}'; EXECUTE 'DROP ROLE ${LIMITED_WRITER_ROLE}'; END IF; END $$;`);
  await su.query(sqlCreate); await su.query(`ALTER ROLE ${LIMITED_WRITER_ROLE} VALID UNTIL '2020-01-01'`);
  const ep = new pg.Pool({ connectionString: dbUrl(DB, LIMITED_WRITER_ROLE, PASS), max: 1 });
  const exp = await ep.query('select 1').then(() => 'CONECTOU').catch((e) => e.message);
  await ep.end().catch(() => undefined);
  report('E papel com prazo VENCIDO: o proprio banco recusa a conexao (autenticacao)', /authentication|password|expired/i.test(String(exp)), String(exp).slice(0, 120));

  // ---- F. revogacao
  await su.query(`DO $$ BEGIN IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='${LIMITED_WRITER_ROLE}') THEN EXECUTE 'DROP OWNED BY ${LIMITED_WRITER_ROLE}'; EXECUTE 'DROP ROLE ${LIMITED_WRITER_ROLE}'; END IF; END $$;`);
  await su.query(sqlCreate);
  const held = new pg.Client({ connectionString: dbUrl(DB, LIMITED_WRITER_ROLE, PASS) }); held.on('error', () => undefined);
  await held.connect(); // conexao aberta que a revogacao deve derrubar
  const rv = await su.query(revokeRoleSql());
  const left = (Array.isArray(rv) ? rv[rv.length - 1] : rv).rows[0].papeis_restantes;
  const after = await Promise.race([held.query('select 1').then(() => 'AINDA CONECTADO').catch((e) => String(e.message).slice(0, 80)), new Promise<string>((r) => setTimeout(() => r('timeout (conexao derrubada)'), 4000))]);
  await held.end().catch(() => undefined);
  const login = new pg.Pool({ connectionString: dbUrl(DB, LIMITED_WRITER_ROLE, PASS), max: 1 });
  const lg = await login.query('select 1').then(() => 'CONECTOU').catch((e) => String(e.message));
  await login.end().catch(() => undefined);
  report('F1 revogacao: conexao aberta derrubada, papel removido (0 restantes), nova conexao recusada', Number(left) === 0 && after !== 'AINDA CONECTADO' && /authentication|role|password/i.test(lg), { left, after, lg: lg.slice(0, 80) });
  report('F2 a revogacao e idempotente (rodar de novo nao falha) e os atributos ja carregados permanecem', await su.query(revokeRoleSql()).then(() => true).catch(() => false) && (await cnt()) === 847);

  await role.end().catch(() => undefined); await su.end(); await admin.query(`DROP DATABASE IF EXISTS ${DB}`); await admin.query('DROP ROLE IF EXISTS outro_papel').catch(() => undefined); await admin.query('DROP ROLE IF EXISTS grupo_x').catch(() => undefined); await admin.end();
  console.log(`\n=== RESULTADO: ${passed}/${total} ===`);
  process.exit(passed === total ? 0 : 1);
}
main().catch((e) => { console.error('ERRO FATAL', e); process.exit(2); });
