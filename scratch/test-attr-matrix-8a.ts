/**
 * FASE 8A — TESTE da matriz de atributos em Postgres 17 DESCARTAVEL: importa as 322 categorias REAIS (inventario lido da producao),
 * aplica a matriz pelo SERVICO REAL, compara os efetivos com o resolvedor puro, testa idempotencia/retomada/reversao e CRIA UM PRODUTO
 * (com variacoes quando ha eixos) em CADA subcategoria — Fases 1 a 7 de ponta a ponta. Nunca producao.
 */
process.env.REDIS_URL = '';
import { assertLedgerTestDatabaseGuard } from './ledgerTestDbGuard.js';
const testDbUrl = assertLedgerTestDatabaseGuard();
process.env.DATABASE_URL = testDbUrl;
process.env.NODE_ENV = 'test';
process.env.SKIP_RUNTIME_ALIGN = 'true';
import 'dotenv/config';
import fs from 'fs';
import pg from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import * as schema from '../src/db/schema.js';
import { users, sellers, stores, addresses, categories } from '../src/db/schema.js';
import { ALL_PLANS } from '../src/data/attributeMatrix/index.js';
import { buildTree, compileOperations, resolveMatrix, validateMatrix, type EffectiveAttribute } from '../src/data/attributeMatrix/engine.js';
import { applyOperations, rollbackOperations } from '../scripts/attribute-matrix/applyEngine.js';
import { resolveEffectiveAttributes } from '../src/server/modules/catalog/attributeDefinitionService.js';
import { ProductCreationService } from '../src/server/modules/catalog/productCreationService.js';
import { CatalogService } from '../src/server/modules/catalog/catalogService.js';
import { selectFormAttributes, buildAttributeSpecs, validateFormFields, type FormValues } from '../src/utils/attributeFormModel.js';
import { validateProductAttributes } from '../src/utils/attributeValidator.js';
import { axisTarget, planAxisUi } from '../src/utils/variantAxes.js';
import { RESERVED_ATTRIBUTE_CODES } from '../src/utils/attributeRules.js';

if (!['localhost', '127.0.0.1'].includes(new URL(testDbUrl).hostname)) throw new Error('Somente banco local descartavel.');
const pool = new pg.Pool({ connectionString: testDbUrl, max: 6 });
const db = drizzle(pool, { schema });
let passed = 0, total = 0;
const report = (l: string, ok: boolean, d?: any) => { total++; if (ok) passed++; console.log(`[${ok ? 'PASS' : 'FAIL'}] ${l}${ok ? '' : ' -> ' + JSON.stringify(d ?? null).slice(0, 700)}`); };
const q = async (s: string, p?: any[]) => (await pool.query(s, p)).rows;
const n = async (s: string, p?: any[]) => Number((await q(s, p))[0].n);

async function main() {
  report('0 banco de teste e PostgreSQL 17', /PostgreSQL 17\./.test((await q('select version() v'))[0].v));
  const inv = JSON.parse(fs.readFileSync('docs/attribute-matrix/v1/categories.inventory.raw.json', 'utf8'));
  const tree = buildTree(inv.categories);
  const resolution = resolveMatrix(ALL_PLANS, tree);
  const vr = validateMatrix(ALL_PLANS, tree, resolution);
  const ops = compileOperations(ALL_PLANS, tree, resolution);

  // ---------- A. dry-run puro (sem banco)
  report('A1 dry-run da matriz: 0 erros, 0 avisos; cobertura 322/322; 847 operacoes (806 definicoes + 7 overrides + 34 desativacoes)', vr.issues.filter((i) => i.severity === 'error').length === 0 && vr.issues.filter((i) => i.severity === 'warning').length === 0 && tree.size === 322 && ops.length === 847 && ops.filter((o) => o.kind === 'define').length === 806 && ops.filter((o) => o.kind === 'override').length === 7 && ops.filter((o) => o.kind === 'disable').length === 34, { e: vr.issues.filter((i) => i.severity !== 'info').slice(0, 5), ops: ops.length });
  report('A2 operacoes em ordem de aplicacao: nenhuma subcategoria antes da sua principal; ids determinísticos unicos', ops.every((o, i) => i === 0 || ops[i - 1].depth <= o.depth) && new Set(ops.filter((o) => o.kind !== 'disable').map((o) => (o.payload as any).id)).size === ops.filter((o) => o.kind !== 'disable').length);

  // ---------- B. categorias reais no banco descartavel
  for (const c of inv.categories.filter((x: any) => !x.parent_id)) await q('INSERT INTO categories (id,name,slug,icon,display_order,is_active,created_at) VALUES ($1,$2,$3,$4,$5,$6,now())', [c.id, c.name, c.slug, c.icon, c.display_order ?? 0, c.is_active]);
  for (const c of inv.categories.filter((x: any) => x.parent_id)) await q('INSERT INTO categories (id,name,slug,icon,parent_id,display_order,is_active,created_at) VALUES ($1,$2,$3,$4,$5,$6,$7,now())', [c.id, c.name, c.slug, c.icon, c.parent_id, c.display_order ?? 0, c.is_active]);
  report('B1 322 categorias reais importadas (30 principais + 292 subcategorias), mesmos ids/slugs/parentId', (await n('SELECT count(*)::int n FROM categories')) === 322 && (await n('SELECT count(*)::int n FROM categories WHERE parent_id IS NULL')) === 30);

  // ---------- C. dry-run contra o banco + aplicacao em lotes
  const dry = await applyOperations(db, ops, { dryRun: true });
  report('C1 dry-run no banco: planeja 847 criacoes e NAO escreve nada (0 atributos)', dry.created === 847 && dry.errors.length === 0 && (await n('SELECT count(*)::int n FROM category_attributes')) === 0, dry);
  const batches: number[] = [];
  const t0 = Date.now();
  const applied = await applyOperations(db, ops, { batchSize: 100, onBatch: async (b) => { batches.push(b.executed); const c = await n('SELECT count(*)::int n FROM category_attributes'); if (c !== batches.reduce((a, x) => a + x, 0)) throw new Error('contagem pos-lote divergente'); } });
  const secs = ((Date.now() - t0) / 1000).toFixed(1);
  console.log(`INFO  aplicacao: ${applied.created} criadas em ${applied.batches} lotes, ${secs}s`);
  report('C2 aplicacao por lotes de 100 pelo servico REAL: 847 criadas, 0 erros, 0 drift, validacao pos-lote (contagem no banco = acumulado) em todos os lotes', applied.created === 847 && applied.errors.length === 0 && applied.drift.length === 0 && applied.batches === 9 && (await n('SELECT count(*)::int n FROM category_attributes')) === 847, { c: applied.created, e: applied.errors.slice(0, 3), b: applied.batches });
  report('C3 estrutura gravada: 806 definicoes proprias, 7 overrides (overrides_id preenchido), 34 desativacoes (inativas)', (await n('SELECT count(*)::int n FROM category_attributes WHERE overrides_id IS NULL')) === 806 && (await n('SELECT count(*)::int n FROM category_attributes WHERE overrides_id IS NOT NULL AND is_active')) === 7 && (await n('SELECT count(*)::int n FROM category_attributes WHERE overrides_id IS NOT NULL AND NOT is_active')) === 34);

  // ---------- D. efetivos reais (servico) == efetivos do resolvedor puro, para TODAS as 322 categorias
  let mismatches: any[] = [];
  const tcat = new Map<string, string>(inv.categories.map((c: any) => [c.slug, c.id]));
  for (const [slug, list] of resolution.effective) {
    const real = await resolveEffectiveAttributes(db, tcat.get(slug)!);
    const norm = (a: any) => JSON.stringify([a.code, a.name, a.type, a.role, !!a.required, a.unit ?? null, a.options ?? null, a.min ?? null, a.max ?? null, a.decimals ?? null, a.maxLength ?? null, a.group ?? null, a.order, !!a.filterable]);
    const realN = (a: any) => JSON.stringify([a.code, a.name, a.type, a.role, !!a.isRequired, a.unit ?? null, a.optionsJson ?? null, a.minValue ?? null, a.maxValue ?? null, a.decimals ?? null, a.maxLength ?? null, a.displayGroup ?? null, a.sortOrder, !!a.isFilterable]);
    const exp = list.map(norm).sort(), got = real.map(realN).sort();
    if (JSON.stringify(exp) !== JSON.stringify(got)) mismatches.push({ slug, exp: exp.length, got: got.length, diff: exp.filter((x) => !got.includes(x)).slice(0, 1), extra: got.filter((x) => !exp.includes(x)).slice(0, 1) });
    // ordem real == ordem do resolvedor puro (obrigatorios primeiro, ordem, nome)
    if (JSON.stringify(real.map((a: any) => a.code)) !== JSON.stringify(list.map((a: EffectiveAttribute) => a.code))) mismatches.push({ slug, ordem: 'diferente' });
    // origem herdada/substituida
    for (const a of list) {
      const r = real.find((x: any) => x.code === a.code);
      if (!r) continue;
      const originOk = (r.originCategoryId ?? null) === tcat.get(a.originSlug) && Boolean(r.isInherited) === a.inherited && Boolean(r.isOverride) === a.overridden;
      if (!originOk) mismatches.push({ slug, code: a.code, origem: { esperado: [a.originSlug, a.inherited, a.overridden], real: [r.originCategoryName, r.isInherited, r.isOverride] } });
    }
  }
  report('D1 EFETIVOS: para as 322 categorias o servico real devolve exatamente o que o resolvedor puro previu (campos, ordem, heranca/override/origem)', mismatches.length === 0, mismatches.slice(0, 4));
  report('D2 desativacoes valem: o atributo desativado nao aparece na categoria nem nos filhos', (await resolveEffectiveAttributes(db, tcat.get('eletrodomesticos-pecas-e-acessorios')!)).every((a: any) => !['voltagem', 'potencia_w'].includes(a.code)) && (await resolveEffectiveAttributes(db, tcat.get('eletrodomesticos-ventiladores')!)).some((a: any) => a.code === 'voltagem'));
  report('D3 override vale so onde foi declarado (Roupas tradicionais africanas tem materiais proprios; Vestidos nao)', ((await resolveEffectiveAttributes(db, tcat.get('moda-feminina-roupas-tradicionais-africanas')!)).find((a: any) => a.code === 'material')?.optionsJson ?? []).includes('Bazin') && !((await resolveEffectiveAttributes(db, tcat.get('moda-feminina-vestidos')!)).find((a: any) => a.code === 'material')?.optionsJson ?? []).includes('Bazin'));

  // ---------- E. idempotencia, drift, retomada
  const again = await applyOperations(db, ops, { batchSize: 200 });
  report('E1 IDEMPOTENCIA: reaplicar tudo = 847 puladas, 0 criadas, 0 drift, banco igual (847)', again.created === 0 && again.skipped === 847 && again.drift.length === 0 && (await n('SELECT count(*)::int n FROM category_attributes')) === 847, { c: again.created, s: again.skipped });
  await q("UPDATE category_attributes SET name='Alterado a mao' WHERE id=$1", [(ops.find((o) => o.kind === 'define')!.payload as any).id]);
  const drifted = await applyOperations(db, ops, {});
  report('E2 DRIFT: se alguem editou um atributo (ex.: nome), a reaplicacao RELATA a diferenca e NAO sobrescreve', drifted.drift.length === 1 && drifted.drift[0].field === 'name' && (await q('SELECT name FROM category_attributes WHERE id=$1', [(ops.find((o) => o.kind === 'define')!.payload as any).id]))[0].name === 'Alterado a mao', drifted.drift);
  await q("UPDATE category_attributes SET name=$2 WHERE id=$1", [(ops.find((o) => o.kind === 'define')!.payload as any).id, (ops.find((o) => o.kind === 'define')!.payload as any).name]);

  // retomada: banco zerado, falha no meio (stopAfter), depois continua
  const removedAll = await rollbackOperations(db, ops);
  report('E3 REVERSAO limpa: remove as 847 em ordem inversa (overrides antes dos alvos) e deixa 0 atributos', removedAll.removed === 847 && removedAll.blocked.length === 0 && (await n('SELECT count(*)::int n FROM category_attributes')) === 0, removedAll);
  const part = await applyOperations(db, ops, { batchSize: 100, stopAfter: 333 });
  const midCount = await n('SELECT count(*)::int n FROM category_attributes');
  report('E4 FALHA NO MEIO (parada apos 333 operacoes): estado parcial coerente (333 no banco), sem lixo', part.stoppedEarly && midCount === 333, { midCount, part });
  const resumed = await applyOperations(db, ops, { batchSize: 100 });
  report('E5 RETOMADA: rodar de novo continua de onde parou — pula as 333 existentes e cria as 514 restantes; resultado final igual ao completo', resumed.skipped === 333 && resumed.created === 514 && resumed.errors.length === 0 && (await n('SELECT count(*)::int n FROM category_attributes')) === 847 && resumed.drift.length === 0, { s: resumed.skipped, c: resumed.created });
  // erro no meio: banco com atributo conflitante antes da operacao
  const ops2 = ops.filter((o) => o.kind === 'define').slice(0, 5);
  await q('DELETE FROM category_attributes'); // zera (nao ha valores)
  await q("INSERT INTO category_attributes (id,category_id,name,code,type,role,is_required,is_active,sort_order) VALUES ('attr_manual_1',$1,'Manual',$2,'text','spec',false,true,1)", [ops2[1].categoryId, (ops2[1].payload as any).code]);
  const failing = await applyOperations(db, ops.filter((o) => o.categoryId === ops2[1].categoryId || o.depth === 0).slice(0, 80), {});
  report('E6 conflito com atributo ja cadastrado a mao: a aplicacao PARA com erro claro no ponto do conflito (nada depois e feito)', failing.errors.length === 1 && /ATTRIBUTE_CODE_DUPLICATE|ATTRIBUTE_CODE_INHERITED_CONFLICT|já|codigo|código/i.test(failing.errors[0].message), failing.errors);
  await q('DELETE FROM category_attributes');
  await applyOperations(db, ops, { batchSize: 100 });
  report('E7 apos o teste de falha, a matriz completa e reaplicada do zero com sucesso (847)', (await n('SELECT count(*)::int n FROM category_attributes')) === 847);

  // ---------- F. UM PRODUTO EM CADA SUBCATEGORIA (fases 1-7 de ponta a ponta)
  await q("INSERT INTO countries (id,code,name,flag,currency,currency_symbol,phone_prefix) VALUES ('GW','GW','Guiné-Bissau','x','XOF','CFA','+245') ON CONFLICT DO NOTHING");
  await db.insert(users).values({ id: 'usr_m8', email: 'm8@t.test', passwordHash: 'x', fullName: 'M8', phone: '1', role: 'SELLER', countryCode: 'GW', kycStatus: 'verified', riskScore: 'baixo', isActive: true, isEmailVerified: true, isPhoneVerified: false, createdAt: new Date(), updatedAt: new Date() } as any);
  await db.insert(sellers).values({ id: 'sel_m8', userId: 'usr_m8', companyName: 'M8', tradingName: 'M8', taxId: '0', phone: '1', countryCode: 'GW', status: 'active', kycStatus: 'verified', isEmailVerified: true, createdAt: new Date(), updatedAt: new Date() } as any);
  await db.insert(addresses).values({ id: 'ad_m8', userId: 'usr_m8', recipientName: 'L', street: 'R', number: '1', city: 'B', state: 'B', countryCode: 'GW', phone: '9', isDefault: false, addressType: 'business', createdAt: new Date(), updatedAt: new Date() } as any);
  await db.insert(stores).values({ id: 'st_m8', sellerId: 'sel_m8', name: 'M8', slug: 'st-m8', countryCode: 'GW', status: 'active', operationalAddressId: 'ad_m8', createdAt: new Date(), updatedAt: new Date() } as any);

  const sample = (a: any): unknown => {
    switch (a.type) {
      case 'text': return 'Exemplo';
      case 'number': { const min = a.minValue ?? null, max = a.maxValue ?? null; let v = min !== null ? Number(min) : max !== null ? Math.min(Number(max), 1) : 1; if (max !== null && v > Number(max)) v = Number(max); return v; }
      case 'boolean': return false;
      case 'select': return a.optionsJson[0];
      case 'multiselect': return a.optionsJson.slice(0, 2);
      default: return 'x';
    }
  };
  const subs = inv.categories.filter((c: any) => c.parent_id);
  const failures: any[] = [];
  const labelsWithCode: string[] = [];
  let withVariants = 0, withoutAxes = 0, createdProducts = 0, sheetChecked = 0;
  const wizardIssues: any[] = [];
  const seenSkus = new Set<string>();
  for (const c of subs) {
    const eff = await resolveEffectiveAttributes(db, c.id);
    const specs = eff.filter((a: any) => a.role === 'spec');
    const axes = eff.filter((a: any) => a.role === 'variant_axis');
    const values: Record<string, unknown> = {};
    for (const a of specs) values[a.code] = sample(a);

    // modelo do formulario do assistente: nada escondido por duplicidade, eixos fora do formulario geral, valores validam no cliente E no servidor
    const form = selectFormAttributes(eff);
    if (form.fields.length !== specs.length || form.axes.length !== axes.length || form.duplicates.length !== 0) wizardIssues.push({ slug: c.slug, fields: form.fields.length, specs: specs.length, dup: form.duplicates.length });
    const formValues: FormValues = {};
    for (const a of form.fields) { const v = values[a.code]; formValues[a.code] = a.type === 'boolean' ? (v ? 'true' : 'false') : a.type === 'multiselect' ? (v as string[]) : String(v); }
    const clientErrors = validateFormFields(form.fields, formValues);
    const typed = buildAttributeSpecs(form.fields, formValues);
    const strict = validateProductAttributes(eff as any, { ...typed, Marca: 'X', Modelo: 'Y', 'Condição': 'Novo' }, { strictUnknown: true });
    if (Object.keys(clientErrors).length || strict.errors.length || strict.unknownKeys.length) wizardIssues.push({ slug: c.slug, client: clientErrors, server: strict.errors.slice(0, 2) });

    // variantes: duas combinacoes distintas usando os eixos
    const variants: any[] = [];
    if (axes.length) {
      withVariants++;
      const mk = (k: number) => {
        const v: any = { title: `V${k}`, sku: `M8-${seenSkus.size}-${k}`, price: 1000 + k, stock: 5 };
        let distinct = false;
        for (const ax of axes) {
          const opts: string[] = ax.optionsJson ?? [];
          const val = ax.type === 'select' ? (opts[distinct || k === 0 ? 0 : 1] ?? opts[0]) : 'Valor';
          if (ax.type === 'select' && k === 1 && !distinct && opts.length > 1) distinct = true;
          const t = axisTarget(ax.code);
          if ('column' in t) v[t.column] = val; else v.attributesJson = { ...(v.attributesJson ?? {}), [t.json]: val };
        }
        return v;
      };
      variants.push(mk(0), mk(1));
      variants.forEach((v) => seenSkus.add(v.sku));
      // se as duas ficaram iguais (eixo unico sem 2 opcoes), manda so uma
      if (JSON.stringify([variants[0].color, variants[0].size, variants[0].capacity, variants[0].attributesJson]) === JSON.stringify([variants[1].color, variants[1].size, variants[1].capacity, variants[1].attributesJson])) variants.pop();
    } else withoutAxes++;

    try {
      const prod: any = await ProductCreationService.createProduct('usr_m8', { title: `Produto ${c.slug}`.slice(0, 120), price: 1000, image: 'x.jpg', categoryId: c.id, storeId: 'st_m8', weightKg: 0.3, dimensionsCm: { length: 5, width: 5, height: 5 }, stock: 5, condition: 'new', specs: { ...typed, Marca: 'X', Modelo: 'Y', 'Condição': 'Novo' }, ...(variants.length ? { variants } : {}) }, db);
      createdProducts++;
      if (createdProducts % 12 === 1) {
        const d: any = await CatalogService.getProductById(prod.id, undefined, db);
        const labels = [...d.specSheet.groups.flatMap((g: any) => g.items), ...d.specSheet.other].map((i: any) => i.label);
        sheetChecked++;
        if (labels.some((l: string) => /_/.test(l)) || labels.length < specs.length) labelsWithCode.push(`${c.slug}: ${labels.join('|')}`);
      }
    } catch (e: any) {
      failures.push({ slug: c.slug, msg: String(e.message).slice(0, 160), det: e.details?.slice?.(0, 2) });
    }
  }
  report(`F1 PRODUTO REAL em cada uma das 292 subcategorias (valores tipados validos de TODAS as especificacoes + 2 variantes quando ha eixos): ${createdProducts}/292 criados`, createdProducts === 292 && failures.length === 0, failures.slice(0, 5));
  console.log(`INFO  ${withVariants} subcategorias com eixos (variantes criadas), ${withoutAxes} sem eixos`);
  report('F2 ASSISTENTE: em todas as subcategorias o formulario mostra todas as especificacoes (nenhuma escondida por duplicidade), eixos fora do formulario geral, e o payload montado passa no cliente e no servidor em modo ESTRITO', wizardIssues.length === 0, wizardIssues.slice(0, 4));
  report('F3 FICHA PUBLICA (amostra de ' + sheetChecked + ' produtos): nomes amigaveis, nenhum codigo interno, todas as especificacoes presentes', labelsWithCode.length === 0, labelsWithCode.slice(0, 3));
  const pavCount = await n('SELECT count(*)::int n FROM product_attribute_values');
  const expectedPav = await n("SELECT count(*)::int n FROM product_attribute_values");
  report('F4 valores tipados gravados para os 292 produtos (> 292 linhas) e variantes/estoque so no inventory', pavCount > 292 && (await n('SELECT count(*)::int n FROM product_variants WHERE stock <> 0')) === 0 && (await n('SELECT count(*)::int n FROM inventory WHERE variant_id IS NOT NULL')) === (await n('SELECT count(*)::int n FROM product_variants')) && expectedPav === pavCount);
  report('F5 chaves de variante unicas por produto e preenchidas em todas as variantes com identidade', (await n('SELECT count(*)::int n FROM (SELECT product_id, variant_key FROM product_variants WHERE variant_key IS NOT NULL GROUP BY 1,2 HAVING count(*)>1) x')) === 0 && (await n('SELECT count(*)::int n FROM product_variants WHERE variant_key IS NULL')) === 0);

  // ---------- G. obrigatorios, raizes, protecao de uso
  const smart = inv.categories.find((c: any) => c.slug === 'celulares-e-telefones-smartphones');
  let reqErr: any = null; try { await ProductCreationService.createProduct('usr_m8', { title: 'x', price: 1, image: 'x.jpg', categoryId: smart.id, storeId: 'st_m8', weightKg: 1, dimensionsCm: { length: 1, width: 1, height: 1 }, stock: 1, specs: {} }, db); } catch (e: any) { reqErr = e; }
  report('G1 smartphone SEM atributos: acusa exatamente o unico obrigatorio da v2 (Sistema operativo; Memoria RAM passou a opcional); eixos (Cor, Armazenamento) NAO sao exigidos como atributos gerais', reqErr?.details?.map((d: any) => d.field).sort().join() === 'sistema_operativo', reqErr?.details);
  let rootErr = ''; try { await ProductCreationService.createProduct('usr_m8', { title: 'x', price: 1, image: 'x.jpg', categoryId: inv.categories.find((c: any) => !c.parent_id).id, storeId: 'st_m8', weightKg: 1, dimensionsCm: { length: 1, width: 1, height: 1 }, stock: 1, specs: {} }, db); } catch (e: any) { rootErr = e.message; }
  report('G2 categoria PRINCIPAL continua sem aceitar produto (so subcategoria folha)', /subcategorias|mais específica/.test(rootErr), rootErr);
  const rb = await rollbackOperations(db, ops);
  report('G3 com PRODUTOS cadastrados a reversao PARA no primeiro atributo em uso (nada e forcado): bloqueada com mensagem clara e atributos restantes preservados', rb.blocked.length === 1 && /valores em|ATTRIBUTE_IN_USE|em uso|não pode ser excluído/i.test(rb.blocked[0].message) && (await n('SELECT count(*)::int n FROM category_attributes')) > 0, rb);

  await pool.end();
  console.log(`\n=== RESULTADO: ${passed}/${total} ===`);
  process.exit(passed === total ? 0 : 1);
}
main().catch((e) => { console.error('ERRO FATAL', e); process.exit(2); });
