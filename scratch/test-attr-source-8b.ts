/**
 * FASE 8B — ORIGEM dos atributos (source): o servidor decide; o cliente HTTP nao consegue falsificar. PostgreSQL 17 DESCARTAVEL. Nunca producao.
 */
process.env.REDIS_URL = '';
import { assertLedgerTestDatabaseGuard } from './ledgerTestDbGuard.js';
const testDbUrl = assertLedgerTestDatabaseGuard();
process.env.DATABASE_URL = testDbUrl;
process.env.NODE_ENV = 'test';
process.env.SKIP_RUNTIME_ALIGN = 'true';
process.env.JWT_ACCESS_SECRET = 'attrsrc8b_access_secret_0123456789abcdef';
import 'dotenv/config';
import express from 'express';
import http from 'http';
import jwt from 'jsonwebtoken';
import pg from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import * as schema from '../src/db/schema.js';
import { getJwtAccessSecret } from '../src/server/modules/auth/jwtConfig.js';
import { adminRouter } from '../src/server/adminRoutes.js';
import { createAttribute, disableInheritedAttribute } from '../src/server/modules/catalog/attributeDefinitionService.js';

if (!['localhost', '127.0.0.1'].includes(new URL(testDbUrl).hostname)) throw new Error('Somente banco local descartavel.');
const pool = new pg.Pool({ connectionString: testDbUrl, max: 4 });
const db = drizzle(pool, { schema });
let passed = 0, total = 0;
const report = (l: string, ok: boolean, d?: unknown) => { total++; if (ok) passed++; console.log(`[${ok ? 'PASS' : 'FAIL'}] ${l}${ok ? '' : ' -> ' + JSON.stringify(d ?? null).slice(0, 400)}`); };
const q = async (s: string, p?: any[]) => (await pool.query(s, p)).rows;
const tok = (id: string, role: string) => jwt.sign({ userId: id, email: `${id}@t.test`, role, fullName: id, countryCode: 'GW', kycStatus: 'verified', isEmailVerified: true }, getJwtAccessSecret(), { expiresIn: '1h' });

async function main() {
  await pool.query("INSERT INTO users (id,email,password_hash,full_name,phone,role,country_code,kyc_status,risk_score,is_active,is_email_verified,is_phone_verified,created_at,updated_at) VALUES ('usr_ga','ga@t.test','x','GA','1','GLOBAL_ADMIN','GW','verified','baixo',true,true,false,now(),now())");
  await q("INSERT INTO categories (id,name,slug) VALUES ('cat_raiz','Raiz','raiz'),('cat_folha','Folha','folha')");
  await q("UPDATE categories SET parent_id='cat_raiz' WHERE id='cat_folha'");
  const app = express(); app.use(express.json()); app.use('/admin', adminRouter);
  const server = http.createServer(app); await new Promise<void>((r) => server.listen(0, r));
  const base = `http://127.0.0.1:${(server.address() as any).port}`; const A = tok('usr_ga', 'GLOBAL_ADMIN');
  const call = async (method: string, path: string, body?: any) => { const r = await fetch(base + path, { method, headers: { Authorization: `Bearer ${A}`, 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined }); let j: any = null; try { j = await r.json(); } catch { /* */ } return { s: r.status, j }; };
  const src = async (id: string) => (await q('SELECT source, admin_modified_at FROM category_attributes WHERE id=$1', [id]))[0];

  // 1. criacao pelo painel: source sempre admin, mesmo com tentativa de falsificacao
  const base1 = { type: 'select', isRequired: false, optionsJson: ['A', 'B'], sortOrder: 1, isActive: true };
  const f1 = await call('POST', '/admin/categories/cat_raiz/attributes', { ...base1, name: 'Forja um', code: 'forja_um', source: 'seed' });
  const f2 = await call('POST', '/admin/categories/cat_raiz/attributes', { ...base1, name: 'Forja dois', code: 'forja_dois', Source: 'seed', SOURCE: 'seed', origin: 'seed', id: 'attr_forjado_dois', sourceType: 'seed' });
  const f3 = await call('POST', '/admin/categories/cat_raiz/attributes', { ...base1, name: 'Normal', code: 'normal' });
  report('S1 POST do painel com source:"seed" no corpo => 200, mas a linha grava source="admin"', f1.s === 200 && (await src(f1.j.data.id)).source === 'admin', { s: f1.s, j: f1.j?.message });
  report('S2 variacoes de caixa/nome (Source, SOURCE, origin, sourceType) tambem nao mudam a origem; id enviado pelo cliente segue valido mas origem admin', f2.s === 200 && (await src(f2.j.data.id)).source === 'admin', { s: f2.s });
  report('S3 criacao normal do painel => source="admin" (comportamento anterior preservado)', f3.s === 200 && (await src(f3.j.data.id)).source === 'admin');

  // 2. a carga (codigo de servidor) grava seed
  const seedRow = await createAttribute(db, 'cat_folha', { ...base1, name: 'Da carga', code: 'da_carga', id: 'attr_nsl_teste_da_carga' }, { source: 'seed' });
  report('S4 createAttribute com opts.source="seed" (codigo de servidor) => source="seed"', (await src(seedRow.attribute.id)).source === 'seed');
  const noOpts = await createAttribute(db, 'cat_folha', { ...base1, name: 'Sem opts', code: 'sem_opts', source: 'seed' } as any);
  report('S5 createAttribute SEM opts, mesmo com raw.source="seed" => "admin" (a origem nao vem do corpo)', (await src(noOpts.attribute.id)).source === 'admin');
  const bogus = await createAttribute(db, 'cat_folha', { ...base1, name: 'Opts invalido', code: 'opts_invalido' }, { source: 'qualquer' as any });
  report('S6 opts.source com valor desconhecido cai em "admin" (nunca grava valor invalido/CHECK)', (await src(bogus.attribute.id)).source === 'admin');

  // 3. edicao pelo painel nao altera a origem, mas marca a edicao (admin_modified_at) — base da deteccao de deriva
  const p1 = await call('PATCH', `/admin/category-attributes/${seedRow.attribute.id}`, { helpText: 'ajuste do admin', source: 'admin' });
  const after = await src(seedRow.attribute.id);
  report('S7 PATCH do painel num atributo da carga (com source:"admin" no corpo): origem segue "seed", admin_modified_at preenchido (edicao posterior detectavel)', p1.s === 200 && after.source === 'seed' && after.admin_modified_at !== null, { s: p1.s, after });
  const p2 = await call('PATCH', `/admin/category-attributes/${f3.j.data.id}`, { helpText: 'x', source: 'seed' });
  report('S8 PATCH com source:"seed" num atributo admin => continua "admin"', p2.s === 200 && (await src(f3.j.data.id)).source === 'admin');

  // 4. desativar herdado: painel => admin; carga => seed
  const rootAttr = await createAttribute(db, 'cat_raiz', { ...base1, name: 'Herdado', code: 'herdado' });
  const dis = await call('POST', '/admin/categories/cat_folha/attributes/disable-inherited', { attributeId: rootAttr.attribute.id, source: 'seed' });
  report('S9 desativar herdado pelo painel (com source:"seed" no corpo) => override com source="admin"', dis.s === 200 && (await src(dis.j.data.id)).source === 'admin', { s: dis.s });
  const rootAttr2 = await createAttribute(db, 'cat_raiz', { ...base1, name: 'Herdado dois', code: 'herdado_dois' });
  const dis2 = await disableInheritedAttribute(db, 'cat_folha', rootAttr2.attribute.id, { source: 'seed' });
  report('S10 desativar herdado pela carga (opts.source="seed") => override com source="seed"', (await src(dis2.attribute.id)).source === 'seed');

  // 5. auditoria: acoes do painel e da carga ficam distintas
  const aud = await q("SELECT action, count(*)::int n FROM audit_logs WHERE action LIKE 'admin.category_attribute.%' GROUP BY 1");
  const m = Object.fromEntries(aud.map((r: any) => [r.action, r.n]));
  report('S11 auditoria do painel: created x3 (S1-S3), updated x2, disabled_inherited x1; criacoes feitas direto pelo servico (carga) NAO geram linha admin.* (a carga tem auditoria propria system.attribute_matrix.*)', m['admin.category_attribute.created'] === 3 && m['admin.category_attribute.updated'] === 2 && m['admin.category_attribute.disabled_inherited'] === 1, m);
  report('S12 CHECK do banco continua aceitando so admin|seed', await (async () => { try { await pool.query("UPDATE category_attributes SET source='matrix' WHERE id=$1", [f3.j.data.id]); return false; } catch (e: any) { return /source_check/.test(String(e.message)); } })());

  server.close(); await pool.end();
  console.log(`\n=== RESULTADO: ${passed}/${total} ===`);
  process.exit(passed === total ? 0 : 1);
}
main().catch((e) => { console.error('ERRO FATAL', e); process.exit(2); });
