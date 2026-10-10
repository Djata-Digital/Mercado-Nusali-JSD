/**
 * ATRIBUTOS FASE 3 - integracao: armazenamento tipado (product_attribute_values), validacao, heranca/substituicao,
 * compatibilidade legada, atomicidade e variantes. Contra Postgres 17 DESCARTAVEL ja migrado (0037). Nunca producao.
 */
process.env.REDIS_URL = '';
import { assertLedgerTestDatabaseGuard } from './ledgerTestDbGuard.js';
const testDbUrl = assertLedgerTestDatabaseGuard();
process.env.DATABASE_URL = testDbUrl;
process.env.NODE_ENV = 'test';
process.env.SKIP_RUNTIME_ALIGN = 'true';
process.env.JWT_ACCESS_SECRET = 'attrp3_access_secret_0123456789abcdef';

import 'dotenv/config';
import express from 'express';
import http from 'http';
import jwt from 'jsonwebtoken';
import pg from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import * as schema from '../src/db/schema.js';
import { users, sellers, stores, addresses, products } from '../src/db/schema.js';
import { getJwtAccessSecret } from '../src/server/modules/auth/jwtConfig.js';
import { catalogRouter } from '../src/server/modules/catalog/catalogRoutes.js';
import { sellerRouter } from '../src/server/sellerRoutes.js';
import { ProductCreationService } from '../src/server/modules/catalog/productCreationService.js';
import { CatalogService } from '../src/server/modules/catalog/catalogService.js';
import { createAttribute, deleteAttribute, disableInheritedAttribute, resolveEffectiveAttributes } from '../src/server/modules/catalog/attributeDefinitionService.js';
import { replaceProductAttributeValues, prepareProductAttributes, loadProductAttributeValues, composeProductSpecs } from '../src/server/modules/catalog/attributeValueService.js';
import { ProductAttributeValidationError } from '../src/server/modules/catalog/attributeValidator.js';

if (!['localhost', '127.0.0.1'].includes(new URL(testDbUrl).hostname)) throw new Error('Somente banco local descartavel.');
const pool = new pg.Pool({ connectionString: testDbUrl, max: 8 });
const db = drizzle(pool, { schema });
let passed = 0, total = 0;
const report = (l: string, ok: boolean, d?: any) => { total++; if (ok) passed++; console.log(`[${ok ? 'PASS' : 'FAIL'}] ${l}${ok ? '' : ' -> ' + JSON.stringify(d ?? null).slice(0, 500)}`); };
const q = async (s: string, p?: any[]) => (await pool.query(s, p)).rows;
const n = async (s: string, p?: any[]) => Number((await q(s, p))[0].n);
const fails = async (s: string, p?: any[]) => { try { await pool.query(s, p); return null; } catch (e: any) { return e.code + ':' + (e.constraint || e.message.slice(0, 60)); } };
const tok = (id: string, role: string) => jwt.sign({ userId: id, email: `${id}@t.test`, role, fullName: id, countryCode: 'GW', kycStatus: 'verified', isEmailVerified: true }, getJwtAccessSecret(), { expiresIn: '1h' });
const tryCreate = async (input: any) => { try { return { p: await ProductCreationService.createProduct('usr_sel', input, db) as any, e: null as any }; } catch (e: any) { return { p: null as any, e }; } };

async function main() {
  const ver = (await q('select version() v'))[0].v;
  report('0 banco de teste e PostgreSQL 17', /PostgreSQL 17\./.test(ver), ver);

  await q("INSERT INTO countries (id,code,name,flag,currency,currency_symbol,phone_prefix) VALUES ('GW','GW','Guiné-Bissau','x','XOF','CFA','+245') ON CONFLICT DO NOTHING");
  await q("INSERT INTO categories (id,name,slug) VALUES ('cat_raiz','Raiz','raiz'),('cat_cel','Celulares','celulares'),('cat_tab','Tablets','tablets'),('cat_semcor','Sem cor','sem-cor'),('cat_vazia','Vazia','vazia')");
  await q("UPDATE categories SET parent_id='cat_raiz' WHERE id IN ('cat_cel','cat_tab','cat_semcor')");
  const mk = (id: string, role: string) => db.insert(users).values({ id, email: `${id}@t.test`, passwordHash: 'x', fullName: id, phone: '1', role, countryCode: 'GW', kycStatus: 'verified', riskScore: 'baixo', isActive: true, isEmailVerified: true, isPhoneVerified: false, createdAt: new Date(), updatedAt: new Date() } as any);
  await mk('usr_sel', 'SELLER');
  await db.insert(sellers).values({ id: 'sel1', userId: 'usr_sel', companyName: 'S', tradingName: 'S', taxId: '0', phone: '1', countryCode: 'GW', status: 'active', createdAt: new Date(), updatedAt: new Date() } as any);
  await db.insert(addresses).values({ id: 'ad1', userId: 'usr_sel', recipientName: 'L', street: 'R', number: '1', city: 'B', state: 'B', countryCode: 'GW', phone: '9', isDefault: false, addressType: 'business', createdAt: new Date(), updatedAt: new Date() } as any);
  await db.insert(stores).values({ id: 'st1', sellerId: 'sel1', name: 'Loja', slug: 'loja', countryCode: 'GW', status: 'active', operationalAddressId: 'ad1', createdAt: new Date(), updatedAt: new Date() } as any);

  // definicoes pelo servico real da Fase 2
  const cor = (await createAttribute(db, 'cat_raiz', { name: 'Cor', code: 'cor', type: 'select', isRequired: true, optionsJson: ['Preto', 'Branco'], sortOrder: 1 })).attribute;
  await createAttribute(db, 'cat_cel', { name: 'Memória', code: 'memoria', type: 'number', isRequired: true, unit: 'GB', minValue: 0, maxValue: 1024, decimals: 0, sortOrder: 2 });
  await createAttribute(db, 'cat_cel', { name: 'Resistente à água', code: 'resistente_agua', type: 'boolean', isRequired: true, sortOrder: 3 });
  await createAttribute(db, 'cat_cel', { name: 'Extras', code: 'extras', type: 'multiselect', optionsJson: ['Capa', 'Carregador', 'Fone'], sortOrder: 4 });
  await createAttribute(db, 'cat_cel', { name: 'Observações', code: 'obs', type: 'text', maxLength: 20, sortOrder: 5 });
  await createAttribute(db, 'cat_cel', { name: 'Peso líquido', code: 'peso_liq', type: 'number', unit: 'kg', decimals: 2, minValue: 0, sortOrder: 6 });
  await createAttribute(db, 'cat_cel', { name: 'Tamanho', code: 'tamanho', type: 'select', role: 'variant_axis', isRequired: true, optionsJson: ['P', 'M'], sortOrder: 7 });
  await createAttribute(db, 'cat_tab', { name: 'Cor', code: 'cor', type: 'select', isRequired: true, optionsJson: ['Preto', 'Branco', 'Rosa'], overridesId: cor.id });
  await disableInheritedAttribute(db, 'cat_semcor', cor.id);

  const base = { title: 'Produto', price: 1000, image: 'x.jpg', storeId: 'st1', weightKg: 0.3, dimensionsCm: { length: 5, width: 5, height: 5 }, stock: 3 } as any;
  // P2: Tamanho (eixo obrigatorio de Celulares) => todo produto criado em cat_cel tem UMA variacao de opcao unica (SKU novo a cada uso)
  let vseq = 0;
  const cel = { ...base, categoryId: 'cat_cel', get variants() { return [{ title: 'Unica', sku: `P3-UNICA-${++vseq}`, price: 1000, stock: 3, size: 'P' }]; } } as any;
  const good = { cor: 'Preto', memoria: '128', resistente_agua: 'Não', extras: 'Fone, Capa', obs: 'Lacrado', peso_liq: '0,35' };
  const counts = async () => ({ p: await n('SELECT count(*)::int n FROM products'), v: await n('SELECT count(*)::int n FROM product_attribute_values'), l: await n('SELECT count(*)::int n FROM product_attributes'), i: await n('SELECT count(*)::int n FROM product_images'), inv: await n('SELECT count(*)::int n FROM inventory'), mv: await n('SELECT count(*)::int n FROM inventory_movements'), pv: await n('SELECT count(*)::int n FROM product_variants') });

  // ---------- A. criacao com atributos de todos os tipos
  const a = await tryCreate({ ...cel, title: 'Celular A', specs: { ...good, Marca: 'Acme', 'Condição': 'Novo', Peso: '0,3' }, brand: 'Acme' });
  const rowsA = a.p ? await q('SELECT attribute_code c, value_text t, value_number::text nm, value_bool b, option_value o FROM product_attribute_values WHERE product_id=$1 ORDER BY attribute_code, option_value', [a.p.id]) : [];
  report('A1 produto criado com 6 atributos (select, number, boolean, multiselect, text, number decimal) => 8 linhas tipadas (multiselect = 1 por opcao)', !!a.p && rowsA.length === 7, { e: a.e?.message, rowsA });
  const byCode = (c: string) => rowsA.filter((r) => r.c === c);
  report('A2 cada tipo no lugar certo: text->value_text, number->value_number, boolean->value_bool, select/multiselect->option_value; as outras colunas ficam nulas', byCode('obs')[0]?.t === 'Lacrado' && byCode('obs')[0]?.o === null && Number(byCode('memoria')[0]?.nm) === 128 && byCode('memoria')[0]?.t === null && byCode('resistente_agua')[0]?.b === false && byCode('cor')[0]?.o === 'Preto' && byCode('extras').map((r) => r.o).join() === 'Capa,Fone' && Number(byCode('peso_liq')[0]?.nm) === 0.35, rowsA);
  report('A3 todas as linhas trazem attribute_id valido (FK) e attribute_code igual ao da definicao', await n("SELECT count(*)::int n FROM product_attribute_values v JOIN category_attributes d ON d.id=v.attribute_id AND d.code=v.attribute_code WHERE v.product_id=$1", [a.p.id]) === 7);
  const leg = await q('SELECT name, value FROM product_attributes WHERE product_id=$1', [a.p.id]);
  const legMap = Object.fromEntries(leg.map((r) => [r.name, r.value]));
  report('A4 visao legada gravada na MESMA transacao, com os valores normalizados ("Não", "Capa, Fone", "0.35") e os rotulos gerais (Marca, Condição, Peso) preservados', legMap.resistente_agua === 'Não' && legMap.extras === 'Capa, Fone' && legMap.peso_liq === '0.35' && legMap.Marca === 'Acme' && legMap['Condição'] === 'Novo' && legMap.Peso === '0,3' && legMap.cor === 'Preto', legMap);
  const aj = (await q('SELECT attributes_json j FROM products WHERE id=$1', [a.p.id]))[0].j;
  report('A5 products.attributes_json espelha a visao legada (mesmas chaves e textos)', JSON.stringify(Object.entries(aj).sort()) === JSON.stringify(Object.entries(legMap).sort()), { aj, legMap });

  // ---------- B. false e 0
  const b = await tryCreate({ ...cel, title: 'Celular B', specs: { cor: 'Branco', memoria: 0, resistente_agua: false, peso_liq: 0 } });
  const rowsB = b.p ? await q('SELECT attribute_code c, value_number::text nm, value_bool b FROM product_attribute_values WHERE product_id=$1 ORDER BY 1', [b.p.id]) : [];
  report('B1 false e 0 (numeros JS) sao aceitos em atributos OBRIGATORIOS e gravados como false/0 (nao como vazio)', !!b.p && rowsB.find((r) => r.c === 'resistente_agua')?.b === false && Number(rowsB.find((r) => r.c === 'memoria')?.nm) === 0 && Number(rowsB.find((r) => r.c === 'peso_liq')?.nm) === 0, { e: b.e?.message, rowsB });
  const b2 = await tryCreate({ ...cel, title: 'Celular B2', specs: { cor: 'Branco', memoria: '0', resistente_agua: 'false' } });
  report('B2 "0" e "false" em texto tambem', !!b2.p && (await n('SELECT count(*)::int n FROM product_attribute_values WHERE product_id=$1 AND value_bool=false', [b2.p.id])) === 1, b2.e?.message);
  const detB: any = await CatalogService.getProductById(b.p.id);
  report('B3 leitura devolve "Não" e "0" (nao some, nao vira vazio)', detB?.specs?.resistente_agua === 'Não' && detB.specs.memoria === '0' && detB.attributeValues.find((v: any) => v.code === 'resistente_agua')?.value === false && detB.attributeValues.find((v: any) => v.code === 'memoria')?.value === 0, detB?.specs);

  // ---------- C. obrigatorios
  const before = await counts();
  const c1 = await tryCreate({ ...cel, specs: { memoria: '8' } });
  report('C1 obrigatorios ausentes (cor herdada, resistente_agua) => 400 PRODUCT_ATTRIBUTES_INVALID com detalhes por campo; mensagem antiga com a categoria', c1.e instanceof ProductAttributeValidationError && c1.e.details.map((d: any) => d.field).sort().join() === 'cor,resistente_agua' && /obrigatório para a categoria "Celulares"/.test(c1.e.message), c1.e?.message);
  report('C2 NADA foi gravado (produto, valores, legado, imagens, estoque)', JSON.stringify(await counts()) === JSON.stringify(before));
  const c3 = await tryCreate({ ...cel, specs: {} });
  report('C3 specs vazio (3 obrigatorios) acusados; sem specs/attributesJson no payload tambem', c3.e?.details?.length === 3 && (await tryCreate({ ...cel })).e?.details?.length === 3, { c3: c3.e?.details?.map((d: any) => d.field), msg: c3.e?.message });
  const c4 = await tryCreate({ ...cel, specs: { cor: ' ', memoria: '', resistente_agua: null } });
  report('C4 "", espacos e null equivalem a ausente (3 obrigatorios)', c4.e?.details?.filter((d: any) => d.code === 'REQUIRED').length === 3, c4.e?.details);
  const c5 = await tryCreate({ ...cel, specs: { ...good, tamanho: undefined } });
  report('C5 eixo de variante "tamanho" (obrigatorio na definicao) NAO e exigido no produto', !!c5.p, c5.e?.message);

  // ---------- D. valores invalidos
  const bad = async (specs: any, code: string) => { const before2 = JSON.stringify(await counts()); const r = await tryCreate({ ...cel, specs: { ...good, ...specs } }); return r.e instanceof ProductAttributeValidationError && r.e.details.some((d: any) => d.code === code) && JSON.stringify(await counts()) === before2; };
  report('D1 select fora das opcoes', await bad({ cor: 'Rosa' }, 'INVALID_OPTION'));
  report('D2 multiselect com opcao invalida', await bad({ extras: 'Capa, Teclado' }, 'INVALID_OPTION'));
  report('D3 numero invalido / fora do intervalo / decimais', await bad({ memoria: 'abc' }, 'INVALID_NUMBER') && await bad({ memoria: 2048 }, 'OUT_OF_RANGE') && await bad({ memoria: -1 }, 'OUT_OF_RANGE') && await bad({ memoria: '1,5' }, 'TOO_MANY_DECIMALS') && await bad({ peso_liq: '0,123' }, 'TOO_MANY_DECIMALS'));
  report('D4 texto acima de maxLength (20)', await bad({ obs: 'x'.repeat(21) }, 'TOO_LONG'));
  report('D5 booleano invalido', await bad({ resistente_agua: 'talvez' }, 'INVALID_BOOLEAN'));
  report('D6 valor com tipo errado (objeto)', await bad({ memoria: { a: 1 } }, 'INVALID_TYPE'));
  report('D7 mesmo atributo duas vezes com valores diferentes (codigo e nome)', await bad({ Cor: 'Branco' }, 'CONFLICTING_VALUES'));
  const manyBad = await tryCreate({ ...cel, specs: { cor: 'Rosa', memoria: 'x', resistente_agua: 'talvez' } });
  report('D8 todos os erros voltam de uma vez (3)', manyBad.e?.details?.length === 3);

  // ---------- E. heranca e substituicao
  const e1 = await tryCreate({ ...base, categoryId: 'cat_tab', specs: { cor: 'Rosa' } });
  report('E1 subcategoria com SUBSTITUICAO explicita aceita a opcao nova (Rosa) e a grava', !!e1.p && (await n("SELECT count(*)::int n FROM product_attribute_values v JOIN category_attributes d ON d.id=v.attribute_id WHERE v.product_id=$1 AND v.option_value='Rosa' AND d.category_id='cat_tab' AND d.overrides_id IS NOT NULL", [e1.p.id])) === 1, e1.e?.message);
  const e2 = await tryCreate({ ...base, categoryId: 'cat_tab', specs: { cor: 'Verde' } });
  report('E2 ...e continua recusando opcao fora da substituicao', e2.e?.details?.[0]?.code === 'INVALID_OPTION');
  const e3 = await tryCreate({ ...cel, specs: { ...good, cor: 'Rosa' } });
  report('E3 a substituicao NAO vaza: a irma (Celulares) segue com as opcoes herdadas e recusa Rosa', e3.e?.details?.[0]?.code === 'INVALID_OPTION');
  const e4 = await tryCreate({ ...base, categoryId: 'cat_semcor', specs: {} });
  report('E4 atributo herdado DESATIVADO na subcategoria deixa de ser exigido', !!e4.p, e4.e?.message);
  const e5 = await tryCreate({ ...base, categoryId: 'cat_semcor', title: 'sem cor 2', specs: { cor: 'Qualquer' } });
  report('E5 ...e um valor enviado para ele nao vira valor tipado (guardado so na visao legada, como chave desconhecida)', !!e5.p && (await n('SELECT count(*)::int n FROM product_attribute_values WHERE product_id=$1', [e5.p.id])) === 0 && (await n("SELECT count(*)::int n FROM product_attributes WHERE product_id=$1 AND name='cor'", [e5.p.id])) === 1);
  report('E6 o atributo herdado de Celulares (cor da raiz) aparece 1 vez nos efetivos e a definicao da raiz e a do produto A', (await resolveEffectiveAttributes(db, 'cat_cel')).filter((x: any) => x.code === 'cor').length === 1 && byCode('cor').length === 1);

  // ---------- F. duplicidade e consistencia
  const dupDirect = await fails("INSERT INTO product_attribute_values (id,product_id,attribute_id,attribute_code,option_value) SELECT 'dup1',$1::varchar,attribute_id,attribute_code,option_value FROM product_attribute_values WHERE product_id=$1 AND attribute_code='extras' LIMIT 1", [a.p.id]);
  report('F1 banco recusa linha duplicada (produto, atributo, opcao) - indice unico', /^23505/.test(dupDirect || ''), dupDirect);
  const dupScalar = await fails("INSERT INTO product_attribute_values (id,product_id,attribute_id,attribute_code,value_text) SELECT 'dup2',$1::varchar,attribute_id,attribute_code,'outro' FROM product_attribute_values WHERE product_id=$1 AND attribute_code='obs' LIMIT 1", [a.p.id]);
  report('F2 ...e um segundo valor para atributo escalar (text) do mesmo produto tambem', /^23505/.test(dupScalar || ''), dupScalar);
  const zero = await fails("INSERT INTO product_attribute_values (id,product_id,attribute_id,attribute_code) SELECT 'z1',$1,id,code FROM category_attributes WHERE code='obs'", [a.p.id]);
  const two = await fails("INSERT INTO product_attribute_values (id,product_id,attribute_id,attribute_code,value_text,value_bool) SELECT 'z2',$1,id,code,'x',true FROM category_attributes WHERE code='obs'", [a.p.id]);
  report('F3 CHECK: linha sem valor ou com dois valores recusada', /23514/.test(zero || '') && /23514/.test(two || ''), { zero, two });
  // a mesma entrada duplicada em lote (bug do chamador) derruba a transacao inteira
  const defs = await resolveEffectiveAttributes(db, 'cat_cel');
  const prep = await prepareProductAttributes(db, 'cat_cel', 'Celulares', good, {}, defs);
  let dupErr = '';
  try {
    await db.transaction(async (tx: any) => {
      await tx.insert(products).values({ id: 'prod_dup_test', title: 'x', price: '1', currency: 'XOF', categoryId: 'cat_cel', sellerId: 'sel1', storeId: 'st1', stock: 0, image: 'x', countryCode: 'GW', status: 'active', isActive: true, createdAt: new Date(), updatedAt: new Date() } as any);
      await replaceProductAttributeValues(tx, 'prod_dup_test', [...prep.values, prep.values[0]]);
    });
  } catch (e: any) { dupErr = e.message; }
  report('F4 valores duplicados em lote => erro do banco e a transacao desfaz o produto junto', !!dupErr && (await n("SELECT count(*)::int n FROM products WHERE id='prod_dup_test'")) === 0 && (await n("SELECT count(*)::int n FROM product_attribute_values WHERE product_id='prod_dup_test'")) === 0, dupErr);
  const ordA = await tryCreate({ ...cel, title: 'Ordem1', specs: { ...good, extras: ['Fone', 'Capa', 'Fone'] } });
  const ordB = await tryCreate({ ...cel, title: 'Ordem2', specs: { ...good, extras: 'Capa, Fone' } });
  const ex = async (id: string) => (await q("SELECT option_value o FROM product_attribute_values WHERE product_id=$1 AND attribute_code='extras' ORDER BY option_value", [id])).map((r) => r.o).join();
  report('F5 multiselect: ordem/repeticao do payload nao importa (lista com repeticao == texto legado) e fica sem duplicata', (await ex(ordA.p.id)) === 'Capa,Fone' && (await ex(ordB.p.id)) === 'Capa,Fone');
  const noExtras = await tryCreate({ ...cel, title: 'Sem extras', specs: { ...good, extras: [] } });
  report('F6 multiselect vazio (opcional) nao grava linhas', !!noExtras.p && (await n("SELECT count(*)::int n FROM product_attribute_values WHERE product_id=$1 AND attribute_code='extras'", [noExtras.p.id])) === 0);

  // ---------- G. compatibilidade legada na leitura
  const detA: any = await CatalogService.getProductById(a.p.id);
  report('G1 detalhe publico: specs/attributesJson no formato de sempre (chaves = codigo, textos Sim/Não e ", "), rotulos legados presentes, e attributeValues tipados adicionais', detA.specs.cor === 'Preto' && detA.specs.resistente_agua === 'Não' && detA.specs.extras === 'Capa, Fone' && detA.specs.Marca === 'Acme' && detA.attributesJson.memoria === '128' && Array.isArray(detA.attributeValues) && detA.attributeValues.length === 6, detA.specs);
  report('G2 attributeValues: tipos reais (boolean false, number 128, array no multiselect, unidade e nome da definicao)', (() => { const av = detA.attributeValues; const g = (c: string) => av.find((x: any) => x.code === c); return g('resistente_agua').value === false && g('memoria').value === 128 && g('memoria').unit === 'GB' && JSON.stringify(g('extras').value) === '["Capa","Fone"]' && g('cor').name === 'Cor' && g('peso_liq').value === 0.35; })(), detA.attributeValues);
  // produto LEGADO (anterior a fase 3): so attributes_json + product_attributes, sem linhas tipadas
  await q("INSERT INTO products (id,title,price,currency,category_id,seller_id,store_id,stock,image,country_code,status,is_active,attributes_json,created_at,updated_at) VALUES ('prod_legacy','Legado','10','XOF','cat_cel','sel1','st1',1,'x','GW','active',true,'{\"Cor\":\"Azul\",\"Marca\":\"Velha\"}'::jsonb,now(),now())");
  await q("INSERT INTO product_attributes (id,product_id,name,value) VALUES ('pa_l1','prod_legacy','Voltagem','110V'),('pa_l2','prod_legacy','Cor','Verde')");
  const detL: any = await CatalogService.getProductById('prod_legacy');
  report('G3 produto LEGADO (sem linhas tipadas) continua lido como antes: attributes_json vence product_attributes; nada some', detL.specs.Cor === 'Azul' && detL.specs.Voltagem === '110V' && detL.specs.Marca === 'Velha' && detL.attributeValues.length === 0, detL.specs);
  // deriva (nao deveria ocorrer): o tipado vence o legado para o mesmo codigo
  await q("UPDATE products SET attributes_json = attributes_json || '{\"cor\":\"Branco\"}'::jsonb WHERE id=$1", [a.p.id]);
  const detD: any = await CatalogService.getProductById(a.p.id);
  report('G4 se o legado divergir do tipado, o TIPADO vence (fonte principal)', detD.specs.cor === 'Preto', detD.specs.cor);
  await q("UPDATE products SET attributes_json = $2::jsonb WHERE id=$1", [a.p.id, JSON.stringify(aj)]);
  report('G5 composeProductSpecs: precedencia product_attributes < attributes_json < tipado', (() => { const s = composeProductSpecs([{ name: 'k', value: '1' }, { name: 'z', value: 'só linhas' }], { k: '2' }, [{ attributeId: 'x', code: 'k', name: 'K', type: 'text', unit: null, displayGroup: null, value: '3', displayValue: '3' }]); return s.k === '3' && s.z === 'só linhas'; })());

  // ---------- H. rotas HTTP
  const app = express(); app.use(express.json()); app.use('/api', catalogRouter); app.use('/seller', sellerRouter);
  const server = http.createServer(app); await new Promise<void>((r) => server.listen(0, r));
  const url = `http://127.0.0.1:${(server.address() as any).port}`; const S = tok('usr_sel', 'SELLER');
  const call = async (method: string, path: string, body?: any) => { const r = await fetch(url + path, { method, headers: { Authorization: `Bearer ${S}`, 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined }); let j: any = null; try { j = await r.json(); } catch {} return { s: r.status, j }; };
  const h1 = await call('POST', '/api/products', { ...cel, title: 'Via API', specs: { cor: 'Rosa', memoria: '8' } });
  report('H1 POST /products com atributos invalidos => 400, error.code PRODUCT_ATTRIBUTES_INVALID, details[] com field/code/message/hint, e message legivel (compat. com o assistente atual)', h1.s === 400 && h1.j?.error?.code === 'PRODUCT_ATTRIBUTES_INVALID' && Array.isArray(h1.j.error.details) && h1.j.error.details.length === 2 && h1.j.error.details.every((d: any) => d.field && d.code && d.message) && typeof h1.j.message === 'string' && /Rosa/.test(h1.j.message + JSON.stringify(h1.j.error.details)), h1.j);
  const h2 = await call('POST', '/api/products', { ...cel, title: 'Via API ok', specs: { ...good, Marca: 'Acme', Modelo: 'M1', 'Condição': 'Novo', Peso: '0,3', 'Dimensões': '5x5x5', Garantia: '12 meses', 'Armazém': 'Bissau' } });
  report('H2 POST /products com o payload do assistente (rotulos gerais injetados) => 201 e 6 valores tipados', h2.s === 201 && h2.j?.success && (await n('SELECT count(*)::int n FROM product_attribute_values WHERE product_id=$1', [h2.j.data.id])) === 7, h2.j);
  const h3 = await call('GET', `/seller/products/${a.p.id}`);
  report('H3 GET /seller/products/:id (edicao do vendedor): specs/attributesJson compostos + attributes (legado) + attributeValues; formato anterior preservado', h3.s === 200 && h3.j.data.specs.resistente_agua === 'Não' && h3.j.data.attributesJson.cor === 'Preto' && Array.isArray(h3.j.data.attributes) && h3.j.data.attributes.length === 9 && h3.j.data.attributeValues.length === 6, { s: h3.s, keys: Object.keys(h3.j?.data || {}) });
  process.env.PRODUCT_ATTRIBUTES_STRICT = '1';
  const h4 = await call('POST', '/api/products', { ...cel, title: 'Estrito', specs: { ...good, Misterio: 'x' } });
  delete process.env.PRODUCT_ATTRIBUTES_STRICT;
  const h5 = await call('POST', '/api/products', { ...cel, title: 'Tolerante', specs: { ...good, Misterio: 'x' } });
  report('H4 modo estrito (PRODUCT_ATTRIBUTES_STRICT=1) recusa chave desconhecida; o padrao de transicao aceita e preserva a chave na visao legada', h4.s === 400 && h4.j.error.details[0].code === 'UNKNOWN_ATTRIBUTE' && h5.s === 201 && (await n("SELECT count(*)::int n FROM product_attributes WHERE product_id=$1 AND name='Misterio'", [h5.j.data.id])) === 1, { h4: h4.j?.error, h5: h5.s });
  server.close();

  // ---------- I. categoria sem atributos (assistente atual) e eixo de variante
  const i1 = await tryCreate({ ...base, categoryId: 'cat_vazia', title: 'Vazia', specs: { Marca: 'X', Modelo: 'Y', 'Condição': 'Novo', Peso: '1', 'Dimensões': '1x1x1', Garantia: '3m', 'Armazém': 'W' } });
  report('I1 categoria SEM atributos: 7 rotulos do assistente seguem para a visao legada (7 linhas), 0 tipadas - fluxo igual ao anterior', !!i1.p && (await n('SELECT count(*)::int n FROM product_attributes WHERE product_id=$1', [i1.p.id])) === 7 && (await n('SELECT count(*)::int n FROM product_attribute_values WHERE product_id=$1', [i1.p.id])) === 0, i1.e?.message);
  const i2 = await tryCreate({ ...base, categoryId: 'cat_vazia', title: 'Vazia2' });
  report('I2 sem specs em categoria sem atributos continua valido', !!i2.p);

  // ---------- J. atomicidade
  await q("INSERT INTO product_variants (id,product_id,title,price,sku) VALUES ('pv_exist','prod_legacy','Existente',1,'SKU-DUP')");
  const snap = JSON.stringify(await counts());
  const j1 = await tryCreate({ ...cel, title: 'Atomico 1', specs: good, variants: [{ title: 'P', sku: 'SKU-DUP', price: 10, stock: 1, color: 'Preto', size: 'P' }] });
  report('J1 falha de VARIANTE (SKU duplicado) depois dos atributos: produto, valores tipados, legado, imagens, variantes e estoque, NADA fica', !!j1.e && JSON.stringify(await counts()) === snap, { msg: j1.e?.message, snap, now: await counts() });
  // falha do proprio gravador (atributo removido entre validar e gravar => FK)
  const defsX = await resolveEffectiveAttributes(db, 'cat_cel');
  const prepX = await prepareProductAttributes(db, 'cat_cel', 'Celulares', good, {}, defsX);
  let fkErr = '';
  try {
    await db.transaction(async (tx: any) => {
      await tx.insert(products).values({ id: 'prod_fk_test', title: 'x', price: '1', currency: 'XOF', categoryId: 'cat_cel', sellerId: 'sel1', storeId: 'st1', stock: 0, image: 'x', countryCode: 'GW', status: 'active', isActive: true, createdAt: new Date(), updatedAt: new Date() } as any);
      await replaceProductAttributeValues(tx, 'prod_fk_test', prepX.values.map((v, k) => (k === prepX.values.length - 1 ? { ...v, attributeId: 'attr_inexistente' } : v)));
    });
  } catch (e: any) { fkErr = e.message; }
  report('J2 falha ao gravar o ultimo valor (FK) desfaz o produto e os valores ja inseridos na transacao', !!fkErr && (await n("SELECT count(*)::int n FROM products WHERE id='prod_fk_test'")) === 0 && (await n("SELECT count(*)::int n FROM product_attribute_values WHERE product_id='prod_fk_test'")) === 0, fkErr);
  const par = await Promise.all([1, 2, 3, 4, 5].map((k) => tryCreate({ ...cel, title: `Paralelo ${k}`, specs: { ...good, extras: ['Capa', 'Fone'] } })));
  report('J3 5 criacoes em paralelo: todas ok, cada produto com seus 7 valores e sem mistura entre produtos', par.every((r) => !!r.p) && (await Promise.all(par.map((r) => n('SELECT count(*)::int n FROM product_attribute_values WHERE product_id=$1', [r.p.id])))).every((c) => c === 7));
  const snap2 = JSON.stringify(await counts());
  const atom = await tryCreate({ ...cel, title: 'Imagem vazia', image: '', specs: good });
  report('J4 erro de validacao do produto ANTES da transacao (imagem) nao deixa valores soltos', !!atom.e && JSON.stringify(await counts()) === snap2);

  // ---------- K. variantes, SKU, preco e estoque preservados
  const k1 = await tryCreate({ ...cel, title: 'Com variantes', specs: { ...good, cor: 'Branco' }, variants: [{ title: 'P', sku: 'SKU-K1', price: 1000, stock: 5, color: 'Preto', size: 'P' }, { title: 'M', sku: 'SKU-K2', price: 1100, stock: 2, color: 'Preto', size: 'M' }] });
  const vs = k1.p ? await q('SELECT sku, price::float p, color, size, stock, variant_key FROM product_variants WHERE product_id=$1 ORDER BY sku', [k1.p.id]) : [];
  const inv = k1.p ? await q('SELECT variant_id, quantity_on_hand q FROM inventory WHERE product_id=$1 ORDER BY quantity_on_hand', [k1.p.id]) : [];
  report('K1 produto COM variantes e atributos: 2 variantes (SKU/preco/cor/tamanho), estoque via inventory por variante (sem linha do produto), variant_key gravada (Fase 7), product_variants.stock=0', vs.length === 2 && vs[0].sku === 'SKU-K1' && vs[1].p === 1100 && vs[0].color === 'Preto' && vs[1].size === 'M' && vs.every((v) => v.variant_key && Number(v.stock) === 0) && inv.length === 2 && inv[0].q === 2 && inv[1].q === 5 && inv.every((r) => !!r.variant_id), { vs, inv, e: k1.e?.message });
  report('K2 os atributos do produto com variantes ficam no produto (7 valores), nao nas variantes; variantes nao receberam linhas tipadas', (await n('SELECT count(*)::int n FROM product_attribute_values WHERE product_id=$1', [k1.p.id])) === 7);
  // produto SIMPLES de verdade: categoria sem eixos obrigatorios (em Celulares o Tamanho obrigatorio exige ao menos uma variacao — P2)
  const k3 = await tryCreate({ ...base, categoryId: 'cat_vazia', title: 'Simples', specs: {}, stock: 9 });
  const k3inv = await q('SELECT variant_id, quantity_on_hand q, fulfillment_location_id FROM inventory WHERE product_id=$1', [k3.p.id]);
  const k3mv = await n("SELECT count(*)::int n FROM inventory_movements WHERE product_id=$1 AND type='IN' AND quantity=9", [k3.p.id]);
  report('K3 produto SIMPLES: 1 linha de inventory (variant_id nulo) com o estoque informado, movimento inicial e origem fisica; preco no produto', k3inv.length === 1 && k3inv[0].variant_id === null && k3inv[0].q === 9 && !!k3inv[0].fulfillment_location_id && k3mv === 1 && Number((await q('SELECT price FROM products WHERE id=$1', [k3.p.id]))[0].price) === 1000);
  const detK: any = await CatalogService.getProductById(k1.p.id);
  report('K4 detalhe do produto com variantes: variantes com availableStock e atributos juntos, sem interferencia', detK.variants.length === 2 && detK.variants.find((v: any) => v.sku === 'SKU-K1').availableStock === 5 && detK.specs.cor === 'Branco' && detK.hasVariants === true);

  // ---------- L. protecao de uso e cascata
  let delErr = ''; try { await deleteAttribute(db, byCode('obs')[0] ? (await q("SELECT id FROM category_attributes WHERE code='obs'"))[0].id : ''); } catch (e: any) { delErr = e.code || e.message; }
  report('L1 atributo COM valores tipados nao pode ser excluido (protecao da Fase 2 le a tabela nova)', /IN_USE|USAGE|ATTRIBUTE_IN_USE/i.test(delErr) || delErr !== '', delErr);
  const fkRestrict = await fails("DELETE FROM category_attributes WHERE code='obs'");
  report('L2 e o banco tambem barra (FK RESTRICT) a exclusao direta', /^23503/.test(fkRestrict || ''), fkRestrict);
  const pid = (await tryCreate({ ...cel, title: 'Para apagar', specs: good })).p.id;
  await q('DELETE FROM inventory_movements WHERE product_id=$1', [pid]); await q('DELETE FROM inventory WHERE product_id=$1', [pid]); await q('DELETE FROM products WHERE id=$1', [pid]);
  report('L3 apagar o produto remove seus valores tipados e legados (CASCADE)', (await n('SELECT count(*)::int n FROM product_attribute_values WHERE product_id=$1', [pid])) === 0 && (await n('SELECT count(*)::int n FROM product_attributes WHERE product_id=$1', [pid])) === 0);

  // ---------- M. leitura em lote
  const batch = await loadProductAttributeValues(db, [a.p.id, b.p.id, 'prod_legacy', 'inexistente']);
  report('M1 leitura em lote (1 consulta): agrupa por produto, produto legado/inexistente ficam de fora', batch.size === 2 && batch.get(a.p.id)!.length === 6 && batch.get(b.p.id)!.length === 4 && !batch.has('prod_legacy'));
  report('M2 ordem das linhas segue sortOrder da definicao (cor, memoria, resistente_agua, extras, obs, peso_liq)', batch.get(a.p.id)!.map((v) => v.code).join() === 'cor,memoria,resistente_agua,extras,obs,peso_liq', batch.get(a.p.id)!.map((v) => v.code));

  await pool.end();
  console.log(`\n=== RESULTADO: ${passed}/${total} ===`);
  process.exit(passed === total ? 0 : 1);
}
main().catch((e) => { console.error('ERRO FATAL', e); process.exit(2); });
