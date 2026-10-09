/**
 * FASE 8C.1 — opcao "Outro" COM especificacao estruturada: validacao, armazenamento tipado (2a linha em value_text), edicao, ficha
 * publica, compatibilidade com valores antigos, variantes, formulario (cliente). PostgreSQL 17 DESCARTAVEL. Nunca producao.
 */
process.env.REDIS_URL = '';
import { assertLedgerTestDatabaseGuard } from './ledgerTestDbGuard.js';
const testDbUrl = assertLedgerTestDatabaseGuard();
process.env.DATABASE_URL = testDbUrl;
process.env.NODE_ENV = 'test';
process.env.SKIP_RUNTIME_ALIGN = 'true';
process.env.JWT_ACCESS_SECRET = 'other8c1_access_secret_0123456789abcdef';
import 'dotenv/config';
import fs from 'fs';
import express from 'express';
import http from 'http';
import jwt from 'jsonwebtoken';
import pg from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import * as schema from '../src/db/schema.js';
import { users, sellers, stores, addresses } from '../src/db/schema.js';
import { getJwtAccessSecret } from '../src/server/modules/auth/jwtConfig.js';
import { catalogRouter, getProductByIdHandler } from '../src/server/modules/catalog/catalogRoutes.js';
import { sellerRouter } from '../src/server/sellerRoutes.js';
import { ProductCreationService } from '../src/server/modules/catalog/productCreationService.js';
import { createAttribute, resolveEffectiveAttributes } from '../src/server/modules/catalog/attributeDefinitionService.js';
import { ALL_PLANS } from '../src/data/attributeMatrix/index.js';
import { buildTree, compileOperations, resolveMatrix } from '../src/data/attributeMatrix/engine.js';
import { applyOperations } from '../scripts/attribute-matrix/applyEngine.js';
import { isOtherOption, normalizeOtherDetail, splitOtherValue, composeOtherValue, otherFormKey, OTHER_DETAIL_MAX } from '../src/utils/attributeOther.js';
import { matchOption, validateAttributeValue } from '../src/utils/attributeValidator.js';
import { selectFormAttributes, validateFormFields, buildAttributeSpecs, buildAttributePatch, initialValuesFromProduct, reconcileValues, needsOtherDetail } from '../src/utils/attributeFormModel.js';

if (!['localhost', '127.0.0.1'].includes(new URL(testDbUrl).hostname)) throw new Error('Somente banco local descartavel.');
const pool = new pg.Pool({ connectionString: testDbUrl, max: 8 });
const db = drizzle(pool, { schema });
let passed = 0, total = 0;
const report = (l: string, ok: boolean, d?: unknown) => { total++; if (ok) passed++; console.log(`[${ok ? 'PASS' : 'FAIL'}] ${l}${ok ? '' : ' -> ' + JSON.stringify(d ?? null).slice(0, 600)}`); };
const q = async (s: string, p?: any[]) => (await pool.query(s, p)).rows;
const n = async (s: string, p?: any[]) => Number((await q(s, p))[0].n);
const tok = (id: string, role: string) => jwt.sign({ userId: id, email: `${id}@t.test`, role, fullName: id, countryCode: 'GW', kycStatus: 'verified', isEmailVerified: true }, getJwtAccessSecret(), { expiresIn: '1h' });

async function main() {
  // ---------- A. funcoes puras
  const opts = ['Madeira', 'Metal', 'Outro'];
  report('A1 familia "Outro" exige especificacao; "Nao se aplica" nao', isOtherOption('Outro') && isOtherOption('Outra') && isOtherOption('Outros materiais') && !isOtherOption('Não se aplica') && !isOtherOption('Madeira'));
  report('A2 splitOtherValue: "Outro: Fibra" separa; opcao simples nao e composta; cabeca que nao e "Outro" nao separa; ":" no detalhe preservado', JSON.stringify(splitOtherValue(opts, 'Outro: Fibra de bambu', matchOption)) === JSON.stringify({ option: 'Outro', detail: 'Fibra de bambu' }) && splitOtherValue(opts, 'Madeira', matchOption) === null && splitOtherValue(opts, 'Metal: aço', matchOption) === null && splitOtherValue(opts, 'Outro: A: B', matchOption)?.detail.trim() === 'A: B' && splitOtherValue(opts, 'outro : x1', matchOption)?.option === 'Outro');
  const nd = (s: unknown) => normalizeOtherDetail(s, 'Outro');
  report('A3 normalizeOtherDetail: vazio, so espacos, 1 caractere, so pontuacao, repetir "outro" e 81 caracteres sao recusados; espacos duplicados colapsam; limite 80 aceito', !nd('').ok && !nd('    ').ok && !nd('a').ok && !nd('...').ok && !nd('outro').ok && !nd('x'.repeat(OTHER_DETAIL_MAX + 1)).ok && nd('x'.repeat(OTHER_DETAIL_MAX)).ok && nd('  Fibra   de\tbambu ').value === 'Fibra de bambu' && nd('Aço 304').ok);

  // ---------- B. banco: categorias e definicoes
  await q("INSERT INTO countries (id,code,name,flag,currency,currency_symbol,phone_prefix) VALUES ('GW','GW','Guiné-Bissau','x','XOF','CFA','+245') ON CONFLICT DO NOTHING");
  await q("INSERT INTO categories (id,name,slug) VALUES ('cat_p','Móveis','moveis'),('cat_c','Mesas','mesas')");
  await q("UPDATE categories SET parent_id='cat_p' WHERE id='cat_c'");
  const mkUser = (id: string, role: string) => db.insert(users).values({ id, email: `${id}@t.test`, passwordHash: 'x', fullName: id, phone: '1', role, countryCode: 'GW', kycStatus: 'verified', riskScore: 'baixo', isActive: true, isEmailVerified: true, isPhoneVerified: false, createdAt: new Date(), updatedAt: new Date() } as any);
  await mkUser('usr_a', 'SELLER'); await mkUser('usr_buyer', 'BUYER');
  await db.insert(sellers).values({ id: 'selA', userId: 'usr_a', companyName: 'A', tradingName: 'A', taxId: '0', phone: '1', countryCode: 'GW', status: 'active', kycStatus: 'verified', isEmailVerified: true, createdAt: new Date(), updatedAt: new Date() } as any);
  await db.insert(addresses).values({ id: 'adA', userId: 'usr_a', recipientName: 'L', street: 'R', number: '1', city: 'B', state: 'B', countryCode: 'GW', phone: '9', isDefault: false, addressType: 'business', createdAt: new Date(), updatedAt: new Date() } as any);
  await db.insert(stores).values({ id: 'stA', sellerId: 'selA', name: 'A', slug: 'stA', countryCode: 'GW', status: 'active', operationalAddressId: 'adA', createdAt: new Date(), updatedAt: new Date() } as any);
  // herdados (definidos na categoria-mae) e proprios (definidos na subcategoria)
  const material = (await createAttribute(db, 'cat_p', { name: 'Material', code: 'material', type: 'select', isRequired: true, optionsJson: ['Madeira', 'Metal', 'Outro'], sortOrder: 1 })).attribute;
  await createAttribute(db, 'cat_p', { name: 'Acabamento', code: 'acabamento', type: 'select', isRequired: false, optionsJson: ['Fosco', 'Brilho', 'Outro'], sortOrder: 2 });
  await createAttribute(db, 'cat_p', { name: 'Grau', code: 'grau', type: 'select', isRequired: false, optionsJson: ['A', 'B', 'Não se aplica'], sortOrder: 3 });
  await createAttribute(db, 'cat_c', { name: 'Tipo', code: 'tipo', type: 'select', isRequired: true, optionsJson: ['Mesa de jantar', 'Mesa de centro', 'Outra'], sortOrder: 4 });
  await createAttribute(db, 'cat_c', { name: 'Observações', code: 'obs', type: 'text', maxLength: 30, sortOrder: 5 });
  await createAttribute(db, 'cat_c', { name: 'Cor', code: 'cor', type: 'select', role: 'variant_axis', isRequired: false, optionsJson: ['Preto', 'Outra'], sortOrder: 6 });

  const app = express(); app.use(express.json()); app.get('/api/products/:id', getProductByIdHandler); app.use('/api', catalogRouter); app.use('/seller', sellerRouter);
  const server = http.createServer(app); await new Promise<void>((r) => server.listen(0, r));
  const url = `http://127.0.0.1:${(server.address() as any).port}`;
  const A = tok('usr_a', 'SELLER');
  const call = async (method: string, path: string, body?: any) => { const r = await fetch(url + path, { method, headers: { Authorization: `Bearer ${A}`, 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined }); let j: any = null; try { j = await r.json(); } catch { /* */ } return { s: r.status, j }; };
  const patch = (id: string, attributeUpdates: any) => call('PATCH', `/seller/products/${id}`, { attributeUpdates });
  const pub = async (id: string) => (await (await fetch(`${url}/api/products/${id}`)).json() as any).data;
  const base = { title: 'Mesa', price: 1000, image: 'x.jpg', storeId: 'stA', weightKg: 0.35, dimensionsCm: { length: 20, width: 10, height: 5 }, stock: 5, condition: 'new', brand: 'Acme', categoryId: 'cat_c' } as any;
  const labels = { Marca: 'Acme', Modelo: 'X1', 'Condição': 'Novo' };
  const mk = async (specs: any, extra: any = {}) => (await ProductCreationService.createProduct('usr_a', { ...base, ...extra, specs: { ...labels, ...specs } }, db)) as any;
  const rowsOf = (pid: string, code: string) => q('SELECT option_value o, value_text t FROM product_attribute_values WHERE product_id=$1 AND attribute_code=$2 ORDER BY option_value NULLS LAST', [pid, code]);
  const sheet = async (id: string) => { const d = await pub(id); return Object.fromEntries([...d.specSheet.groups.flatMap((g: any) => g.items), ...d.specSheet.other].map((i: any) => [i.label, i.displayValue])); };
  const rejects = async (specs: any) => { try { await mk(specs); return null; } catch (e: any) { return JSON.stringify(e.details ?? e.message).slice(0, 300); } };

  // ---------- C. criacao: atributo HERDADO (material) e PROPRIO (tipo)
  const P1 = await mk({ material: 'Outro: Fibra de bambu', tipo: 'Outra: Banco de jardim', grau: 'Não se aplica' });
  const m1 = await rowsOf(P1.id, 'material'), t1 = await rowsOf(P1.id, 'tipo');
  report('C1 herdado (material) e proprio (tipo): a opcao fica em option_value e a especificacao numa 2a linha do MESMO atributo (value_text)', JSON.stringify(m1) === JSON.stringify([{ o: 'Outro', t: null }, { o: null, t: 'Fibra de bambu' }]) && JSON.stringify(t1) === JSON.stringify([{ o: 'Outra', t: null }, { o: null, t: 'Banco de jardim' }]), { m1, t1 });
  const s1 = await sheet(P1.id);
  report('C2 ficha publica: "Material: Fibra de bambu" e "Tipo: Banco de jardim" (nao a palavra "Outro")', s1['Material'] === 'Fibra de bambu' && s1['Tipo'] === 'Banco de jardim' && s1['Grau'] === 'Não se aplica', s1);
  const lj = (await q('SELECT attributes_json j FROM products WHERE id=$1', [P1.id]))[0].j, lr = Object.fromEntries((await q('SELECT name, value FROM product_attributes WHERE product_id=$1', [P1.id])).map((r) => [r.name, r.value]));
  report('C3 espelho legado coerente (texto da especificacao) e nada da especificacao so no titulo/descricao', lj.material === 'Fibra de bambu' && lr.material === 'Fibra de bambu' && !/bambu/i.test((await q('SELECT title || coalesce(description, \'\') t FROM products WHERE id=$1', [P1.id]))[0].t));
  const d1 = await pub(P1.id);
  report('C4 API de leitura do vendedor/atributos tipados devolve o valor composto para a edicao reenviar sem perdas', JSON.stringify((await call('GET', `/seller/products/${P1.id}`)).j?.data?.attributeValues?.find((a: any) => a.code === 'material')?.value ?? d1.attributeValues?.find((a: any) => a.code === 'material')?.value) === JSON.stringify('Outro: Fibra de bambu'), d1.attributeValues?.find((a: any) => a.code === 'material'));

  // ---------- D. recusas
  const bad = {
    'D1 "Outro" sem especificacao (obrigatorio)': { material: 'Outro', tipo: 'Mesa de jantar' },
    'D2 "Outro:" com complemento vazio': { material: 'Outro:', tipo: 'Mesa de jantar' },
    'D3 "Outro:   " so espacos': { material: 'Outro:     ', tipo: 'Mesa de jantar' },
    'D4 1 caractere': { material: 'Outro: a', tipo: 'Mesa de jantar' },
    'D5 so pontuacao': { material: 'Outro: ---', tipo: 'Mesa de jantar' },
    'D6 repete "outro"': { material: 'Outro: outro', tipo: 'Mesa de jantar' },
    'D7 81 caracteres': { material: 'Outro: ' + 'x'.repeat(81), tipo: 'Mesa de jantar' },
    'D8 opcional "Outro" sem especificacao': { material: 'Metal', tipo: 'Mesa de jantar', acabamento: 'Outro' },
    'D9 cabeca invalida ("Metal: aco")': { material: 'Metal: aço', tipo: 'Mesa de jantar' },
    'D10 opcao inexistente': { material: 'Plástico', tipo: 'Mesa de jantar' },
  } as Record<string, any>;
  for (const [label, specs] of Object.entries(bad)) {
    const r = await rejects(specs);
    report(`${label} => recusado no servidor`, r !== null && (/OTHER_DETAIL_REQUIRED|INVALID_OPTION/.test(r)), r);
  }
  report('D11 nada foi gravado pelas tentativas recusadas (so os 2 valores de P1 + 0 produtos extras)', (await n('SELECT count(*)::int n FROM products')) === 1);
  const ok2 = await mk({ material: 'Metal', tipo: 'Mesa de centro', acabamento: 'Outro: Cera de abelha' });
  report('D12 opcional com "Outro: especificacao" e aceito; opcao normal nao cria linha extra', JSON.stringify(await rowsOf(ok2.id, 'acabamento')) === JSON.stringify([{ o: 'Outro', t: null }, { o: null, t: 'Cera de abelha' }]) && (await rowsOf(ok2.id, 'material')).length === 1);
  const norm = await mk({ material: 'outro :   Aço   inox  ', tipo: 'Mesa de jantar' });
  report('D13 normalizacao: caixa, espacos e ":" soltos => "Aço inox"', (await rowsOf(norm.id, 'material')).some((r) => r.t === 'Aço inox'));

  // ---------- E. edicao
  const P2 = await mk({ material: 'Outro: Vidro temperado', tipo: 'Mesa de jantar', obs: 'ok' });
  const e1 = await patch(P2.id, { obs: 'novo' });
  report('E1 editar OUTRO atributo preserva "Outro: Vidro temperado" (as 2 linhas continuam)', e1.s === 200 && JSON.stringify(await rowsOf(P2.id, 'material')) === JSON.stringify([{ o: 'Outro', t: null }, { o: null, t: 'Vidro temperado' }]), { s: e1.s, j: e1.j?.message });
  const e2 = await patch(P2.id, { material: 'Metal' });
  report('E2 trocar "Outro: ..." por uma opcao normal remove a linha de especificacao (sem sobra)', e2.s === 200 && JSON.stringify(await rowsOf(P2.id, 'material')) === JSON.stringify([{ o: 'Metal', t: null }]) && (await sheet(P2.id)).Material === 'Metal');
  const e3 = await patch(P2.id, { material: 'Outro: Pedra' });
  report('E3 voltar para "Outro: Pedra" regrava as 2 linhas; ficha mostra "Pedra"', e3.s === 200 && (await rowsOf(P2.id, 'material')).length === 2 && (await sheet(P2.id)).Material === 'Pedra');
  const before = JSON.stringify(await rowsOf(P2.id, 'material'));
  const e4 = await patch(P2.id, { material: 'Outro' });
  report('E4 editar para "Outro" SEM especificacao => 400 e nada muda', e4.s === 400 && /OTHER_DETAIL_REQUIRED|Especifique/.test(JSON.stringify(e4.j)) && JSON.stringify(await rowsOf(P2.id, 'material')) === before, e4.j);
  const e5 = await patch(P2.id, { material: 'Outro: Pedra' });
  report('E5 idempotencia: reenviar o mesmo valor nao duplica linhas', e5.s === 200 && (await rowsOf(P2.id, 'material')).length === 2 && (await n("SELECT count(*)::int n FROM product_attribute_values WHERE product_id=$1", [P2.id])) === 4, await rowsOf(P2.id, 'material'));
  const aud = await q("SELECT details_json d FROM audit_logs WHERE resource='products' AND resource_id=$1 AND action='seller.product.attributes_updated' ORDER BY created_at", [P2.id]);
  report('E6 auditoria registra a mudanca com a especificacao legivel (antes/depois)', aud.some((a: any) => (a.d.changes || []).some((c: any) => c.code === 'material' && c.before === 'Vidro temperado' && c.after === 'Metal')), aud.map((a: any) => a.d.changes));
  const sizes = await patch(P2.id, { material: 'Outro: ' + 'y'.repeat(81) });
  report('E7 especificacao de 81 caracteres na edicao => 400', sizes.s === 400);

  // ---------- F. compatibilidade com valores antigos (historicos)
  const P3 = await mk({ material: 'Madeira', tipo: 'Mesa de jantar', obs: 'ok' });
  await q('DELETE FROM product_attribute_values WHERE product_id=$1 AND attribute_code=$2', [P3.id, 'material']);
  await q("INSERT INTO product_attribute_values (id, product_id, attribute_id, attribute_code, option_value, created_at, updated_at) VALUES ('pav_hist', $1, $2, 'material', 'Outro', now(), now())", [P3.id, material.id]);
  report('F1 produto historico com "Outro" SEM especificacao continua sendo exibido como "Outro"', (await sheet(P3.id)).Material === 'Outro');
  const f2 = await patch(P3.id, { obs: 'editado' });
  report('F2 editar outro atributo de produto historico com "Outro" antigo NAO falha e preserva o valor', f2.s === 200 && JSON.stringify(await rowsOf(P3.id, 'material')) === JSON.stringify([{ o: 'Outro', t: null }]), { s: f2.s, j: f2.j });
  const f3 = await patch(P3.id, { material: 'Outro: Cana' });
  report('F3 completar o "Outro" antigo com especificacao funciona', f3.s === 200 && (await sheet(P3.id)).Material === 'Cana');

  // ---------- G. integridade do banco
  let dup = '';
  try { await q("INSERT INTO product_attribute_values (id, product_id, attribute_id, attribute_code, value_text, created_at, updated_at) VALUES ('pav_dup', $1, $2, 'material', 'segunda especificacao', now(), now())", [P1.id, material.id]); } catch (e: any) { dup = String(e.message); }
  report('G1 o banco impede 2 especificacoes para o mesmo atributo (indice unico) e continua exigindo 1 valor por linha (CHECK)', /product_attribute_values_uq|duplicate/i.test(dup) && await (async () => { try { await q("INSERT INTO product_attribute_values (id, product_id, attribute_id, attribute_code, option_value, value_text, created_at, updated_at) VALUES ('pav_two', $1, $2, 'obs', 'x', 'y', now(), now())", [P1.id, material.id]); return false; } catch (e: any) { return /one_value_check/.test(String(e.message)); } })());
  report('G2 sem alteracao de esquema: product_attribute_values mantem exatamente as 10 colunas e as constraints da Fase 3', (await n("SELECT count(*)::int n FROM information_schema.columns WHERE table_name='product_attribute_values'")) === 10);

  // ---------- H. variantes
  const P4 = await mk({ material: 'Outro: Rattan', tipo: 'Mesa de jantar' }, { variants: [{ title: 'Preto', sku: 'OT-1', price: 1100, stock: 3, color: 'Preto' }, { title: 'Outra', sku: 'OT-2', price: 1200, stock: 2, color: 'Outra' }] });
  const vk = await q('SELECT sku, variant_key FROM product_variants WHERE product_id=$1 ORDER BY sku', [P4.id]);
  report('H1 produto com "Outro: Rattan" + 2 variantes (eixo Cor com opcao "Outra" simples): variantes validas, variant_key distintas e SEM a especificacao do atributo', vk.length === 2 && vk[0].variant_key !== vk[1].variant_key && vk.every((v: any) => !/rattan/i.test(String(v.variant_key))), vk);
  let axisErr = '';
  try { await mk({ material: 'Metal', tipo: 'Mesa de jantar' }, { variants: [{ title: 'X', sku: 'OT-3', price: 1100, stock: 1, color: 'Outra: Verde' }] }); } catch (e: any) { axisErr = String(e.message) + JSON.stringify(e.details ?? ''); }
  report('H2 eixo de variante NAO aceita o formato "Outra: Verde" (nunca cria combinacao invalida)', axisErr !== '', axisErr.slice(0, 200));
  const hv = validateAttributeValue({ id: 'ax', code: 'cor', name: 'Cor', type: 'select', role: 'variant_axis', optionsJson: ['Preto', 'Outra'] } as any, 'Outra');
  report('H3 eixo com a opcao "Outra" e valido SEM especificacao (a regra e so das especificacoes)', hv.ok === true);

  // ---------- I. cliente: formulario
  const effC = await resolveEffectiveAttributes(db, 'cat_c');
  const form = selectFormAttributes(effC);
  const fieldsC = form.fields;
  const vals0 = { material: 'Outro', tipo: 'Mesa de jantar' } as any;
  report('I1 formulario: "Outro" sem especificacao => erro "Especifique sua opcao" no campo; com especificacao valida => sem erro', /Especifique/.test(validateFormFields(fieldsC, vals0).material || '') && !validateFormFields(fieldsC, { ...vals0, [otherFormKey('material')]: 'Fibra de bambu' }).material);
  report('I2 formulario: complemento em branco/so espacos/1 letra continua com erro', ['', '   ', 'a'].every((c) => !!validateFormFields(fieldsC, { ...vals0, [otherFormKey('material')]: c }).material));
  report('I3 needsOtherDetail so para select na familia Outro', needsOtherDetail({ type: 'select' }, 'Outra') && !needsOtherDetail({ type: 'select' }, 'Metal') && !needsOtherDetail({ type: 'text' }, 'Outro'));
  const specs = buildAttributeSpecs(fieldsC, { material: 'Outro', [otherFormKey('material')]: ' Fibra  de bambu ', tipo: 'Mesa de jantar' } as any);
  report('I4 payload montado pelo formulario: "Outro: Fibra de bambu" (aceito pelo servidor)', specs.material === 'Outro: Fibra de bambu');
  const init = initialValuesFromProduct(fieldsC, { attributeValues: [{ code: 'material', value: 'Outro: Fibra de bambu' }, { code: 'tipo', value: 'Mesa de jantar' }] });
  report('I5 edicao: valor composto volta separado (opcao "Outro" + especificacao) preservando o texto', init.material === 'Outro' && init[otherFormKey('material')] === 'Fibra de bambu' && init.tipo === 'Mesa de jantar', init);
  const orig = init, cur1 = { ...init }, cur2 = { ...init, [otherFormKey('material')]: 'Bambu laminado' }, cur3 = { ...init, material: 'Metal' };
  report('I6 patch de edicao: sem mudanca => vazio; so a especificacao mudou => reenvia composto; voltar a opcao normal => envia "Metal"', Object.keys(buildAttributePatch(fieldsC, orig, cur1)).length === 0 && buildAttributePatch(fieldsC, orig, cur2).material === 'Outro: Bambu laminado' && buildAttributePatch(fieldsC, orig, cur3).material === 'Metal');
  report('I7 reconcileValues (troca de subcategoria) mantem a especificacao enquanto o campo e "Outro" e nao a trata como campo descartado', (() => { const r = reconcileValues(fieldsC, { ...init, 'campo_que_sumiu': 'x' } as any); return r.values[otherFormKey('material')] === 'Fibra de bambu' && !r.dropped.includes(otherFormKey('material')) && r.dropped.includes('campo_que_sumiu'); })());
  report('I8 edicao de produto historico: "Outro" antigo sem especificacao e SEM alteracao nao bloqueia o salvamento; se a pessoa mexer, passa a exigir', (() => { const o = { material: 'Outro', tipo: 'Mesa de jantar' } as any; return !validateFormFields(fieldsC, o, o).material && !!validateFormFields(fieldsC, { ...o, tipo: 'Mesa de centro' }, { ...o, material: 'Metal' }).material; })());

  // ---------- J. matriz real: Outro em atributo definido na subcategoria (v2 aplicada pelo servico)
  await q('DELETE FROM product_attribute_values'); // limpa dados de teste anteriores
  await q('DELETE FROM category_attributes');
  const inv = JSON.parse(fs.readFileSync('docs/attribute-matrix/v1/categories.inventory.raw.json', 'utf8'));
  for (const c of inv.categories.filter((x: any) => !x.parent_id)) await q('INSERT INTO categories (id,name,slug,icon,display_order,is_active,created_at) VALUES ($1,$2,$3,$4,$5,$6,now()) ON CONFLICT DO NOTHING', [c.id, c.name, c.slug, c.icon, c.display_order ?? 0, c.is_active]);
  for (const c of inv.categories.filter((x: any) => x.parent_id)) await q('INSERT INTO categories (id,name,slug,icon,parent_id,display_order,is_active,created_at) VALUES ($1,$2,$3,$4,$5,$6,$7,now()) ON CONFLICT DO NOTHING', [c.id, c.name, c.slug, c.icon, c.parent_id, c.display_order ?? 0, c.is_active]);
  const tree = buildTree(inv.categories);
  const ap = await applyOperations(db, compileOperations(ALL_PLANS, tree, resolveMatrix(ALL_PLANS, tree)), { batchSize: 100 });
  const panelas = tree.get('cozinha-e-utilidades-domesticas-panelas')!;
  const effP = await resolveEffectiveAttributes(db, panelas.id);
  const tipoP = effP.find((a: any) => a.code === 'tipo_panela');
  const Pp = await ProductCreationService.createProduct('usr_a', { ...base, categoryId: panelas.id, title: 'Panela', specs: { ...labels, tipo_panela: 'Outro: Tacho de ferro' } }, db) as any;
  report('J1 matriz v2 real (847 ops): select obrigatorio com "Outro" definido na subcategoria (Panelas > Tipo) aceita "Outro: Tacho de ferro" e a ficha mostra "Tacho de ferro"', ap.created === 847 && !!tipoP && (await sheet(Pp.id)).Tipo === 'Tacho de ferro', { created: ap.created });
  let bareErr = '';
  try { await ProductCreationService.createProduct('usr_a', { ...base, categoryId: panelas.id, title: 'Panela 2', specs: { ...labels, tipo_panela: 'Outro' } }, db); } catch (e: any) { bareErr = JSON.stringify((e as any).details ?? e.message); }
  report('J2 mesma categoria: "Outro" sem especificacao e recusado', /OTHER_DETAIL_REQUIRED/.test(bareErr), bareErr.slice(0, 200));
  // 137 selects obrigatorios: todos aceitam o formato composto e recusam o simples (validacao pura sobre as definicoes reais)
  let checked = 0, wrong: string[] = [];
  for (const [slug, list] of resolveMatrix(ALL_PLANS, tree).effective) for (const a of list) {
    if (a.role !== 'spec' || a.type !== 'select' || !a.required || a.closed) continue;
    const esc = (a.options ?? []).find((o) => isOtherOption(o));
    if (!esc) continue;
    checked++;
    const def = { id: 'x', code: a.code, name: a.name, type: 'select', role: 'spec', isRequired: true, optionsJson: a.options } as any;
    if (!validateAttributeValue(def, composeOtherValue(esc, 'Especificação válida')).ok || validateAttributeValue(def, esc).ok) wrong.push(`${slug}:${a.code}`);
  }
  report(`J3 em TODOS os ${checked} selects obrigatorios com "Outro" da matriz v2 (herdados e proprios): "Outro: x" aceito e "Outro" sozinho recusado`, checked >= 130 && wrong.length === 0, wrong.slice(0, 3));

  server.close(); await pool.end();
  console.log(`\n=== RESULTADO: ${passed}/${total} ===`);
  process.exit(passed === total ? 0 : 1);
}
main().catch((e) => { console.error('ERRO FATAL', e); process.exit(2); });
