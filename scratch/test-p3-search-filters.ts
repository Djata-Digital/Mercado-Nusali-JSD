/**
 * P3 (pos-matriz v2) — BUSCA E FILTROS POR CARACTERISTICA no backend real (Postgres 17 DESCARTAVEL): filtros por categoria (arvore),
 * atributos herdados/substituidos/desativados, tipos (selecao, multipla, Sim/Nao, intervalo), combinacao com preco/marca/condicao/texto,
 * pesquisa textual com valores de atributos, facets (so opcoes com resultado), paginacao estavel, atributos inativos e sem resultados.
 * Nunca producao.
 */
process.env.REDIS_URL = '';
import { assertLedgerTestDatabaseGuard } from './ledgerTestDbGuard.js';
const testDbUrl = assertLedgerTestDatabaseGuard();
process.env.DATABASE_URL = testDbUrl;
process.env.NODE_ENV = 'test';
process.env.SKIP_RUNTIME_ALIGN = 'true';
import 'dotenv/config';
import pg from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import * as schema from '../src/db/schema.js';
import { users, sellers, stores, categories, countries, addresses } from '../src/db/schema.js';
import { ProductCreationService } from '../src/server/modules/catalog/productCreationService.js';
import { createAttribute, disableInheritedAttribute, updateAttribute } from '../src/server/modules/catalog/attributeDefinitionService.js';
import { CatalogService } from '../src/server/modules/catalog/catalogService.js';
import { parseAttributeFilters, serializeAttributeFilters } from '../src/utils/attributeFilters.js';

if (!['localhost', '127.0.0.1'].includes(new URL(testDbUrl).hostname)) throw new Error('Somente banco local descartavel.');
const pool = new pg.Pool({ connectionString: testDbUrl, ssl: { rejectUnauthorized: false }, max: 6 });
const db = drizzle(pool, { schema });
let passed = 0, total = 0;
const report = (l: string, ok: boolean, d?: any) => { total++; if (ok) passed++; console.log(`[${ok ? 'PASS' : 'FAIL'}] ${l}${ok ? '' : ' -> ' + JSON.stringify(d ?? null).slice(0, 700)}`); };
const q = async (s: string, p?: any[]) => (await pool.query(s, p)).rows;
let seq = 0;
const uid = (p: string) => `${p}_p3_${Date.now()}_${++seq}`;

async function main() {
  await db.insert(countries).values([{ id: 'GW', code: 'GW', name: 'Guiné-Bissau', flag: 'x', currency: 'XOF', currencySymbol: 'CFA', phonePrefix: '+245', isActive: true, createdAt: new Date() }] as any).onConflictDoNothing();
  await db.insert(categories).values([
    { id: 'cat_eletro', name: 'Eletrônicos', slug: 'eletronicos', isActive: true, createdAt: new Date() },
    { id: 'cat_cel', name: 'Celulares', slug: 'celulares', parentId: 'cat_eletro', isActive: true, createdAt: new Date() },
    { id: 'cat_tab', name: 'Tablets', slug: 'tablets', parentId: 'cat_eletro', isActive: true, createdAt: new Date() },
    { id: 'cat_cel2', name: 'Telefones simples', slug: 'telefones-simples', parentId: 'cat_eletro', isActive: true, createdAt: new Date() },
    { id: 'cat_casa', name: 'Casa', slug: 'casa', isActive: true, createdAt: new Date() },
    { id: 'cat_inativa', name: 'Inativa', slug: 'inativa', parentId: 'cat_eletro', isActive: false, createdAt: new Date() },
  ] as any);
  // ---- definicoes (matriz de teste): herdada na raiz, propria no Celulares, substituida no Tablets, desativada em Telefones simples
  const conect = (await createAttribute(db, 'cat_eletro', { name: 'Conectividade', code: 'conectividade', type: 'multiselect', isFilterable: true, optionsJson: ['Wi-Fi', 'Bluetooth', '5G'], sortOrder: 5 })).attribute;
  await createAttribute(db, 'cat_cel', { name: 'Sistema', code: 'sistema', type: 'select', isFilterable: true, optionsJson: ['Android', 'iOS'], sortOrder: 1 });
  await createAttribute(db, 'cat_cel', { name: 'Memória RAM', code: 'memoria_ram', type: 'number', isFilterable: true, unit: 'GB', decimals: 0, minValue: 0, maxValue: 1024, sortOrder: 2 });
  await createAttribute(db, 'cat_cel', { name: 'Resistente à água', code: 'resistente_agua', type: 'boolean', isFilterable: true, sortOrder: 3 });
  await createAttribute(db, 'cat_cel', { name: 'Observações', code: 'obs', type: 'text', maxLength: 50, sortOrder: 4 });
  await createAttribute(db, 'cat_cel', { name: 'Fornecedor interno', code: 'interno', type: 'select', isFilterable: false, optionsJson: ['X', 'Y'], sortOrder: 6 });
  const bateria = (await createAttribute(db, 'cat_cel', { name: 'Bateria', code: 'bateria', type: 'number', isFilterable: true, unit: 'mAh', decimals: 0, minValue: 0, maxValue: 99999, sortOrder: 7 })).attribute;
  await createAttribute(db, 'cat_tab', { name: 'Conectividade', code: 'conectividade', type: 'multiselect', isFilterable: true, optionsJson: ['Wi-Fi', '4G'], overridesId: conect.id, sortOrder: 5 });
  await disableInheritedAttribute(db, 'cat_cel2', conect.id);

  const mkUser = async (id: string) => db.insert(users).values({ id, email: `${id}@t.test`, passwordHash: 'x', fullName: id, phone: '1', role: 'SELLER', countryCode: 'GW', kycStatus: 'verified', riskScore: 'baixo', isActive: true, isEmailVerified: true, isPhoneVerified: false, createdAt: new Date(), updatedAt: new Date() } as any);
  const sellerUser = uid('usr'); await mkUser(sellerUser);
  const sellerId = uid('sel');
  await db.insert(sellers).values({ id: sellerId, userId: sellerUser, companyName: 'S', tradingName: 'S', taxId: '0', phone: '1', countryCode: 'GW', status: 'active', kycStatus: 'verified', isEmailVerified: true, createdAt: new Date(), updatedAt: new Date() } as any);
  const addr = uid('addr');
  await db.insert(addresses).values({ id: addr, userId: sellerUser, recipientName: 'L', street: 'R', number: '1', city: 'Bissau', state: 'Bissau', countryCode: 'GW', phone: '9', isDefault: false, addressType: 'business', createdAt: new Date(), updatedAt: new Date() } as any);
  const storeId = uid('store');
  await db.insert(stores).values({ id: storeId, sellerId, name: 'Loja', slug: `loja-${storeId}`, countryCode: 'GW', status: 'active', operationalAddressId: addr, createdAt: new Date(), updatedAt: new Date() } as any);
  const common = { image: 'x.jpg', storeId, weightKg: 0.3, dimensionsCm: { length: 5, width: 5, height: 5 }, stock: 5 } as any;
  const mk = async (o: any) => { const r: any = await ProductCreationService.createProduct(sellerUser, { ...common, ...o }, db); return r.id as string; };

  const A = await mk({ title: 'Celular Alpha', brand: 'Acme', price: 1000, condition: 'new', categoryId: 'cat_cel', description: 'tela grande e bonita', specs: { sistema: 'Android', memoria_ram: 8, resistente_agua: true, conectividade: ['Wi-Fi', '5G'], bateria: 4000, obs: 'lacrado' } });
  const B = await mk({ title: 'Celular Beta', brand: 'Beta', price: 2000, condition: 'new', categoryId: 'cat_cel', description: 'camara excelente', specs: { sistema: 'iOS', memoria_ram: 4, resistente_agua: false, conectividade: ['Bluetooth'], bateria: 3000 } });
  const C = await mk({ title: 'Celular Gama', brand: 'Acme', price: 500, condition: 'used', categoryId: 'cat_cel', description: 'usado em bom estado', specs: { sistema: 'Android', memoria_ram: 16, resistente_agua: true, conectividade: ['Wi-Fi'], bateria: 5000 } });
  const D = await mk({ title: 'Caixa Bluetooth', brand: 'Som', price: 300, condition: 'new', categoryId: 'cat_cel', description: 'caixa de som portatil', specs: { sistema: 'Android', memoria_ram: 2, resistente_agua: true } });
  const T = await mk({ title: 'Tablet Delta', brand: 'Acme', price: 1500, condition: 'new', categoryId: 'cat_tab', description: 'tablet', specs: { conectividade: ['Wi-Fi', '4G'] } });
  const S2 = await mk({ title: 'Telefone Simples', brand: 'Acme', price: 100, condition: 'new', categoryId: 'cat_cel2', description: 'basico', specs: {} });
  const H = await mk({ title: 'Cadeira Casa', brand: 'Acme', price: 90, condition: 'new', categoryId: 'cat_casa', description: 'sala', specs: {} });
  const CAM = await mk({ title: 'Câmera Digital', brand: 'Foto', price: 800, condition: 'new', categoryId: 'cat_cel', description: 'fotos', specs: { sistema: 'Android', memoria_ram: 6, resistente_agua: false } });
  // valor orfao: produto de "Telefones simples" (conectividade desativada la) com uma linha de valor da definicao da raiz
  await q(`INSERT INTO product_attribute_values (id, product_id, attribute_id, attribute_code, option_value) VALUES ($1,$2,$3,'conectividade','Wi-Fi')`, [uid('pav'), S2, conect.id]);

  const L = async (f: any) => (await CatalogService.getProducts({ limit: 100, ...f }, db)).products.map((p: any) => p.id) as string[];
  const set = (ids: string[]) => ids.slice().sort().join();
  const eq = (ids: string[], want: string[]) => set(ids) === set(want);

  // ---- A. categoria
  report('A1 categoryTree = departamento: inclui as descendentes ativas (Celulares, Tablets, Telefones simples) e NAO outro departamento', eq(await L({ categoryTree: 'cat_eletro' }), [A, B, C, D, T, S2, CAM]), await L({ categoryTree: 'cat_eletro' }));
  report('A2 categoryTree aceita o slug e a subcategoria final (so os produtos dela)', eq(await L({ categoryTree: 'celulares' }), [A, B, C, D, CAM]) && eq(await L({ categoryTree: 'tablets' }), [T]));
  report('A3 categoria desconhecida ou inativa => NENHUM produto (nunca cai no catalogo inteiro)', (await L({ categoryTree: 'nao-existe' })).length === 0 && (await L({ categoryTree: 'cat_inativa' })).length === 0);
  report('A4 o filtro "category" exato de sempre segue igual (so a propria categoria)', eq(await L({ category: 'cat_eletro' }), []) && eq(await L({ category: 'cat_cel' }), [A, B, C, D, CAM]));

  // ---- B. tipos de filtro
  const attrs = (o: any) => parseAttributeFilters(o).filters;
  report('B1 selecao: sistema = Android => A, C, D, CAM; varias opcoes = OU (Android ou iOS => todos os celulares)', eq(await L({ categoryTree: 'cat_cel', attrs: attrs({ sistema: ['Android'] }) }), [A, C, D, CAM]) && eq(await L({ categoryTree: 'cat_cel', attrs: attrs({ sistema: ['Android', 'iOS'] }) }), [A, B, C, D, CAM]));
  report('B2 multipla selecao herdada da raiz: conectividade Wi-Fi em Celulares => A, C', eq(await L({ categoryTree: 'cat_cel', attrs: attrs({ conectividade: ['Wi-Fi'] }) }), [A, C]));
  report('B3 Sim/Nao: resistente_agua = true => A, C, D; false => B, CAM', eq(await L({ categoryTree: 'cat_cel', attrs: attrs({ resistente_agua: true }) }), [A, C, D]) && eq(await L({ categoryTree: 'cat_cel', attrs: attrs({ resistente_agua: false }) }), [B, CAM]));
  report('B4 numero: memoria_ram >= 8 => A, C; <= 4 => B, D; entre 5 e 10 => A, CAM; so max/so min funcionam', eq(await L({ categoryTree: 'cat_cel', attrs: attrs({ memoria_ram: { min: 8 } }) }), [A, C]) && eq(await L({ categoryTree: 'cat_cel', attrs: attrs({ memoria_ram: { max: 4 } }) }), [B, D]) && eq(await L({ categoryTree: 'cat_cel', attrs: attrs({ memoria_ram: { min: 5, max: 10 } }) }), [A, CAM]));
  report('B5 E entre atributos: Android + agua + RAM >= 8 => A, C', eq(await L({ categoryTree: 'cat_cel', attrs: attrs({ sistema: ['Android'], resistente_agua: true, memoria_ram: { min: 8 } }) }), [A, C]));
  report('B6 heranca + substituicao: no departamento, conectividade Wi-Fi acha Celulares (definicao da raiz) E Tablet (definicao substituida)', eq(await L({ categoryTree: 'cat_eletro', attrs: attrs({ conectividade: ['Wi-Fi'] }) }), [A, C, T]), await L({ categoryTree: 'cat_eletro', attrs: attrs({ conectividade: ['Wi-Fi'] }) }));
  report('B7 a opcao so da definicao substituida (4G) acha so o Tablet; a da raiz (5G) so os Celulares', eq(await L({ categoryTree: 'cat_eletro', attrs: attrs({ conectividade: ['4G'] }) }), [T]) && eq(await L({ categoryTree: 'cat_eletro', attrs: attrs({ conectividade: ['5G'] }) }), [A]));
  report('B8 DESATIVADA na subcategoria: o valor orfao do produto de "Telefones simples" (conectividade Wi-Fi) NAO entra no filtro', !(await L({ categoryTree: 'cat_eletro', attrs: attrs({ conectividade: ['Wi-Fi'] }) })).includes(S2));
  report('B9 filtro sem resultado: Android + iOS + RAM >= 100 => lista vazia (sem erro)', (await L({ categoryTree: 'cat_cel', attrs: attrs({ memoria_ram: { min: 100 } }) })).length === 0);

  // ---- C. atributos que NAO valem
  const r1 = await CatalogService.getProducts({ limit: 100, categoryTree: 'cat_cel', attrs: attrs({ interno: ['X'], obs: ['lacrado'], inexistente: ['a'] }) }, db);
  report('C1 atributo NAO filtravel, texto ou inexistente e ignorado: a lista nao esvazia (5 celulares)', r1.products.length === 5, r1.products.length);
  await updateAttribute(db, bateria.id, { isActive: false });
  report('C2 atributo INATIVO deixa de filtrar (ignorado) e some dos facets', (await L({ categoryTree: 'cat_cel', attrs: attrs({ bateria: { min: 4500 } }) })).length === 5 && !(await CatalogService.getFacets({ categoryTree: 'cat_cel' }, db)).attributes.some((a) => a.code === 'bateria'));
  report('C3 sem categoria (categoryTree) os filtros por caracteristica sao ignorados (so a pesquisa/outros filtros valem)', (await L({ attrs: attrs({ sistema: ['iOS'] }) })).length === 8);
  report('C4 parametro attrs malformado/gigante nao quebra: JSON invalido, tipo errado, codigo invalido, excesso', parseAttributeFilters('{nao json').errors.length === 1 && Object.keys(parseAttributeFilters('[1,2]').filters).length === 0 && parseAttributeFilters({ 'Bad Code!': ['a'] }).errors.length === 1 && Object.keys(parseAttributeFilters(Object.fromEntries(Array.from({ length: 30 }, (_, i) => [`a${i}`, ['x']]))).filters).length === 12 && parseAttributeFilters({ x: { min: 5, max: 1 } }).errors.length === 1);
  report('C5 serializacao canonica: mesma busca => mesma string (ordem das chaves/opcoes irrelevante) e vazio => undefined', serializeAttributeFilters({ b: ['y', 'x'], a: true }) === serializeAttributeFilters({ a: true, b: ['x', 'y'] }) && serializeAttributeFilters({}) === undefined && serializeAttributeFilters({ a: [] }) === undefined);

  // ---- D. combinar com preco, marca, condicao, categoria e texto
  report('D1 caracteristica + preco: Android com preco ate 600 => C, D', eq(await L({ categoryTree: 'cat_cel', attrs: attrs({ sistema: ['Android'] }), maxPrice: 600 }), [C, D]));
  report('D2 caracteristica + marca + condicao: Android, Acme, usado => C', eq(await L({ categoryTree: 'cat_cel', attrs: attrs({ sistema: ['Android'] }), brand: 'Acme', condition: 'used' }), [C]));
  report('D3 condicao aceita os rotulos da tela (novo/usado) e ignora "all"', eq(await L({ categoryTree: 'cat_cel', condition: 'usado' }), [C]) && (await L({ categoryTree: 'cat_cel', condition: 'all' })).length === 5);
  report('D4 caracteristica + texto: "celular" + Wi-Fi => A, C (so os celulares com Wi-Fi)', eq(await L({ categoryTree: 'cat_cel', q: 'celular', attrs: attrs({ conectividade: ['Wi-Fi'] }) }), [A, C]));
  report('D5 todos juntos: texto + categoria + caracteristica + preco + marca + condicao => A', eq(await L({ categoryTree: 'cat_eletro', q: 'alpha', attrs: attrs({ sistema: ['Android'], memoria_ram: { min: 8 } }), minPrice: 900, maxPrice: 1100, brand: 'Acme', condition: 'new' }), [A]));

  // ---- E. pesquisa textual com valores de caracteristicas, sem acento, sinonimos e relevancia
  const bt = await L({ q: 'bluetooth' });
  report('E1 texto acha produto pelo VALOR da caracteristica (B so tem "Bluetooth" em conectividade) e tambem o do titulo (D)', eq(bt, [B, D]), bt);
  report('E2 relevancia: titulo antes de caracteristica (D "Caixa Bluetooth" vem antes de B)', bt[0] === D, bt);
  report('E3 sem acento: "camera" acha "Câmera Digital" (titulo) e "camara excelente" nao e confundido', (await L({ q: 'camera' })).includes(CAM));
  report('E4 sinonimos do dicionario: "telemovel" acha celulares', (await L({ q: 'telemovel' })).includes(A));
  const cb = await L({ q: 'celular bluetooth' });
  report('E5 todas as palavras precisam aparecer (E): "celular bluetooth" nao traz A (sem Bluetooth) nem C; B (titulo "Celular" + Bluetooth) vem ANTES de D (so "celular" por sinonimo "android")', !cb.includes(A) && !cb.includes(C) && cb[0] === B && cb.includes(D), cb);
  report('E6 pesquisa pelo nome da categoria ("tablets") e pela descricao ("portatil")', (await L({ q: 'tablets' })).includes(T) && eq(await L({ q: 'portatil' }), [D]));
  report('E7 caracteres especiais do usuario sao tratados como texto (% e _ nao viram curinga) e nao quebram', (await L({ q: '100%' })).length === 0 && (await L({ q: "a_b'; DROP TABLE products;--" })).length === 0 && (await q('SELECT count(*)::int n FROM products'))[0].n === 8);
  report('E8 sinonimos so como PALAVRA INTEIRA: "bluetooth" nao acha "tela grande" etc.; "cel" (trecho digitado) acha "Celular"', (await L({ q: 'cel' })).includes(A) && !(await L({ q: 'bluetooth' })).includes(A) && !(await L({ q: 'bluetooth' })).includes(C));
  report('E9 pesquisa sem resultado = lista vazia', (await L({ q: 'zzzxxyy' })).length === 0);

  // ---- F. facets
  const F = await CatalogService.getFacets({ categoryTree: 'cat_cel' }, db);
  const fa = (code: string) => F.attributes.find((a) => a.code === code);
  report('F1 facets de Celulares: so atributos FILTRAVEIS e ativos (sistema, memoria_ram, resistente_agua, conectividade); sem "obs", "interno", "bateria"', F.attributes.map((a) => a.code).sort().join() === 'conectividade,memoria_ram,resistente_agua,sistema', F.attributes.map((a) => a.code));
  report('F2 selecao com contagem e SO opcoes existentes: sistema Android 4, iOS 1; conectividade Wi-Fi 2, Bluetooth 1, 5G 1 (nao oferece "4G")', JSON.stringify(fa('sistema')?.options) === '[{"value":"Android","count":4},{"value":"iOS","count":1}]' && JSON.stringify(fa('conectividade')?.options?.map((o) => [o.value, o.count])) === '[["Wi-Fi",2],["Bluetooth",1],["5G",1]]', fa('conectividade'));
  report('F3 numero com intervalo real (RAM 2 a 16, unidade GB) e Sim/Nao com contagens (sim 3, nao 2)', fa('memoria_ram')?.range?.min === 2 && fa('memoria_ram')?.range?.max === 16 && fa('memoria_ram')?.unit === 'GB' && fa('resistente_agua')?.bool?.yes === 3 && fa('resistente_agua')?.bool?.no === 2, [fa('memoria_ram'), fa('resistente_agua')]);
  report('F4 marca, condicao e preco do conjunto: Acme 2 / Beta 1 / Foto 1 / Som 1; novo 4 / usado 1; preco 300 a 2000; total 5', F.total === 5 && JSON.stringify(F.brands.map((b) => [b.value, b.count])) === '[["Acme",2],["Beta",1],["Foto",1],["Som",1]]' && JSON.stringify(F.conditions.map((c) => [c.value, c.count])) === '[["new",4],["used",1]]' && F.price?.min === 300 && F.price?.max === 2000, F);
  const FA = await CatalogService.getFacets({ categoryTree: 'cat_cel', attrs: attrs({ sistema: ['Android'] }) }, db);
  const faa = (code: string) => FA.attributes.find((a) => a.code === code);
  report('F5 facetado: com Android marcado, "sistema" continua mostrando iOS (1) como irma, e os OUTROS grupos refletem so Android (RAM 2 a 16, Sim/Nao 3 / 1)', faa('sistema')?.options?.some((o) => o.value === 'iOS' && o.count === 1) === true && faa('memoria_ram')?.range?.min === 2 && faa('resistente_agua')?.bool?.yes === 3 && faa('resistente_agua')?.bool?.no === 1 && FA.total === 4, FA);
  const FB = await CatalogService.getFacets({ categoryTree: 'cat_cel', attrs: attrs({ sistema: ['Android'], memoria_ram: { min: 10 } }) }, db);
  report('F6 SEM opcao sem resultado: com Android e RAM >= 10 so sobra C — "iOS" (0 resultados) NAO e oferecido; Sim/Nao so "sim" 1', JSON.stringify(FB.attributes.find((a) => a.code === 'resistente_agua')?.bool) === '{"yes":1,"no":0}' && FB.total === 1 && !FB.attributes.find((a) => a.code === 'sistema')?.options?.some((o) => o.value === 'iOS'), FB.attributes.find((a) => a.code === 'sistema'));
  const FC = await CatalogService.getFacets({ categoryTree: 'cat_cel', attrs: attrs({ sistema: ['iOS'], memoria_ram: { min: 100 } }) }, db);
  report('F7 selecao sem resultado: a opcao escolhida segue na lista (com 0) para poder ser desmarcada; total 0', FC.total === 0 && FC.attributes.find((a) => a.code === 'sistema')?.options?.some((o) => o.value === 'iOS' && o.count === 0) === true, FC);
  const FD = await CatalogService.getFacets({ categoryTree: 'cat_eletro' }, db);
  report('F8 departamento: conectividade agrega a definicao da raiz E a substituida (opcoes Wi-Fi 3, Bluetooth 1, 5G 1, 4G 1); orfao de "Telefones simples" nao conta', JSON.stringify(FD.attributes.find((a) => a.code === 'conectividade')?.options?.map((o) => [o.value, o.count]).sort()) === JSON.stringify([['4G', 1], ['5G', 1], ['Bluetooth', 1], ['Wi-Fi', 3]]), FD.attributes.find((a) => a.code === 'conectividade'));
  const FE = await CatalogService.getFacets({ q: 'alpha' }, db);
  report('F9 sem categoria: facets de marca/condicao/preco para a pesquisa, SEM caracteristicas', FE.attributes.length === 0 && FE.total === 1 && FE.brands.length === 1 && FE.brands[0].value === 'Acme', FE);
  report('F10 atributo de filtro invalido aparece em ignoredAttributes (nao quebra)', (await CatalogService.getFacets({ categoryTree: 'cat_cel', attrs: attrs({ fantasma: ['x'] }) }, db)).ignoredAttributes.join() === 'fantasma');
  const FG = await CatalogService.getFacets({ categoryTree: 'nao-existe' }, db);
  report('F11 categoria desconhecida: tudo vazio', FG.total === 0 && FG.attributes.length === 0 && FG.brands.length === 0);
  await q("UPDATE products SET is_active=false WHERE id=$1", [C]);
  const FH = await CatalogService.getFacets({ categoryTree: 'cat_cel' }, db);
  report('F12 produto pausado nao entra nos numeros (total 4, Wi-Fi 1) nem na lista', FH.total === 4 && FH.attributes.find((a) => a.code === 'conectividade')?.options?.find((o) => o.value === 'Wi-Fi')?.count === 1 && !(await L({ categoryTree: 'cat_cel' })).includes(C));
  await q("UPDATE products SET is_active=true WHERE id=$1", [C]);

  // ---- G. paginacao e ordenacao
  const bulk: string[] = [];
  for (let i = 0; i < 48; i++) bulk.push(await mk({ title: `Lote ${String(i).padStart(2, '0')}`, brand: i % 2 ? 'Acme' : 'Beta', price: 100 + (i % 12) * 10, condition: 'new', categoryId: 'cat_cel', specs: { sistema: i % 3 ? 'Android' : 'iOS', memoria_ram: i % 8 } }));
  const pageAll = async (f: any, limit: number) => { const ids: string[] = []; let pages = 0, t = 0; for (let p = 1; p < 20; p++) { const r = await CatalogService.getProducts({ ...f, page: p, limit }, db); if (p === 1) t = r.pagination.total; if (r.products.length === 0) break; ids.push(...r.products.map((x: any) => x.id)); pages++; } return { ids, pages, t }; };
  for (const sort of ['newest', 'price_asc', 'price_desc', 'relevance', 'sales_desc', 'rating_desc'] as const) {
    const r = await pageAll({ categoryTree: 'cat_cel', sort }, 10);
    report(`G-${sort} paginacao estavel (paginas de 10): sem repetir nem pular produto; total=${r.t}; ${r.pages} paginas`, r.ids.length === r.t && new Set(r.ids).size === r.ids.length && r.t === 53 && r.pages === 6, { n: r.ids.length, uniq: new Set(r.ids).size, t: r.t, pages: r.pages });
  }
  const pa = (await CatalogService.getProducts({ categoryTree: 'cat_cel', sort: 'price_asc', limit: 100 }, db)).products.map((p: any) => p.price);
  report('G2 ordenacao por preco: crescente (e decrescente na inversa)', pa.every((v: number, i: number) => i === 0 || pa[i - 1] <= v) && (await CatalogService.getProducts({ categoryTree: 'cat_cel', sort: 'price_desc', limit: 100 }, db)).products.map((p: any) => p.price)[0] === 2000);
  const filtPaged = await pageAll({ categoryTree: 'cat_cel', attrs: attrs({ sistema: ['Android'], memoria_ram: { min: 3, max: 6 } }), brand: 'Acme', sort: 'price_asc' }, 4);
  const expectedFilt = (await q(`SELECT p.id FROM products p JOIN product_attribute_values s ON s.product_id=p.id AND s.attribute_code='sistema' AND s.option_value='Android' JOIN product_attribute_values m ON m.product_id=p.id AND m.attribute_code='memoria_ram' AND m.value_number BETWEEN 3 AND 6 WHERE p.category_id='cat_cel' AND p.brand ILIKE 'Acme'`)).map((r: any) => r.id);
  report('G3 filtros + paginacao: o total e as paginas batem com a consulta de referencia (SQL independente)', filtPaged.t === expectedFilt.length && eq(filtPaged.ids, expectedFilt) && new Set(filtPaged.ids).size === filtPaged.ids.length, { t: filtPaged.t, ref: expectedFilt.length });
  const beyond = await CatalogService.getProducts({ categoryTree: 'cat_cel', page: 99, limit: 10 }, db);
  report('G4 pagina alem do fim: vazia, total e totalPages corretos', beyond.products.length === 0 && beyond.pagination.total === 53 && beyond.pagination.totalPages === 6);
  const lim = await CatalogService.getProducts({ categoryTree: 'cat_cel', limit: 5000 }, db);
  report('G5 limite maximo respeitado (100) e pagina invalida vira 1', lim.pagination.limit === 100 && (await CatalogService.getProducts({ categoryTree: 'cat_cel', page: -3, limit: 10 }, db)).pagination.page === 1);

  await pool.end();
  console.log(`\n=== RESULTADO: ${passed}/${total} ===`);
  process.exit(passed === total ? 0 : 1);
}
main().catch((e) => { console.error('ERRO FATAL', e); process.exit(2); });
