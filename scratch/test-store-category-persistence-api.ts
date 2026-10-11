/**
 * Lojas comerciais: a categoria principal escolhida (qualquer categoria, principal ou subcategoria) e gravada na criacao e na edicao
 * e volta igual (mesma sessao e nova sessao), com o MESMO contrato de antes (categoryId + category). Postgres 17 DESCARTAVEL. Nunca producao.
 */
process.env.REDIS_URL = '';
import { assertLedgerTestDatabaseGuard } from './ledgerTestDbGuard.js';
const testDbUrl = assertLedgerTestDatabaseGuard();
process.env.DATABASE_URL = testDbUrl;
process.env.NODE_ENV = 'test';
process.env.SKIP_RUNTIME_ALIGN = 'true';
process.env.JWT_ACCESS_SECRET = process.env.JWT_ACCESS_SECRET || 'test_fixture_jwt_secret_never_real_0123456789';
import 'dotenv/config';
import http from 'http';
import express from 'express';
import jwt from 'jsonwebtoken';
import pg from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import * as schema from '../src/db/schema.js';
import { users, sellers, sellerKyc, sellerProfiles, countries, categories } from '../src/db/schema.js';
import { apiRouter } from '../src/server/api.js';
import { buildCategoryTaxonomy } from '../src/data/categoryTaxonomy.js';

if (!['localhost', '127.0.0.1'].includes(new URL(testDbUrl).hostname)) throw new Error('Somente banco local descartavel.');
let passed = 0, total = 0;
const report = (l: string, ok: boolean, d?: any) => { total++; if (ok) passed++; console.log(`[${ok ? 'PASS' : 'FAIL'}] ${l}${ok ? '' : ' -> ' + JSON.stringify(d ?? null).slice(0, 600)}`); };
let seq = 0;
const uid = (p: string) => `${p}_sc_${Date.now()}_${++seq}_${Math.random().toString(36).slice(2, 5)}`;
const tokenFor = (userId: string) => jwt.sign({ userId, email: `${userId}@t.test`, role: 'SELLER', fullName: 'T', countryCode: 'GW', kycStatus: 'verified', isEmailVerified: true }, process.env.JWT_ACCESS_SECRET!);

async function main() {
  const pool = new pg.Pool({ connectionString: testDbUrl, ssl: { rejectUnauthorized: false }, max: 6 });
  const db = drizzle(pool, { schema });
  const q = async (s: string, p?: any[]) => (await pool.query(s, p)).rows;
  const app = express(); app.use(express.json()); app.use('/api/v1', apiRouter);
  const server = http.createServer(app); await new Promise<void>((r) => server.listen(0, r));
  const base = `http://localhost:${(server.address() as any).port}/api/v1`;
  const call = async (method: string, path: string, token: string, body?: any) => {
    const res = await fetch(`${base}${path}`, { method, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: body !== undefined ? JSON.stringify(body) : undefined });
    let json: any = null; try { json = await res.json(); } catch { /* */ }
    return { status: res.status, json };
  };
  await db.insert(countries).values([{ id: 'GW', code: 'GW', name: 'Guiné-Bissau', flag: 'x', currency: 'XOF', currencySymbol: 'CFA', phonePrefix: '+245', isActive: true, createdAt: new Date() }] as any).onConflictDoNothing();
  const tax = buildCategoryTaxonomy();
  await q('DELETE FROM categories WHERE id LIKE $1', ['cat_nsl_%']);
  await db.insert(categories).values(tax.map((n) => ({ id: n.id, name: n.name, slug: n.slug, parentId: n.parentId, icon: n.icon, displayOrder: n.displayOrder, isActive: true })) as any).onConflictDoNothing();

  const mk = async () => {
    const userId = uid('usr'), sellerId = uid('sel');
    await db.insert(users).values({ id: userId, email: `${userId}@t.test`, passwordHash: 'x', fullName: 'Vendedora', phone: '955000001', role: 'SELLER', countryCode: 'GW', kycStatus: 'verified', isActive: true, isEmailVerified: true, isPhoneVerified: false, createdAt: new Date(), updatedAt: new Date() } as any);
    await db.insert(sellers).values({ id: sellerId, userId, companyName: 'Loja Lda', tradingName: 'Loja', taxId: '510012345', phone: '955000001', countryCode: 'GW', status: 'active', createdAt: new Date(), updatedAt: new Date() } as any);
    await db.insert(sellerProfiles).values({ id: uid('prof'), sellerId, settingsJson: null } as any);
    await db.insert(sellerKyc).values({ id: uid('kyc'), sellerId, legalName: 'Vendedora', documentType: 'bi', documentNumber: 'BI1', status: 'verified', reviewedAt: new Date(), submittedAt: new Date() } as any);
    return { userId, sellerId, token: tokenFor(userId), fresh: () => tokenFor(userId) };
  };
  const s = await mk();
  const root = tax.find((n) => !n.parentId && n.name === 'Moda Feminina')!;
  const sub = tax.find((n) => n.parentId === root.id && n.name === 'Calças')!;
  const other = tax.find((n) => !n.parentId && n.name === 'Calçados')!;
  // payload IGUAL ao que o formulário envia (SellerMultiStore.handleSubmit): categoryId + category (nome)
  const payload = (c: { id: string; name: string }, name: string, extra: any = {}) => ({ name, description: 'Descrição', categoryId: c.id, category: c.name, country: 'GW', city: 'Bissau', address: 'Rua 1', phone: '955000001', email: 'l@loja.com', ...extra });
  const stores = async (t: string) => (await call('GET', '/seller/stores', t)).json?.data ?? [];

  let r = await call('POST', '/seller/stores', s.token, payload(root, 'Loja Moda'));
  const idRoot = r.json?.data?.id;
  report('A1 criar loja com uma categoria PRINCIPAL (que tem subcategorias): aceita e devolve categoryId', (r.status === 200 || r.status === 201) && r.json?.data?.categoryId === root.id, r);
  r = await call('POST', '/seller/stores', s.token, payload(sub, 'Loja Calças'));
  const idSub = r.json?.data?.id;
  report('A2 criar loja com uma SUBCATEGORIA: aceita e devolve categoryId', (r.status === 200 || r.status === 201) && r.json?.data?.categoryId === sub.id, r);
  report('A3 gravado no banco: stores.category_id exatamente o id escolhido (principal e sub)', (await q('SELECT category_id FROM stores WHERE id=$1', [idRoot]))[0]?.category_id === root.id && (await q('SELECT category_id FROM stores WHERE id=$1', [idSub]))[0]?.category_id === sub.id);
  let list = await stores(s.token);
  report('A4 a listagem devolve categoryId e o NOME da categoria (campo "category") para cada loja', list.find((x: any) => x.id === idRoot)?.category === 'Moda Feminina' && list.find((x: any) => x.id === idSub)?.categoryId === sub.id && list.find((x: any) => x.id === idSub)?.category === 'Calças', list.map((x: any) => [x.categoryId, x.category]));
  list = await stores(s.fresh());
  report('A5 nova sessão (novo token) lê as mesmas categorias', list.find((x: any) => x.id === idRoot)?.categoryId === root.id && list.find((x: any) => x.id === idSub)?.categoryId === sub.id);

  r = await call('PATCH', `/seller/stores/${idRoot}`, s.token, payload(other, 'Loja Moda'));
  list = await stores(s.token);
  report('B1 editar: trocar a categoria principal persiste (e o nome da categoria acompanha)', r.status === 200 && list.find((x: any) => x.id === idRoot)?.categoryId === other.id && list.find((x: any) => x.id === idRoot)?.category === 'Calçados', r);
  r = await call('PATCH', `/seller/stores/${idSub}`, s.token, { name: 'Loja Calças Renomeada', description: 'Nova' });
  list = await stores(s.fresh());
  report('B2 editar SEM mexer na categoria (a tela reenvia o valor mantido ou nada): a categoria anterior permanece', r.status === 200 && list.find((x: any) => x.id === idSub)?.categoryId === sub.id && list.find((x: any) => x.id === idSub)?.name === 'Loja Calças Renomeada', r);
  r = await call('PATCH', `/seller/stores/${idSub}`, s.token, payload(sub, 'Loja Calças Renomeada'));
  report('B3 editar reenviando a MESMA categoria (como o formulário faz ao salvar) mantém tudo', r.status === 200 && (await stores(s.token)).find((x: any) => x.id === idSub)?.categoryId === sub.id, r);

  for (const [label, body] of [['vazia', { ...payload(sub, 'X1'), categoryId: '', category: '' }], ['ausente', (() => { const p: any = payload(sub, 'X2'); delete p.categoryId; return p; })()], ['inexistente', { ...payload(sub, 'X3'), categoryId: 'cat_nao_existe' }]] as Array<[string, any]>) {
    const before = (await stores(s.token)).length;
    const rr = await call('POST', '/seller/stores', s.token, body);
    report(`C1 categoria ${label} → recusada (400) e nenhuma loja criada`, rr.status === 400 && (await stores(s.token)).length === before, rr);
  }
  const inactive = tax.find((n) => n.parentId === root.id && n.name === 'Saias') || tax.find((n) => n.parentId === root.id && n.id !== sub.id)!;
  await q('UPDATE categories SET is_active=false WHERE id=$1', [inactive.id]);
  const before2 = (await stores(s.token)).length;
  const ri = await call('POST', '/seller/stores', s.token, payload(inactive, 'Loja Inativa'));
  report('C2 categoria inativa → comportamento do servidor inalterado (recusa ou aceita como antes; nada de erro 500)', ri.status !== 500, ri);
  void before2;

  console.log(`\n${passed}/${total} passaram`);
  server.close(); await pool.end();
  process.exit(passed === total ? 0 : 1);
}
main().catch((e) => { console.error('ERRO FATAL', e); process.exit(2); });
