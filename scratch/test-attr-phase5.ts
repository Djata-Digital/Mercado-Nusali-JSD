/**
 * ATRIBUTOS FASE 5 - integracao do ASSISTENTE contra o backend real (rotas HTTP) em Postgres 17 DESCARTAVEL:
 * atributos efetivos que o assistente carrega, payload montado pelo modelo do formulario, modo estrito, erros por campo,
 * subcategoria, variantes/estoque. Nunca producao.
 */
process.env.REDIS_URL = '';
import { assertLedgerTestDatabaseGuard } from './ledgerTestDbGuard.js';
const testDbUrl = assertLedgerTestDatabaseGuard();
process.env.DATABASE_URL = testDbUrl;
process.env.NODE_ENV = 'test';
process.env.SKIP_RUNTIME_ALIGN = 'true';
process.env.JWT_ACCESS_SECRET = 'attrp5_access_secret_0123456789abcdef';

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
import { selectFormAttributes, groupFormAttributes, validateFormFields, buildAttributeSpecs, reconcileValues, extractSubmitError, type FormValues } from '../src/utils/attributeFormModel.js';

if (!['localhost', '127.0.0.1'].includes(new URL(testDbUrl).hostname)) throw new Error('Somente banco local descartavel.');
const pool = new pg.Pool({ connectionString: testDbUrl, max: 6 });
const db = drizzle(pool, { schema });
let passed = 0, total = 0;
const report = (l: string, ok: boolean, d?: any) => { total++; if (ok) passed++; console.log(`[${ok ? 'PASS' : 'FAIL'}] ${l}${ok ? '' : ' -> ' + JSON.stringify(d ?? null).slice(0, 600)}`); };
const q = async (s: string, p?: any[]) => (await pool.query(s, p)).rows;
const n = async (s: string, p?: any[]) => Number((await q(s, p))[0].n);
const tok = (id: string, role: string) => jwt.sign({ userId: id, email: `${id}@t.test`, role, fullName: id, countryCode: 'GW', kycStatus: 'verified', isEmailVerified: true }, getJwtAccessSecret(), { expiresIn: '1h' });

async function main() {
  report('0 banco de teste e PostgreSQL 17', /PostgreSQL 17\./.test((await q('select version() v'))[0].v));
  await q("INSERT INTO countries (id,code,name,flag,currency,currency_symbol,phone_prefix) VALUES ('GW','GW','Guiné-Bissau','x','XOF','CFA','+245') ON CONFLICT DO NOTHING");
  await q("INSERT INTO categories (id,name,slug) VALUES ('cat_eletro','Eletrônicos','eletronicos'),('cat_cel','Celulares','celulares'),('cat_tab','Tablets','tablets'),('cat_semcor','Sem cor','sem-cor'),('cat_vazia','Vazia','vazia'),('cat_roupa','Roupas','roupas')");
  await q("UPDATE categories SET parent_id='cat_eletro' WHERE id IN ('cat_cel','cat_tab','cat_semcor')");
  await db.insert(users).values({ id: 'usr_sel', email: 'usr_sel@t.test', passwordHash: 'x', fullName: 'Vend', phone: '1', role: 'SELLER', countryCode: 'GW', kycStatus: 'verified', riskScore: 'baixo', isActive: true, isEmailVerified: true, isPhoneVerified: false, createdAt: new Date(), updatedAt: new Date() } as any);
  await db.insert(sellers).values({ id: 'sel1', userId: 'usr_sel', companyName: 'S', tradingName: 'S', taxId: '0', phone: '1', countryCode: 'GW', status: 'active', kycStatus: 'verified', isEmailVerified: true, createdAt: new Date(), updatedAt: new Date() } as any);
  await db.insert(addresses).values({ id: 'ad1', userId: 'usr_sel', recipientName: 'L', street: 'R', number: '1', city: 'B', state: 'B', countryCode: 'GW', phone: '9', isDefault: false, addressType: 'business', createdAt: new Date(), updatedAt: new Date() } as any);
  await db.insert(stores).values({ id: 'st1', sellerId: 'sel1', name: 'Loja', slug: 'loja', countryCode: 'GW', status: 'active', operationalAddressId: 'ad1', createdAt: new Date(), updatedAt: new Date() } as any);

  const cor = (await createAttribute(db, 'cat_eletro', { name: 'Cor', code: 'cor', type: 'select', isRequired: true, optionsJson: ['Preto', 'Branco'], sortOrder: 1 })).attribute;
  await createAttribute(db, 'cat_cel', { name: 'Memória RAM', code: 'memoria_ram', type: 'number', isRequired: true, unit: 'GB', decimals: 0, minValue: 0, maxValue: 1024, sortOrder: 2, displayGroup: 'Desempenho', helpText: 'Memória instalada', placeholder: 'Ex.: 8' });
  await createAttribute(db, 'cat_cel', { name: 'Resistente à água', code: 'resistente_agua', type: 'boolean', isRequired: true, sortOrder: 3 });
  await createAttribute(db, 'cat_cel', { name: 'Itens inclusos', code: 'itens_inclusos', type: 'multiselect', optionsJson: ['Capa', 'Carregador', 'Fone'], sortOrder: 4 });
  await createAttribute(db, 'cat_cel', { name: 'Observações', code: 'obs', type: 'text', maxLength: 20, sortOrder: 5 });
  await createAttribute(db, 'cat_cel', { name: 'Peso líquido', code: 'peso_liq', type: 'number', unit: 'kg', decimals: 2, minValue: 0, sortOrder: 6, displayGroup: 'Desempenho' });
  await createAttribute(db, 'cat_cel', { name: 'Tamanho', code: 'tamanho', type: 'select', role: 'variant_axis', isRequired: true, optionsJson: ['P', 'M'], sortOrder: 7 });
  await createAttribute(db, 'cat_tab', { name: 'Cor', code: 'cor', type: 'select', isRequired: true, optionsJson: ['Preto', 'Branco', 'Rosa'], overridesId: cor.id });
  await disableInheritedAttribute(db, 'cat_semcor', cor.id);
  // definicao ANTIGA que repete um campo geral (hoje bloqueada na criacao): insercao direta para simular dado legado
  await q("INSERT INTO category_attributes (id,category_id,name,code,type,is_required,is_active) VALUES ('legacy_marca','cat_roupa','Marca','marca','text',true,true),('legacy_cor','cat_roupa','Tecido','tecido','text',false,true)");

  const app = express(); app.use(express.json()); app.use('/api', catalogRouter); app.use('/seller', sellerRouter);
  const server = http.createServer(app); await new Promise<void>((r) => server.listen(0, r));
  const url = `http://127.0.0.1:${(server.address() as any).port}`; const S = tok('usr_sel', 'SELLER');
  const call = async (method: string, path: string, body?: any) => { const r = await fetch(url + path, { method, headers: { Authorization: `Bearer ${S}`, 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined }); let j: any = null; try { j = await r.json(); } catch {} return { s: r.status, j }; };
  const load = async (cat: string) => (await call('GET', `/api/categories/${cat}/attributes`)).j.data as any[];

  // ---------- A. o que o assistente carrega por subcategoria
  const cel = await load('cat_cel');
  const celSel = selectFormAttributes(cel);
  report('A1 Celulares: efetivos = Cor herdada + 5 proprios (+ eixo Tamanho fora do formulario geral)', celSel.fields.map((f) => f.code).sort().join() === 'cor,itens_inclusos,memoria_ram,obs,peso_liq,resistente_agua' && celSel.axes.map((f) => f.code).join() === 'tamanho', celSel.fields.map((f) => f.code));
  const corCel = celSel.fields.find((f) => f.code === 'cor')!;
  report('A2 herdado identificado pelo backend (inheritedFrom=Eletrônicos) e campos de apresentacao (grupo, ajuda, placeholder, unidade, limites) chegam ao assistente', (corCel as any).inheritedFrom === 'Eletrônicos' && (celSel.fields.find((f) => f.code === 'memoria_ram') as any).displayGroup === 'Desempenho' && celSel.fields.find((f) => f.code === 'memoria_ram')!.helpText === 'Memória instalada' && (celSel.fields.find((f) => f.code === 'memoria_ram') as any).placeholder === 'Ex.: 8' && celSel.fields.find((f) => f.code === 'memoria_ram')!.unit === 'GB' && Number(celSel.fields.find((f) => f.code === 'memoria_ram')!.maxValue) === 1024);
  const tab = selectFormAttributes(await load('cat_tab')).fields;
  report('A3 Tablets: Cor SUBSTITUIDA (3 opcoes, inclui Rosa) e SEM os atributos de Celulares', tab.length === 1 && (tab[0].optionsJson as string[]).includes('Rosa') && (tab[0] as any).isOverride === true, tab.map((f) => f.code));
  report('A4 Sem cor: atributo herdado DESATIVADO nao chega ao formulario', selectFormAttributes(await load('cat_semcor')).fields.length === 0);
  report('A5 Vazia: nenhum atributo => assistente sem campos', selectFormAttributes(await load('cat_vazia')).fields.length === 0);
  const roupa = selectFormAttributes(await load('cat_roupa'));
  report('A6 definicao antiga "Marca" nao vira campo duplicado (esta em "duplicates"); "Tecido" segue', roupa.fields.map((f) => f.code).join() === 'tecido' && roupa.duplicates.map((f) => f.code).join() === 'marca');
  report('A7 agrupamento da UI: "Desempenho" (obrigatorio) antes de "Outras características"', groupFormAttributes(celSel.fields).map((g) => g.name).join('|') === 'Desempenho|Outras características');
  // troca de subcategoria: Celulares -> Tablets
  const celValues: FormValues = { cor: 'Preto', memoria_ram: '8', resistente_agua: 'false', itens_inclusos: ['Capa'] };
  const swap = reconcileValues(tab, celValues);
  report('A8 trocar Celulares -> Tablets: Cor permanece, o resto sai (3 removidos listados)', swap.values.cor === 'Preto' && Object.keys(swap.values).length === 1 && swap.dropped.length === 3, swap);
  const swap2 = reconcileValues(celSel.fields, { cor: 'Rosa' });
  report('A9 Tablets -> Celulares com Cor=Rosa (opcao inexistente em Celulares): valor descartado', swap2.dropped.join() === 'cor' && !('cor' in swap2.values), swap2);

  // ---------- B. cadastro pelo payload do assistente (rota real do vendedor), modo ESTRITO ligado SO neste processo de teste
  const base = { title: 'Celular', price: 1000, image: 'x.jpg', storeId: 'st1', weightKg: 0.35, dimensionsCm: { length: 20, width: 10, height: 5 }, stock: 4, condition: 'new', brand: 'Acme', model: 'X1' };
  const labels = (extra: any = {}) => ({ Marca: 'Acme', Modelo: 'X1', 'Condição': 'Novo', Peso: '0.35 kg', 'Dimensões': '20 × 10 × 5 cm', Garantia: '12 Meses', 'Armazém': 'Bissau', ...extra });
  process.env.PRODUCT_ATTRIBUTES_STRICT = '1';
  const goodValues: FormValues = { cor: 'Preto', memoria_ram: '0', resistente_agua: 'false', itens_inclusos: ['Fone', 'Capa'], obs: 'Lacrado', peso_liq: '0,35' };
  report('B0 formulario valido (0 e "Não")', Object.keys(validateFormFields(celSel.fields, goodValues)).length === 0);
  // P2: eixo obrigatorio (Tamanho) da categoria => produto de uma unica opcao = UMA variacao
  const body = { ...base, categoryId: 'cat_cel', specs: { ...buildAttributeSpecs(celSel.fields, goodValues), ...labels() }, variants: [{ title: 'Unica', sku: 'P5-UNICA', price: 1000, stock: 4, size: 'P' }] };
  const ok = await call('POST', '/seller/products', body);
  report('B1 POST /seller/products com o payload do assistente em modo ESTRITO (PRODUCT_ATTRIBUTES_STRICT=1) => 201 (compatibilidade completa do payload comprovada)', ok.s === 201 && ok.j?.success, ok.j);
  const pid = ok.j?.data?.id;
  const rows = await q('SELECT attribute_code c, value_text t, value_number::float nm, value_bool b, option_value o FROM product_attribute_values WHERE product_id=$1 ORDER BY 1,5', [pid]);
  const g = (c: string) => rows.filter((r) => r.c === c);
  report('B2 0 e false chegaram ao banco como 0 / false (nao como vazio): memoria_ram=0, resistente_agua=false, peso_liq=0.35, multiselect 2 linhas', g('memoria_ram')[0]?.nm === 0 && g('resistente_agua')[0]?.b === false && g('peso_liq')[0]?.nm === 0.35 && g('itens_inclusos').length === 2 && g('obs')[0]?.t === 'Lacrado', rows);
  const unk = await q("SELECT count(*)::int n FROM product_attributes WHERE product_id=$1 AND name IN ('Marca','Modelo','Condição','Peso','Dimensões','Garantia','Armazém')", [pid]);
  report('B3 rotulos gerais continuam indo ao legado (7), sem virar atributo tipado; nenhum duplicado em product_attribute_values', unk[0].n === 7 && rows.every((r) => !/marca|modelo|peso$|garantia/.test(r.c)));
  process.env.PRODUCT_ATTRIBUTES_STRICT = '';

  // ---------- C. erros especificos por campo vindos do backend
  const bad = await call('POST', '/seller/products', { ...base, title: 'Ruim', categoryId: 'cat_cel', specs: { cor: 'Rosa', memoria_ram: 2048, resistente_agua: true, peso_liq: '0,355', ...labels() } });
  const ex = extractSubmitError({ response: { status: bad.s, data: bad.j } });
  report('C1 backend recusa (400) e o assistente extrai erro POR CAMPO: cor (opcao), memoria_ram (maximo), peso_liq (casas decimais)', bad.s === 400 && ex.code === 'PRODUCT_ATTRIBUTES_INVALID' && Object.keys(ex.fieldErrors).sort().join() === 'cor,memoria_ram,peso_liq' && /Opções permitidas: Preto, Branco/.test(ex.fieldErrors.cor) && /1024/.test(ex.fieldErrors.memoria_ram) && /2 casa/.test(ex.fieldErrors.peso_liq), ex);
  report('C2 mensagem geral legivel (nao "Request failed...") e nada gravado', /Valor inválido|no máximo/.test(ex.message) && (await n("SELECT count(*)::int n FROM products WHERE title='Ruim'")) === 0, ex.message);
  const miss = await call('POST', '/seller/products', { ...base, title: 'Faltando', categoryId: 'cat_cel', specs: { ...labels() } });
  const exm = extractSubmitError({ response: { status: miss.s, data: miss.j } });
  report('C3 obrigatorios ausentes: 3 erros por campo (cor, memoria_ram, resistente_agua); o eixo Tamanho NAO e exigido', Object.keys(exm.fieldErrors).sort().join() === 'cor,memoria_ram,resistente_agua', exm.fieldErrors);
  const front = validateFormFields(celSel.fields, {});
  report('C4 o front-end acusa os MESMOS campos que o backend antes de enviar (texto do "obrigatorio" mais curto no front)', JSON.stringify(Object.keys(front).sort()) === JSON.stringify(Object.keys(exm.fieldErrors).sort()) && /obrigat/.test(front.cor), [front, exm.fieldErrors]);

  // ---------- D. sem atributos, subcategorias, duplicacao
  const plain = await call('POST', '/seller/products', { ...base, title: 'Sem atributos', categoryId: 'cat_vazia', specs: labels() });
  report('D1 cadastro SEM atributos (so rotulos gerais) => 201; 0 valores tipados', plain.s === 201 && (await n('SELECT count(*)::int n FROM product_attribute_values WHERE product_id=$1', [plain.j.data.id])) === 0, plain.j);
  const noSpecs = await call('POST', '/seller/products', { ...base, title: 'Sem specs', categoryId: 'cat_vazia' });
  report('D2 payload sem specs em categoria sem atributos => 201', noSpecs.s === 201);
  const tabP = await call('POST', '/seller/products', { ...base, title: 'Tablet', categoryId: 'cat_tab', specs: { ...buildAttributeSpecs(tab, { cor: 'Rosa' }), ...labels() } });
  report('D3 Tablet com Cor substituida (Rosa) => 201', tabP.s === 201, tabP.j);
  const roupaP = await call('POST', '/seller/products', { ...base, title: 'Camisa', categoryId: 'cat_roupa', specs: { ...buildAttributeSpecs(roupa.fields, { tecido: 'Algodão' }), ...labels() } });
  report('D4 categoria com definicao antiga "Marca" obrigatoria: o assistente nao pergunta duas vezes; o rotulo geral Marca atende o servidor => 201', roupaP.s === 201, roupaP.j);

  // ---------- E. variantes, SKU, preco e estoque por variante preservados
  const vbody = { ...base, title: 'Com variantes', categoryId: 'cat_cel', stock: 0, specs: { ...buildAttributeSpecs(celSel.fields, { cor: 'Branco', memoria_ram: '8', resistente_agua: 'true' }), ...labels() }, variants: [
    { title: 'Preto / P', sku: 'P5-A', price: 1200, stock: 4, color: 'Preto', size: 'P', capacity: '128 GB' }, { title: 'Preto / M', sku: 'P5-B', price: 1300, stock: 2, color: 'Preto', size: 'M', capacity: '256 GB' }] };
  const vp = await call('POST', '/seller/products', vbody);
  const vs = vp.j?.data?.id ? await q('SELECT sku, price::float p, color, size, capacity, stock FROM product_variants WHERE product_id=$1 ORDER BY sku', [vp.j.data.id]) : [];
  const inv = vp.j?.data?.id ? await q('SELECT variant_id, quantity_on_hand q FROM inventory WHERE product_id=$1 ORDER BY quantity_on_hand', [vp.j.data.id]) : [];
  report('E1 produto variavel com atributos: 2 variantes (SKU, preco, cor, tamanho, capacidade), estoque por variante via inventory (2 e 4), sem linha do produto, product_variants.stock=0', vp.s === 201 && vs.length === 2 && vs[0].sku === 'P5-A' && vs[1].p === 1300 && vs[0].capacity === '128 GB' && vs.every((v) => Number(v.stock) === 0) && inv.length === 2 && inv[0].q === 2 && inv[1].q === 4 && inv.every((r) => !!r.variant_id), { s: vp.s, vs, inv, j: vp.j?.error });
  report('E2 atributos do produto variavel gravados no produto (3 valores) e Tamanho (eixo) nao exigido nem gravado como atributo', (await n("SELECT count(*)::int n FROM product_attribute_values WHERE product_id=$1", [vp.j.data.id])) === 3 && (await n("SELECT count(*)::int n FROM product_attribute_values WHERE product_id=$1 AND attribute_code='tamanho'", [vp.j.data.id])) === 0);
  const dupSku = await call('POST', '/seller/products', { ...vbody, title: 'SKU repetido' });
  report('E3 SKU duplicado: 400 e nada fica (produto, valores, estoque)', dupSku.s === 400 && (await n("SELECT count(*)::int n FROM products WHERE title='SKU repetido'")) === 0 && (await n("SELECT count(*)::int n FROM product_attribute_values v LEFT JOIN products p ON p.id=v.product_id WHERE p.id IS NULL")) === 0, dupSku.j);

  server.close();
  await pool.end();
  console.log(`\n=== RESULTADO: ${passed}/${total} ===`);
  process.exit(passed === total ? 0 : 1);
}
main().catch((e) => { console.error('ERRO FATAL', e); process.exit(2); });
