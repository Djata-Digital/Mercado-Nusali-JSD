/**
 * ATRIBUTOS FASE 7 - integracao dos EIXOS DE VARIANTE (variant_axis) com o sistema de variantes, em Postgres 17 DESCARTAVEL.
 * Produto simples, variantes livres, eixos definidos, combinacao unica (variant_key), SKU, estoque/preco por variante, heranca/
 * substituicao/desativacao, troca de categoria, atomicidade, concorrencia e comissao. Nunca producao.
 */
process.env.REDIS_URL = '';
import { assertLedgerTestDatabaseGuard } from './ledgerTestDbGuard.js';
const testDbUrl = assertLedgerTestDatabaseGuard();
process.env.DATABASE_URL = testDbUrl;
process.env.NODE_ENV = 'test';
process.env.SKIP_RUNTIME_ALIGN = 'true';
process.env.JWT_ACCESS_SECRET = 'attrp7_access_secret_0123456789abcdef';

import 'dotenv/config';
import express from 'express';
import http from 'http';
import jwt from 'jsonwebtoken';
import pg from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import * as schema from '../src/db/schema.js';
import { users, sellers, stores, addresses } from '../src/db/schema.js';
import { getJwtAccessSecret } from '../src/server/modules/auth/jwtConfig.js';
import { catalogRouter } from '../src/server/modules/catalog/catalogRoutes.js';
import { sellerRouter } from '../src/server/sellerRoutes.js';
import { createAttribute, disableInheritedAttribute } from '../src/server/modules/catalog/attributeDefinitionService.js';
import { ProductCreationService } from '../src/server/modules/catalog/productCreationService.js';
import { computeLiveStockAndSales } from '../src/server/modules/catalog/catalogService.js';

if (!['localhost', '127.0.0.1'].includes(new URL(testDbUrl).hostname)) throw new Error('Somente banco local descartavel.');
const pool = new pg.Pool({ connectionString: testDbUrl, max: 8 });
const db = drizzle(pool, { schema });
let passed = 0, total = 0;
const report = (l: string, ok: boolean, d?: any) => { total++; if (ok) passed++; console.log(`[${ok ? 'PASS' : 'FAIL'}] ${l}${ok ? '' : ' -> ' + JSON.stringify(d ?? null).slice(0, 700)}`); };
const q = async (s: string, p?: any[]) => (await pool.query(s, p)).rows;
const n = async (s: string, p?: any[]) => Number((await q(s, p))[0].n);
const tok = (id: string, role: string) => jwt.sign({ userId: id, email: `${id}@t.test`, role, fullName: id, countryCode: 'GW', kycStatus: 'verified', isEmailVerified: true }, getJwtAccessSecret(), { expiresIn: '1h' });

async function main() {
  report('0 banco de teste e PostgreSQL 17', /PostgreSQL 17\./.test((await q('select version() v'))[0].v));
  await q("INSERT INTO countries (id,code,name,flag,currency,currency_symbol,phone_prefix) VALUES ('GW','GW','Guiné-Bissau','x','XOF','CFA','+245') ON CONFLICT DO NOTHING");
  await q("INSERT INTO categories (id,name,slug,commission_rate) VALUES ('cat_eletro','Eletrônicos','eletronicos','10.00'),('cat_cel','Celulares','celulares','8.00'),('cat_cel2','Smartphones','smartphones','8.00'),('cat_roupa','Roupas','roupas','12.00'),('cat_semcor','Sem cor','sem-cor',NULL),('cat_outros','Outros','outros','5.00'),('cat_livre','Livres','livres','5.00')");
  await q("UPDATE categories SET parent_id='cat_eletro' WHERE id IN ('cat_cel','cat_cel2','cat_roupa','cat_semcor')");
  await q("UPDATE categories SET parent_id='cat_outros' WHERE id='cat_livre'");
  const mkUser = (id: string) => db.insert(users).values({ id, email: `${id}@t.test`, passwordHash: 'x', fullName: id, phone: '1', role: 'SELLER', countryCode: 'GW', kycStatus: 'verified', riskScore: 'baixo', isActive: true, isEmailVerified: true, isPhoneVerified: false, createdAt: new Date(), updatedAt: new Date() } as any);
  await mkUser('usr_a');
  await db.insert(sellers).values({ id: 'selA', userId: 'usr_a', companyName: 'A', tradingName: 'A', taxId: '0', phone: '1', countryCode: 'GW', status: 'active', kycStatus: 'verified', isEmailVerified: true, createdAt: new Date(), updatedAt: new Date() } as any);
  await db.insert(addresses).values({ id: 'adA', userId: 'usr_a', recipientName: 'L', street: 'R', number: '1', city: 'B', state: 'B', countryCode: 'GW', phone: '9', isDefault: false, addressType: 'business', createdAt: new Date(), updatedAt: new Date() } as any);
  await db.insert(stores).values({ id: 'stA', sellerId: 'selA', name: 'A', slug: 'stA', countryCode: 'GW', status: 'active', operationalAddressId: 'adA', createdAt: new Date(), updatedAt: new Date() } as any);

  // eixos: Cor (obrigatorio) na raiz; Capacidade (obrigatorio) + Voltagem (opcional) em Celulares/Smartphones; Tamanho (obrigatorio) e Cor substituida em Roupas
  const cor = (await createAttribute(db, 'cat_eletro', { name: 'Cor', code: 'cor', type: 'select', role: 'variant_axis', isRequired: true, optionsJson: ['Preto', 'Branco', 'Azul Marinho'], sortOrder: 1 })).attribute;
  for (const c of ['cat_cel', 'cat_cel2']) {
    await createAttribute(db, c, { name: 'Capacidade', code: 'capacidade', type: 'select', role: 'variant_axis', isRequired: true, optionsJson: ['64 GB', '128 GB', '256 GB'], sortOrder: 2 });
    await createAttribute(db, c, { name: 'Voltagem', code: 'voltagem', type: 'select', role: 'variant_axis', optionsJson: ['110V', '220V'], sortOrder: 3 });
    await createAttribute(db, c, { name: 'Memória RAM', code: 'memoria_ram', type: 'number', isRequired: true, unit: 'GB', decimals: 0, sortOrder: 4 });
  }
  await createAttribute(db, 'cat_roupa', { name: 'Tamanho', code: 'tamanho', type: 'select', role: 'variant_axis', isRequired: true, optionsJson: ['P', 'M', 'G'], sortOrder: 2 });
  await createAttribute(db, 'cat_roupa', { name: 'Cor', code: 'cor', type: 'select', role: 'variant_axis', isRequired: true, optionsJson: ['Preto', 'Rosa'], overridesId: cor.id });
  await disableInheritedAttribute(db, 'cat_semcor', cor.id);

  const app = express(); app.use(express.json()); app.use('/api', catalogRouter); app.use('/seller', sellerRouter);
  const server = http.createServer(app); await new Promise<void>((r) => server.listen(0, r));
  const url = `http://127.0.0.1:${(server.address() as any).port}`; const A = tok('usr_a', 'SELLER');
  const call = async (method: string, path: string, body?: any) => { const r = await fetch(url + path, { method, headers: { Authorization: `Bearer ${A}`, 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined }); let j: any = null; try { j = await r.json(); } catch {} return { s: r.status, j }; };
  const post = (b: any) => call('POST', '/seller/products', b);
  const patch = (id: string, b: any) => call('PATCH', `/seller/products/${id}`, b);
  let skuSeq = 0; const sku = (p = 'P7') => `${p}-${Date.now().toString(36)}-${++skuSeq}`;

  const base = { title: 'Produto', price: 1000, image: 'x.jpg', storeId: 'stA', weightKg: 0.35, dimensionsCm: { length: 20, width: 10, height: 5 }, stock: 5, condition: 'new', brand: 'Acme' } as any;
  const celSpecs = { memoria_ram: 8 };
  const variantRows = (id: string) => q('SELECT id, sku, price::float p, color, size, capacity, attributes_json aj, variant_key k, is_active a, stock FROM product_variants WHERE product_id=$1 ORDER BY sku', [id]);
  const invRows = (id: string) => q('SELECT v.sku, i.quantity_on_hand q, i.quantity_reserved r FROM inventory i LEFT JOIN product_variants v ON v.id=i.variant_id WHERE i.product_id=$1 ORDER BY v.sku NULLS FIRST', [id]);
  const counts = async () => ({ p: await n('SELECT count(*)::int n FROM products'), v: await n('SELECT count(*)::int n FROM product_variants'), i: await n('SELECT count(*)::int n FROM inventory'), mv: await n('SELECT count(*)::int n FROM inventory_movements'), pav: await n('SELECT count(*)::int n FROM product_attribute_values') });

  // ---------- A. produto sem variantes
  // P2 (decisao do proprietario): eixo OBRIGATORIO continua obrigatorio; produto com uma unica opcao = UMA variacao (mesmo sistema de variacoes)
  const cntA = await counts();
  const a0 = await post({ ...base, title: 'Simples', categoryId: 'cat_cel', specs: celSpecs });
  report('A0 produto SEM variacoes em categoria com eixos obrigatorios (Cor, Capacidade) => 400 VARIANT_AXES_INVALID/AXIS_REQUIRED, mensagem orienta "uma so opcao"; NADA e criado', a0.s === 400 && a0.j.error.code === 'VARIANT_AXES_INVALID' && a0.j.error.details.every((d: any) => d.code === 'AXIS_REQUIRED') && a0.j.error.details.map((d: any) => d.axis).sort().join() === 'capacidade,cor' && /ao menos uma variação/.test(a0.j.message) && JSON.stringify(await counts()) === JSON.stringify(cntA), a0.j);
  const a1 = await post({ ...base, title: 'Simples', categoryId: 'cat_cel', specs: celSpecs, variants: [{ title: 'u', sku: sku('UNICA'), price: 1000, stock: 5, color: 'Preto', capacity: '128 GB' }] });
  report('A1 produto com UMA unica opcao (Cor + Capacidade informadas) = 1 variacao: 201, 1 variante com variant_key, 1 linha de inventory da variante (estoque 5), nenhuma linha de produto simples', a1.s === 201 && (await variantRows(a1.j.data.id)).length === 1 && (await variantRows(a1.j.data.id))[0].k === 'capacidade=128_gb|cor=preto' && (await invRows(a1.j.data.id)).length === 1 && (await invRows(a1.j.data.id))[0].q === 5, a1.j);
  report('A2 os eixos nao viram valor tipado do produto (so a memoria_ram)', (await n("SELECT count(*)::int n FROM product_attribute_values WHERE product_id=$1", [a1.j.data.id])) === 1);

  // ---------- B. variantes LIVRES (categoria sem eixos)
  const freeV = (color: string | null, size: string | null, price = 100, stock = 3) => ({ title: `${color ?? ''} ${size ?? ''}`.trim() || 'V', sku: sku('FREE'), price, stock, color, size });
  const b1 = await post({ ...base, title: 'Livre', categoryId: 'cat_livre', specs: {}, variants: [freeV('Preto', 'P', 110, 4), freeV('Preto', 'M', 120, 2), freeV('Vermelho Vivo', 'P', 130, 7)] });
  const b1v = b1.j?.data?.id ? await variantRows(b1.j.data.id) : [];
  report('B1 variantes livres (sem eixos na categoria) seguem aceitas: 3 variantes, preco/estoque proprios, variant_key gravada ("cor=preto|tamanho=p")', b1.s === 201 && b1v.length === 3 && b1v.some((v) => v.k === 'cor=preto|tamanho=p') && b1v.every((v) => Number(v.stock) === 0), { s: b1.s, b1v, e: b1.j?.error });
  const b1i = await invRows(b1.j.data.id);
  report('B2 estoque por variante SO no inventory (4, 2, 7), product_variants.stock=0 e 1 linha de inventory por variante (sem segundo sistema de estoque)', JSON.stringify(b1i.map((r) => r.q).sort()) === '[2,4,7]' && b1i.every((r) => !!r.sku) && b1v.map((v) => v.p).sort().join() === '110,120,130', b1i);
  const before = await counts();
  const b2 = await post({ ...base, title: 'Duplicada', categoryId: 'cat_livre', specs: {}, variants: [freeV('Preto', 'P'), freeV('PRETO', ' p ')] });
  report('B3 combinacao duplicada no mesmo produto (mesma cor/tamanho, caixa e espacos diferentes) => 400 VARIANT_AXES_INVALID/DUPLICATE_COMBINATION; NADA e criado', b2.s === 400 && b2.j.error.code === 'VARIANT_AXES_INVALID' && b2.j.error.details[0].code === 'DUPLICATE_COMBINATION' && JSON.stringify(await counts()) === JSON.stringify(before), b2.j);
  const b3 = await post({ ...base, title: 'Acento', categoryId: 'cat_livre', specs: {}, variants: [freeV('Azul Céu', null), freeV('azul ceu', null)] });
  report('B4 acento e caixa nao diferenciam combinacoes ("Azul Céu" = "azul ceu")', b3.s === 400 && b3.j.error.details[0].code === 'DUPLICATE_COMBINATION');
  const b4 = await post({ ...base, title: 'Sem identidade', categoryId: 'cat_livre', specs: {}, variants: [{ title: 'Unica A', sku: sku('NOID'), price: 10, stock: 1 }, { title: 'Unica B', sku: sku('NOID'), price: 20, stock: 1 }] });
  report('B5 variantes SEM nenhum valor de identidade (so titulo/SKU) continuam permitidas como antes (variant_key nula, sem unicidade)', b4.s === 201 && (await variantRows(b4.j.data.id)).every((v) => v.k === null), b4.j);
  const dupSku = await post({ ...base, title: 'SKU repetido', categoryId: 'cat_livre', specs: {}, variants: [{ ...freeV('Verde', null), sku: b1v[0].sku }] });
  report('B6 SKU unico global: SKU ja usado por outro produto => 400 VARIANT_SKU_DUPLICATE; nada criado', dupSku.s === 400 && /VARIANT_SKU_DUPLICATE/.test(dupSku.j.message || dupSku.j.error?.message || ''), dupSku.j);
  const dupSku2 = await post({ ...base, title: 'SKU igual no payload', categoryId: 'cat_livre', specs: {}, variants: [{ ...freeV('Verde', null), sku: 'IGUAL-1' }, { ...freeV('Rosa', null), sku: 'IGUAL-1' }] });
  report('B7 SKU repetido dentro do mesmo payload tambem recusado', dupSku2.s === 400, dupSku2.j);

  // ---------- C. eixos definidos
  const cv = (color: any, cap: any, extra: any = {}) => ({ title: 'v', sku: sku('AX'), price: 2000, stock: 5, color, capacity: cap, ...extra });
  const c1 = await post({ ...base, title: 'Celular eixos', categoryId: 'cat_cel', specs: celSpecs, variants: [cv('preto', '128 GB', { attributesJson: { voltagem: '110v' } }), cv('Azul Marinho', '256 GB', { price: 2600, stock: 2 })] });
  const c1v = c1.j?.data?.id ? await variantRows(c1.j.data.id) : [];
  report('C1 eixos Cor (herdado) + Capacidade (obrigatorio) + Voltagem (outro eixo): valores canonizados pela opcao ("preto"->"Preto", "110v"->"110V"), Capacidade na coluna capacity, Voltagem em attributes_json', c1.s === 201 && c1v.some((v) => v.color === 'Preto' && v.capacity === '128 GB' && v.aj?.voltagem === '110V') && c1v.some((v) => v.color === 'Azul Marinho' && v.p === 2600), { s: c1.s, c1v, e: c1.j?.error });
  report('C2 variant_key das variantes com eixos inclui todos os eixos ("capacidade=128_gb|cor=preto|voltagem=110v")', c1v.some((v) => v.k === 'capacidade=128_gb|cor=preto|voltagem=110v') && c1v.some((v) => v.k === 'capacidade=256_gb|cor=azul_marinho'), c1v.map((v) => v.k));
  const c2 = await post({ ...base, title: 'Eixo invalido', categoryId: 'cat_cel', specs: celSpecs, variants: [cv('Verde Limao', '128 GB')] });
  report('C3 valor fora das opcoes do eixo => 400 AXIS_INVALID com a variacao e a mensagem', c2.s === 400 && c2.j.error.details[0].code === 'AXIS_INVALID' && c2.j.error.details[0].axis === 'cor' && /Valor inválido/.test(c2.j.error.details[0].message), c2.j);
  const c3 = await post({ ...base, title: 'Sem capacidade', categoryId: 'cat_cel', specs: celSpecs, variants: [cv('Preto', null)] });
  report('C4 eixo OBRIGATORIO ausente (Capacidade) => 400 AXIS_REQUIRED', c3.s === 400 && c3.j.error.details[0].code === 'AXIS_REQUIRED' && c3.j.error.details[0].axis === 'capacidade', c3.j);
  const c4 = await post({ ...base, title: 'Varios erros', categoryId: 'cat_cel', specs: celSpecs, variants: [cv('Verde', '1 TB'), cv(null, '64 GB')] });
  report('C5 todos os problemas voltam juntos (3: cor invalida, capacidade invalida, cor obrigatoria ausente)', c4.s === 400 && c4.j.error.details.length === 3, c4.j?.error?.details?.length);
  const c5 = await post({ ...base, title: 'Dup eixos', categoryId: 'cat_cel', specs: celSpecs, variants: [cv('Preto', '128 GB'), cv('PRETO', '128gb'.replace('gb', ' GB'))] });
  report('C6 combinacao duplicada com eixos (apos canonizar) recusada', c5.s === 400 && c5.j.error.details.some((d: any) => d.code === 'DUPLICATE_COMBINATION'));
  const c6 = await post({ ...base, title: 'Livre extra', categoryId: 'cat_cel', specs: celSpecs, variants: [cv('Preto', '64 GB', { size: 'GG' })] });
  report('C7 valor LIVRE fora dos eixos (tamanho "GG" na categoria sem eixo Tamanho) continua aceito e entra na identidade', c6.s === 201 && (await variantRows(c6.j.data.id))[0].size === 'GG' && /tamanho=gg/.test((await variantRows(c6.j.data.id))[0].k), c6.j);
  const c7 = await post({ ...base, title: 'Prod sem eixo geral', categoryId: 'cat_cel', specs: {} });
  report('C8 o eixo obrigatorio NAO e exigido como atributo geral do produto (so a memoria_ram aparece como obrigatoria)', c7.s === 400 && c7.j.error.details.length === 1 && c7.j.error.details[0].field === 'memoria_ram', c7.j?.error?.details);

  // ---------- D. heranca / substituicao / desativacao
  const rv = (color: any, size: any, extra: any = {}) => ({ title: 'v', sku: sku('RO'), price: 50, stock: 3, color, size, ...extra });
  const d1 = await post({ ...base, title: 'Roupa', categoryId: 'cat_roupa', specs: {}, variants: [rv('Rosa', 'M'), rv('Preto', 'G')] });
  report('D1 SUBSTITUICAO: Roupas troca as opcoes de Cor (Rosa ok) e exige Tamanho (P/M/G)', d1.s === 201, d1.j);
  const d2 = await post({ ...base, title: 'Roupa branca', categoryId: 'cat_roupa', specs: {}, variants: [rv('Branco', 'M')] });
  const d3 = await post({ ...base, title: 'Roupa sem tamanho', categoryId: 'cat_roupa', specs: {}, variants: [rv('Preto', null)] });
  report('D2 ...e recusa "Branco" (opcao so da heranca) e variante sem Tamanho; Celulares segue aceitando "Branco" (a substituicao nao vaza)', d2.s === 400 && d2.j.error.details[0].axis === 'cor' && d3.s === 400 && d3.j.error.details[0].code === 'AXIS_REQUIRED' && (await post({ ...base, title: 'Cel branco', categoryId: 'cat_cel', specs: celSpecs, variants: [cv('Branco', '64 GB')] })).s === 201);
  const d4 = await post({ ...base, title: 'Sem cor', categoryId: 'cat_semcor', specs: {}, variants: [rv('Qualquer Cor', 'XL'), rv('Outra', 'XL')] });
  report('D3 eixo HERDADO DESATIVADO na categoria (Sem cor): cor e livre, nao e exigida nem validada', d4.s === 201, d4.j);
  // desativa Capacidade depois da criacao
  const celProd = c1.j.data.id;
  await q("UPDATE category_attributes SET is_active=false WHERE code='capacidade' AND category_id='cat_cel'");
  const e0 = await patch(celProd, { variants: [{ ...c1v[0], id: c1v[0].id, capacity: 'qualquer', title: 'v' }, { ...c1v[1], id: c1v[1].id, title: 'v' }] });
  const e0v = await variantRows(celProd);
  report('D4 EIXO DESATIVADO depois da criacao: deixa de validar/exigir; os valores gravados seguem e a combinacao continua unica', e0.s === 200 && e0v.some((v) => v.capacity === 'qualquer') && e0v.every((v) => v.a), { s: e0.s, e: e0.j?.error, e0v });
  await q("UPDATE category_attributes SET is_active=true WHERE code='capacidade' AND category_id='cat_cel'");

  // ---------- E. edicao: adocao por combinacao, ids efemeros, trocas, reativacao, estoque nao muda
  const P = (await post({ ...base, title: 'Edicao', categoryId: 'cat_livre', specs: {}, variants: [freeV('Preto', 'P', 100, 4), freeV('Preto', 'M', 110, 2)] })).j.data.id;
  const v0 = await variantRows(P); const i0 = JSON.stringify(await invRows(P));
  const ids0 = Object.fromEntries(v0.map((v) => [v.k, v.id]));
  const e1 = await patch(P, { variants: [{ id: 'var-1', title: 'x', sku: v0.find((v) => v.size === 'P')!.sku, price: 150, stock: 99, color: 'preto', size: 'P' }, { id: 'var-2', title: 'x', sku: v0.find((v) => v.size === 'M')!.sku, price: 160, stock: 99, color: 'Preto', size: 'M' }] });
  const v1 = await variantRows(P);
  report('E1 ids EFEMEROS com as MESMAS combinacoes (o assistente regenera a matriz): reaproveita as linhas existentes (mesmos ids), atualiza preco, NAO cria duplicatas nem desativa nada', e1.s === 200 && v1.length === 2 && v1.every((v) => v.a) && v1.every((v) => ids0[v.k] === v.id) && v1.map((v) => v.p).sort().join() === '150,160', { v0, v1 });
  report('E2 estoque NAO muda na edicao (o "stock" da variante so vale na criacao; 99 ignorado) - inventory intacto e sem novos movimentos de estoque', JSON.stringify(await invRows(P)) === i0);
  const e2 = await patch(P, { variants: [{ id: v1.find((v) => v.size === 'P')!.id, sku: v1.find((v) => v.size === 'P')!.sku, price: 150, color: 'Preto', size: 'M' }, { id: v1.find((v) => v.size === 'M')!.id, sku: v1.find((v) => v.size === 'M')!.sku, price: 160, color: 'Preto', size: 'P' }] });
  const v2 = await variantRows(P);
  report('E3 TROCA de combinacao entre duas variantes (P<->M) numa so edicao: sem violar o indice unico; chaves coerentes com os valores', e2.s === 200 && v2.find((v) => v.sku === v1.find((x) => x.size === 'P')!.sku)!.size === 'M' && v2.every((v) => v.k === `cor=preto|tamanho=${String(v.size).toLowerCase()}`), { s: e2.s, e: e2.j, v2 });
  const e3 = await patch(P, { variants: [{ id: v2[0].id, sku: v2[0].sku, price: 150, color: v2[0].color, size: v2[0].size }] });
  const v3 = await variantRows(P);
  report('E4 variante ausente do payload e DESATIVADA (nunca apagada); a chave dela fica reservada', e3.s === 200 && v3.filter((v) => v.a).length === 1 && v3.filter((v) => !v.a).length === 1 && v3.every((v) => v.k !== null), v3);
  const e4 = await patch(P, { variants: [{ sku: sku('NEW'), price: 170, stock: 8, color: 'Preto', size: v3.find((v) => !v.a)!.size }, { id: v3.find((v) => v.a)!.id, sku: v3.find((v) => v.a)!.sku, price: 150, color: v3.find((v) => v.a)!.color, size: v3.find((v) => v.a)!.size }] });
  const v4 = await variantRows(P);
  report('E5 recriar a combinacao de uma variante DESATIVADA reativa a MESMA linha (sem duplicata, sem novo inventory, SKU atualizado)', e4.s === 200 && v4.length === 2 && v4.every((v) => v.a) && (await invRows(P)).length === 2, { s: e4.s, e: e4.j, v4 });
  const e5 = await patch(P, { variants: [{ sku: sku('X1'), price: 1, color: 'Preto', size: 'P' }, { sku: sku('X2'), price: 1, color: 'preto', size: 'p' }] });
  report('E6 duplicata dentro do payload de EDICAO => 400 e nada muda', e5.s === 400 && JSON.stringify(await variantRows(P)) === JSON.stringify(v4));
  report('E7 o indice unico (product_id, variant_key) existe no banco e recusa duplicata direta', await (async () => { try { await pool.query("INSERT INTO product_variants (id,product_id,title,price,variant_key) SELECT 'dupk',$1::varchar,'x',1,variant_key FROM product_variants WHERE product_id=$1 AND variant_key IS NOT NULL LIMIT 1", [P]); return false; } catch (e: any) { return e.code === '23505'; } })());

  // estoque total do produto nao conta variante DESATIVADA (a linha de inventory segue existindo)
  const S1 = (await post({ ...base, title: 'Total', categoryId: 'cat_livre', specs: {}, variants: [freeV('Preto', 'P', 10, 4), freeV('Preto', 'M', 10, 2)] })).j.data.id;
  const s1v = await variantRows(S1);
  const tot0 = (await computeLiveStockAndSales([S1], db)).get(S1)!.availableStock;
  await patch(S1, { variants: [{ id: s1v[0].id, sku: s1v[0].sku, price: 10, color: s1v[0].color, size: s1v[0].size }] });
  const tot1 = (await computeLiveStockAndSales([S1], db)).get(S1)!.availableStock;
  const keptQ = (await invRows(S1)).find((r) => r.sku === s1v[0].sku)!.q;
  report('E8 estoque TOTAL do produto soma so variantes ATIVAS: 6 -> so a que ficou; a linha de inventory da desativada continua existindo (historico) e nao e apagada', tot0 === 6 && tot1 === keptQ && (await invRows(S1)).length === 2, { tot0, tot1, keptQ });

  // ---------- F. editar atributos tecnicos nao mexe em variantes/estoque
  const frozen = async (id: string) => JSON.stringify({ v: await variantRows(id), i: await invRows(id), mv: await n('SELECT count(*)::int n FROM inventory_movements WHERE product_id=$1', [id]) });
  const f0 = await frozen(celProd);
  const f1 = await patch(celProd, { attributeUpdates: { memoria_ram: 12 } });
  report('F1 editar atributo tecnico nao altera variantes (valores, chaves, SKU, preco), estoque nem movimentos', f1.s === 200 && (await frozen(celProd)) === f0, f1.j);

  // ---------- G. troca de categoria com eixos incompativeis
  const G = (await post({ ...base, title: 'Troca', categoryId: 'cat_cel', specs: celSpecs, variants: [cv('Preto', '128 GB', { stock: 4 }), cv('Branco', '64 GB', { stock: 6 })] })).j.data.id;
  const g0 = await frozen(G);
  const g1 = await patch(G, { categoryId: 'cat_roupa', confirmAttributeRemoval: true });
  report('G1 trocar Celulares -> Roupas SEM reenviar variantes: 409 VARIANT_AXES_INCOMPATIBLE (falta Tamanho; "Branco" nao existe nas opcoes de Roupas); categoria e variantes NAO mudam', g1.s === 409 && g1.j.error.code === 'VARIANT_AXES_INCOMPATIBLE' && g1.j.error.details.some((d: any) => d.axis === 'tamanho' && d.code === 'AXIS_REQUIRED') && g1.j.error.details.some((d: any) => d.axis === 'cor' && d.code === 'AXIS_INVALID') && (await q('SELECT category_id c FROM products WHERE id=$1', [G]))[0].c === 'cat_cel' && (await frozen(G)) === g0, g1.j);
  const gv = await variantRows(G);
  const g2 = await patch(G, { categoryId: 'cat_roupa', confirmAttributeRemoval: true, variants: [{ id: gv[0].id, sku: gv[0].sku, price: gv[0].p, color: 'Preto', size: 'M' }, { id: gv[1].id, sku: gv[1].sku, price: gv[1].p, color: 'Rosa', size: 'G' }] });
  const gv2 = await variantRows(G);
  report('G2 reenviando as variantes ajustadas aos eixos de Roupas (mesmos ids): 200, categoria trocada, variantes atualizadas e ESTOQUE preservado (4 e 6)', g2.s === 200 && (await q('SELECT category_id c FROM products WHERE id=$1', [G]))[0].c === 'cat_roupa' && gv2.length === 2 && gv2.every((v) => v.a) && JSON.stringify((await invRows(G)).map((r) => r.q).sort()) === '[4,6]' && gv2.every((v, k) => v.id === gv.find((x) => x.sku === v.sku)!.id), { s: g2.s, e: g2.j, gv2 });
  const G2 = (await post({ ...base, title: 'Troca 2', categoryId: 'cat_cel', specs: celSpecs, variants: [cv('Preto', '128 GB')] })).j.data.id;
  const g3 = await patch(G2, { categoryId: 'cat_cel2', attributeUpdates: {} });
  report('G3 categoria com os MESMOS eixos (Celulares -> Smartphones): troca sem problema, variantes intactas', g3.s === 200 && (await variantRows(G2)).length === 1 && (await q('SELECT category_id c FROM products WHERE id=$1', [G2]))[0].c === 'cat_cel2', g3.j);
  const G3 = (await post({ ...base, title: 'Troca livre', categoryId: 'cat_livre', specs: {}, variants: [freeV('Verde', 'XL')] })).j.data.id;
  const g4 = await patch(G3, { categoryId: 'cat_roupa', confirmAttributeRemoval: true });
  report('G4 variantes LIVRES indo para categoria com eixos obrigatorios sao checadas igual (Verde nao existe em Roupas, falta Tamanho "XL" invalido): 409', g4.s === 409 && g4.j.error.code === 'VARIANT_AXES_INCOMPATIBLE');
  const g5 = await patch(G3, { categoryId: 'cat_semcor', confirmAttributeRemoval: true });
  report('G5 ...e para categoria SEM eixos aplicaveis (Sem cor: cor desativada, sem Tamanho) passa; variantes intactas', g5.s === 200 && (await variantRows(G3)).length === 1);

  // ---------- H. comissao das vendas futuras
  // produtos SIMPLES "antigos" (criados antes da regra P2 de eixo obrigatorio): o eixo e relaxado so durante a criacao e restaurado em seguida —
  // prova tambem que o que ja existe continua editavel/trocavel de categoria.
  const mkLegacySimple = async (title: string) => {
    await q("UPDATE category_attributes SET is_required=false WHERE role='variant_axis'");
    const r = await post({ ...base, title, categoryId: 'cat_cel', specs: celSpecs });
    await q("UPDATE category_attributes SET is_required=true WHERE role='variant_axis' AND code <> 'voltagem'");
    return r;
  };
  const H = (await mkLegacySimple('Comissao')).j.data.id;
  const h1 = await patch(H, { categoryId: 'cat_roupa', confirmAttributeRemoval: true, attributeUpdates: {} });
  report('H1 troca Celulares (8%) -> Roupas (12%): a resposta informa a mudanca de comissao das vendas FUTURAS (categoria->categoria, 8 -> 12, changed=true)', h1.s === 200 && h1.j.commission?.from?.rate === 8 && h1.j.commission?.to?.rate === 12 && h1.j.commission?.changed === true && h1.j.commission?.from?.source === 'category', h1.j);
  const hAudit = await q("SELECT details_json d FROM audit_logs WHERE resource_id=$1 AND action='seller.product.category_changed'", [H]);
  report('H2 a auditoria da troca registra a comissao de/para', hAudit.length === 1 && hAudit[0].d.commission.to.rate === 12 && hAudit[0].d.commission.changed === true, hAudit);
  const H2 = (await mkLegacySimple('Comissao igual')).j.data.id;
  const h3 = await patch(H2, { categoryId: 'cat_cel2', attributeUpdates: {} });
  report('H3 troca entre categorias com a MESMA comissao: changed=false (nao assusta o vendedor a toa)', h3.s === 200 && h3.j.commission?.changed === false);
  await q("UPDATE categories SET commission_rate=NULL WHERE id='cat_roupa'"); await q("UPDATE sellers SET commission_rate='9.5' WHERE id='selA'");
  const H3 = (await mkLegacySimple('Comissao fallback')).j.data.id;
  const h4 = await call('GET', `/seller/products/${H3}/category-change-preview?categoryId=cat_roupa`);
  report('H4 prévia (GET category-change-preview): categoria sem comissao cai para a do VENDEDOR (9.5, fonte seller); informa tambem que as variantes cabem (produto sem variantes)', h4.s === 200 && h4.j.data.commission.to.rate === 9.5 && h4.j.data.commission.to.source === 'seller' && h4.j.data.commission.from.rate === 8 && h4.j.data.variants.compatible === true, h4.j);
  const h5 = await call('GET', `/seller/products/${G2}/category-change-preview?categoryId=cat_roupa`);
  report('H5 prévia com variantes incompativeis: compatible=false e a lista de problemas (nada e gravado)', h5.s === 200 && h5.j.data.variants.compatible === false && h5.j.data.variants.issues.length > 0 && (await q('SELECT category_id c FROM products WHERE id=$1', [G2]))[0].c === 'cat_cel2', h5.j);
  const h6 = await call('GET', `/seller/products/${H3}/category-change-preview?categoryId=cat_eletro`);
  report('H6 prévia para categoria nao-folha => 400', h6.s === 400);
  await q("UPDATE sellers SET commission_rate=NULL WHERE id='selA'");

  // ---------- I. atomicidade e concorrencia
  const I = (await post({ ...base, title: 'Atomico', categoryId: 'cat_cel', specs: celSpecs, variants: [cv('Preto', '128 GB')] })).j.data.id;
  const iSnap = JSON.stringify({ v: await variantRows(I), i: await invRows(I), c: (await q('SELECT category_id c, title FROM products WHERE id=$1', [I]))[0], pav: await n('SELECT count(*)::int n FROM product_attribute_values WHERE product_id=$1', [I]), a: await n("SELECT count(*)::int n FROM audit_logs WHERE resource_id=$1", [I]) });
  await q("CREATE OR REPLACE FUNCTION f7_fail() RETURNS trigger AS $$ BEGIN RAISE EXCEPTION 'falha injetada f7'; END; $$ LANGUAGE plpgsql");
  await q("CREATE TRIGGER f7_inv_fail BEFORE INSERT ON inventory FOR EACH ROW EXECUTE FUNCTION f7_fail()");
  const iv = await variantRows(I);
  const i1 = await patch(I, { title: 'Titulo novo', categoryId: 'cat_roupa', confirmAttributeRemoval: true, attributeUpdates: { }, variants: [{ id: iv[0].id, sku: iv[0].sku, price: 1, color: 'Preto', size: 'M' }, { sku: sku('NOVA'), price: 5, stock: 3, color: 'Rosa', size: 'G' }] });
  await q('DROP TRIGGER f7_inv_fail ON inventory'); await q('DROP FUNCTION f7_fail()');
  report('I1 falha ao criar o inventory da variante NOVA (ultimo passo): desfaz TUDO — titulo, categoria, atributos, auditoria, variante existente editada e a nova', i1.s === 500 && JSON.stringify({ v: await variantRows(I), i: await invRows(I), c: (await q('SELECT category_id c, title FROM products WHERE id=$1', [I]))[0], pav: await n('SELECT count(*)::int n FROM product_attribute_values WHERE product_id=$1', [I]), a: await n("SELECT count(*)::int n FROM audit_logs WHERE resource_id=$1", [I]) }) === iSnap, { s: i1.s, j: i1.j });
  const J = (await post({ ...base, title: 'Concorrencia', categoryId: 'cat_livre', specs: {}, variants: [freeV('Preto', 'P')] })).j.data.id;
  const jv = await variantRows(J);
  const mkPar = (k: number) => patch(J, { variants: [{ id: jv[0].id, sku: jv[0].sku, price: 100, color: 'Preto', size: 'P' }, { sku: sku(`PAR${k}`), price: 10 + k, stock: 1, color: 'Preto', size: 'GG' }] });
  // atraso artificial nas insercoes de variante: abre a janela da corrida (sem a trava do produto, duas edicoes inseririam a mesma combinacao)
  await q("CREATE OR REPLACE FUNCTION f7_slow() RETURNS trigger AS $$ BEGIN PERFORM pg_sleep(0.4); RETURN NEW; END; $$ LANGUAGE plpgsql");
  await q('CREATE TRIGGER f7_slow_ins BEFORE INSERT ON product_variants FOR EACH ROW EXECUTE FUNCTION f7_slow()');
  const par = await Promise.all([mkPar(1), mkPar(2), mkPar(3), mkPar(4)]);
  await q('DROP TRIGGER f7_slow_ins ON product_variants'); await q('DROP FUNCTION f7_slow()');
  const jvAfter = await variantRows(J);
  report('I2 4 edicoes SIMULTANEAS criando a MESMA combinacao nova (Preto/GG): todas 200 (a linha travada serializa; as demais ADOTAM a variante criada), 1 unica variante Preto/GG, sem violar o indice, 1 inventory por variante', par.every((r) => r.s === 200) && jvAfter.filter((v) => v.k === 'cor=preto|tamanho=gg').length === 1 && jvAfter.length === 2 && (await invRows(J)).length === 2, { st: par.map((r) => r.s), jvAfter });

  // produto SEM nenhuma variante ainda: nao ha linha existente para serializar — so a trava do produto evita a combinacao duplicada
  const K = (await post({ ...base, title: 'Concorrencia 2', categoryId: 'cat_livre', specs: {} })).j.data.id;
  await q("CREATE OR REPLACE FUNCTION f7_slow() RETURNS trigger AS $$ BEGIN PERFORM pg_sleep(0.4); RETURN NEW; END; $$ LANGUAGE plpgsql");
  await q('CREATE TRIGGER f7_slow_ins BEFORE INSERT ON product_variants FOR EACH ROW EXECUTE FUNCTION f7_slow()');
  const par2 = await Promise.all([1, 2, 3].map((k) => patch(K, { variants: [{ sku: sku(`K${k}`), price: 10 + k, stock: 4, color: 'Verde', size: 'G' }] })));
  await q('DROP TRIGGER f7_slow_ins ON product_variants'); await q('DROP FUNCTION f7_slow()');
  report('I3 3 edicoes simultaneas criando a PRIMEIRA variante (Verde/G) de um produto sem variantes: todas 200 (a trava do produto serializa; as demais adotam), 1 variante, 1 inventory de variante e 1 movimento inicial', par2.every((r) => r.s === 200) && (await variantRows(K)).length === 1 && (await invRows(K)).filter((r) => !!r.sku).length === 1 && (await n("SELECT count(*)::int n FROM inventory_movements WHERE product_id=$1 AND variant_id IS NOT NULL", [K])) === 1, { st: par2.map((r) => r.s), v: (await variantRows(K)).length });

  // ---------- J. produtos legados (variant_key nula) continuam editaveis
  await q("INSERT INTO products (id,title,price,currency,category_id,seller_id,store_id,stock,image,country_code,status,is_active,created_at,updated_at) VALUES ('prod_leg7','Legado7','10','XOF','cat_livre','selA','stA',0,'x','GW','active',true,now(),now())");
  await q("INSERT INTO product_variants (id,product_id,title,price,sku,color,size,is_active) VALUES ('pv_l1','prod_leg7','Preto / P',10,'LEG7-1','Preto','P',true),('pv_l2','prod_leg7','Preto / M',10,'LEG7-2','Preto','M',true)");
  await q("INSERT INTO inventory (id,location_type,seller_id,product_id,variant_id,quantity_on_hand,quantity_reserved,minimum_stock_level,created_at,updated_at) VALUES ('inv_l1','SELLER_LOCATION','selA','prod_leg7','pv_l1',5,0,0,now(),now()),('inv_l2','SELLER_LOCATION','selA','prod_leg7','pv_l2',3,0,0,now(),now())");
  const l1 = await patch('prod_leg7', { variants: [{ id: 'var-1', sku: 'LEG7-1', price: 11, color: 'preto', size: 'P' }, { id: 'var-2', sku: 'LEG7-2', price: 12, color: 'Preto', size: 'M' }] });
  const lv = await variantRows('prod_leg7');
  report('J1 produto ANTERIOR a fase (variant_key nula): ids efemeros adotam as linhas existentes pela combinacao derivada, chaves passam a ser gravadas, estoque (5 e 3) preservado', l1.s === 200 && lv.length === 2 && lv.every((v) => v.k && v.a) && lv.map((v) => v.id).sort().join() === 'pv_l1,pv_l2' && JSON.stringify((await invRows('prod_leg7')).map((r) => r.q).sort()) === '[3,5]', { s: l1.s, e: l1.j, lv });

  server.close();
  await pool.end();
  console.log(`\n=== RESULTADO: ${passed}/${total} ===`);
  process.exit(passed === total ? 0 : 1);
}
main().catch((e) => { console.error('ERRO FATAL', e); process.exit(2); });
