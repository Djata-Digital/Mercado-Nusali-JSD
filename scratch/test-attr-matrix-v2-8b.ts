/**
 * FASE 8B — TESTE da matriz v2 (rodar com LEDGER_TEST_DATABASE_URL apontando para PostgreSQL 17 DESCARTAVEL; nunca producao):
 * regra "obrigatorio-sem-saida", preservacao da v1, diff v1->v2, opcao "Outro" de ponta a ponta no assistente (cliente + servidor estrito
 * + produto real + ficha publica), campos relaxados, regulatorio, e as 322 categorias.
 */
process.env.REDIS_URL = '';
import { assertLedgerTestDatabaseGuard } from './ledgerTestDbGuard.js';
const testDbUrl = assertLedgerTestDatabaseGuard();
process.env.DATABASE_URL = testDbUrl;
process.env.NODE_ENV = 'test';
process.env.SKIP_RUNTIME_ALIGN = 'true';
import 'dotenv/config';
import fs from 'fs';
import { execSync } from 'child_process';
import pg from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import * as schema from '../src/db/schema.js';
import { users, sellers, stores, addresses } from '../src/db/schema.js';
import { ALL_PLANS, MATRIX_VERSION } from '../src/data/attributeMatrix/index.js';
import { buildTree, resolveMatrix, validateMatrix, compileOperations } from '../src/data/attributeMatrix/engine.js';
import { REGULATORY_ENTRIES } from '../src/data/attributeMatrix/regulatory.js';
import { sel, ESCAPE_OPTION, plan } from '../src/data/attributeMatrix/library.js';
import type { CategoryPlan } from '../src/data/attributeMatrix/types.js';
import { applyOperations } from '../scripts/attribute-matrix/applyEngine.js';
import { resolveEffectiveAttributes } from '../src/server/modules/catalog/attributeDefinitionService.js';
import { ProductCreationService } from '../src/server/modules/catalog/productCreationService.js';
import { CatalogService } from '../src/server/modules/catalog/catalogService.js';
import { selectFormAttributes, buildAttributeSpecs, validateFormFields, needsOtherDetail, type FormValues } from '../src/utils/attributeFormModel.js';
import { validateProductAttributes } from '../src/utils/attributeValidator.js';
import { isOtherOption, otherFormKey } from '../src/utils/attributeOther.js';

let passed = 0, total = 0;
const report = (l: string, ok: boolean, d?: unknown) => { total++; if (ok) passed++; console.log(`[${ok ? 'PASS' : 'FAIL'}] ${l}${ok ? '' : ' -> ' + JSON.stringify(d ?? null).slice(0, 500)}`); };
const ESC = /^(outro|outra|outros|outras|n[ãa]o se aplica)\b/i;

async function main() {
  const inv = JSON.parse(fs.readFileSync('docs/attribute-matrix/v1/categories.inventory.raw.json', 'utf8'));
  const tree = buildTree(inv.categories);
  const resolution = resolveMatrix(ALL_PLANS, tree);
  const vr = validateMatrix(ALL_PLANS, tree, resolution);
  const ops = compileOperations(ALL_PLANS, tree, resolution);
  const errs = (plans: CategoryPlan[]) => { const r = resolveMatrix(plans, tree); return validateMatrix(plans, tree, r).issues.filter((i) => i.severity === 'error').map((i) => i.rule); };
  const clone = (): CategoryPlan[] => JSON.parse(JSON.stringify(ALL_PLANS));

  // ---------- A. versao, cobertura, validador
  report('A1 v2: versao v2-*, 322 categorias (30+292), 847 operacoes (806 + 7 + 34), validador 0 erros e 0 avisos', MATRIX_VERSION.startsWith('v2-') && tree.size === 322 && ops.length === 847 && vr.issues.filter((i) => i.severity !== 'info').length === 0 && [...tree.values()].filter((n) => n.depth === 0).length === 30, { v: MATRIX_VERSION, ops: ops.length });
  const subsSlugs = [...tree.values()].filter((n) => n.depth === 1).map((n) => n.slug);
  report('A2 as 292 subcategorias e as 30 principais tem plano; nenhuma categoria inventada', subsSlugs.length === 292 && [...tree.keys()].every((s) => ALL_PLANS.some((p) => p.slug === s)) && ALL_PLANS.every((p) => tree.has(p.slug)));

  // ---------- B. regra obrigatorio-sem-saida (negativos e positivos)
  const withSel = (o: ReturnType<typeof sel>) => { const p = clone(); p.find((x) => x.slug === 'moda-feminina-vestidos')!.define.push({ ...o, order: 99 } as any); return p; };
  const raw = { ...sel('forma_t', 'Forma', ['Redondo', 'Quadrado'], { required: true, closed: true }) };
  report('B1 select obrigatorio SEM saida e sem closed => erro obrigatorio-sem-saida', errs(withSel({ ...raw, closed: undefined } as any)).includes('obrigatorio-sem-saida'));
  report('B2 select obrigatorio com closed:true (lista fechada por natureza) => aceito', !errs(withSel(raw as any)).includes('obrigatorio-sem-saida'));
  report('B3 select obrigatorio criado por sel() recebe "Outro" automaticamente => aceito', (() => { const a = sel('forma_u', 'Forma U', ['Redondo', 'Quadrado'], { required: true }); return a.options!.includes(ESCAPE_OPTION) && !errs(withSel(a)).includes('obrigatorio-sem-saida'); })());
  report('B4 select OPCIONAL nao recebe "Outro" (so o obrigatorio precisa de saida)', !sel('forma_v', 'Forma V', ['Redondo', 'Quadrado']).options!.includes(ESCAPE_OPTION));
  report('B5 "Não se aplica" tambem conta como saida (nao duplica com "Outro")', (() => { const a = sel('forma_w', 'Forma W', ['Redondo', 'Não se aplica'], { required: true }); return a.options!.length === 2; })());
  report('B6 override que REMOVE a saida de um select obrigatorio herdado => erro', (() => {
    const p = clone();
    const root = p.find((x) => x.slug === 'moda-feminina')!; root.define.push({ ...sel('forma_x', 'Forma X', ['Redondo', 'Quadrado'], { required: true }), order: 98 } as any);
    p.find((x) => x.slug === 'moda-feminina-vestidos')!.override.push({ code: 'forma_x', options: ['Redondo', 'Quadrado'] });
    return errs(p).includes('obrigatorio-sem-saida');
  })());

  // ---------- C. v1 preservada e diff v1 -> v2
  const gitShow = (path: string) => execSync(`git show 5868d0b:${path}`, { encoding: 'utf8', maxBuffer: 1 << 28 }).replace(/\r\n/g, '\n');
  const same = ['operations.json', 'matrix.json', 'summary.json', 'categories.inventory.raw.json'].every((f) => fs.readFileSync(`docs/attribute-matrix/v1/${f}`, 'utf8').replace(/\r\n/g, '\n') === gitShow(`docs/attribute-matrix/v1/${f}`));
  report('C1 matriz v1 (Fase 8A) intacta: operations/matrix/summary/inventario identicos ao commit 5868d0b', same);
  const v1ops = JSON.parse(fs.readFileSync('docs/attribute-matrix/v1/operations.json', 'utf8')).operations as any[];
  const v1 = new Map(v1ops.map((o) => [o.opId, o]));
  let optAdds = 0, reqOff = 0, other: any[] = [];
  for (const o of ops) {
    const old = v1.get(o.opId);
    if (!old) { other.push({ novo: o.opId }); continue; }
    for (const f of Object.keys(o.payload as any)) {
      const x = JSON.stringify((old.payload as any)[f] ?? null), y = JSON.stringify((o.payload as any)[f] ?? null);
      if (x === y) continue;
      if (f === 'optionsJson' && (o.payload as any).optionsJson.slice(0, -1).join('|') === (old.payload as any).optionsJson.join('|') && ESC.test((o.payload as any).optionsJson.slice(-1)[0])) optAdds++;
      else if (f === 'isRequired' && (old.payload as any).isRequired === true && (o.payload as any).isRequired === false) reqOff++;
      else other.push({ op: o.opId, f });
    }
  }
  report('C2 diff v1 -> v2: SO "Outro" acrescentado (137) e 3 obrigatorios->opcionais; nenhuma outra alteracao, nenhuma operacao nova/removida', optAdds === 137 && reqOff === 3 && other.length === 0 && ops.length === v1ops.length, { optAdds, reqOff, other: other.slice(0, 3) });
  const relaxed = ['celulares-e-telefones-smartphones:memoria_ram', 'livros-papelaria-e-educacao-livros-escolares:disciplina', 'livros-papelaria-e-educacao-livros-universitarios:area_conhecimento'];
  report('C3 os 3 campos relaxados continuam na ficha (existem) e nao sao obrigatorios', relaxed.every((k) => { const [s, c] = k.split(':'); const a = resolution.effective.get(s)!.find((x) => x.code === c); return a && !a.required; }));

  // ---------- D. propriedades da matriz nas 292 subcategorias
  const subsEff = subsSlugs.map((s) => resolution.effective.get(s)!);
  report('D1 por subcategoria: <=3 especificacoes obrigatorias, <=2 eixos, <=10 especificacoes; nenhuma sem atributos', subsEff.every((l) => l.filter((a) => a.role === 'spec' && a.required).length <= 3 && l.filter((a) => a.role === 'variant_axis').length <= 2 && l.filter((a) => a.role === 'spec').length <= 10 && l.length > 0));
  report('D2 todo select obrigatorio efetivo tem saida, exceto 5 listas fechadas declaradas (portas, 2x conservacao, idade, nivel de ensino)', (() => {
    const bad: string[] = []; const closed = new Set<string>();
    for (const [s, l] of resolution.effective) for (const a of l) if (a.role === 'spec' && a.required && a.type === 'select' && !(a.options ?? []).some((o) => ESC.test(o))) { if (a.closed && a.originSlug === s) closed.add(`${s}:${a.code}`); else if (!a.closed) bad.push(`${s}:${a.code}`); }
    return bad.length === 0 && closed.size === 5;
  })());
  report('D3 unidades: o mesmo codigo tem a mesma unidade/tipo em toda a matriz (validador sem unidade-inconsistente/codigo-inconsistente)', !vr.issues.some((i) => ['unidade-inconsistente', 'codigo-inconsistente'].includes(i.rule)));
  report('D4 campos gerais (Marca, Modelo, Condicao, Garantia, Peso, Dimensoes, Armazem) nao duplicados em nenhuma categoria', !vr.issues.some((i) => ['campo-geral-duplicado', 'nome-reservado'].includes(i.rule)));
  report('D5 todo numero tem minimo < maximo e casas decimais definidas; nenhuma opcao com virgula; toda spec tem grupo de exibicao', ALL_PLANS.every((p) => p.define.every((d) => (d.type !== 'number' || (d.min !== undefined && d.max !== undefined && d.min < d.max && d.decimals !== undefined)) && !(d.options ?? []).some((o) => o.includes(',')) && (d.role === 'variant_axis' || Boolean(d.group)))));
  report('D6 texto livre nunca e filtravel; filtraveis sao select/multiselect/number/boolean', ALL_PLANS.every((p) => p.define.every((d) => !(d.type === 'text' && d.filterable))));

  // ---------- E. regulatorio
  const subSet = new Set(subsSlugs);
  report('E1 revisao regulatoria: 73 entradas, todas em subcategorias REAIS, sem duplicidade, nenhuma bloqueia categoria (so texto de revisao)', REGULATORY_ENTRIES.length === 73 && REGULATORY_ENTRIES.every((e) => subSet.has(e.slug) && e.topics.length > 0 && e.why && e.options) && new Set(REGULATORY_ENTRIES.map((e) => e.slug)).size === 73);

  // ---------- F. banco: aplicar a v2 e testar "Outro" de ponta a ponta
  const pool = new pg.Pool({ connectionString: testDbUrl, ssl: { rejectUnauthorized: false }, max: 4 });
  const db = drizzle(pool, { schema });
  const q = async (s: string, p?: any[]) => (await pool.query(s, p)).rows;
  if (!['localhost', '127.0.0.1'].includes(new URL(testDbUrl).hostname)) throw new Error('Somente banco local descartavel.');
  for (const c of inv.categories.filter((x: any) => !x.parent_id)) await q('INSERT INTO categories (id,name,slug,icon,display_order,is_active,created_at) VALUES ($1,$2,$3,$4,$5,$6,now())', [c.id, c.name, c.slug, c.icon, c.display_order ?? 0, c.is_active]);
  for (const c of inv.categories.filter((x: any) => x.parent_id)) await q('INSERT INTO categories (id,name,slug,icon,parent_id,display_order,is_active,created_at) VALUES ($1,$2,$3,$4,$5,$6,$7,now())', [c.id, c.name, c.slug, c.icon, c.parent_id, c.display_order ?? 0, c.is_active]);
  const applied = await applyOperations(db, ops, { batchSize: 100 });
  report('F1 v2 aplicada pelo servico real em PG17 descartavel: 847 criadas, 0 erros, 0 deriva, todas source=seed', applied.created === 847 && applied.errors.length === 0 && applied.drift.length === 0 && Number((await q("SELECT count(*)::int n FROM category_attributes WHERE source='seed'"))[0].n) === 847, applied.errors);

  await q("INSERT INTO countries (id,code,name,flag,currency,currency_symbol,phone_prefix) VALUES ('GW','GW','Guiné-Bissau','x','XOF','CFA','+245') ON CONFLICT DO NOTHING");
  await db.insert(users).values({ id: 'usr_v2', email: 'v2@t.test', passwordHash: 'x', fullName: 'V2', phone: '1', role: 'SELLER', countryCode: 'GW', kycStatus: 'verified', riskScore: 'baixo', isActive: true, isEmailVerified: true, isPhoneVerified: false, createdAt: new Date(), updatedAt: new Date() } as any);
  await db.insert(sellers).values({ id: 'sel_v2', userId: 'usr_v2', companyName: 'V2', tradingName: 'V2', taxId: '0', phone: '1', countryCode: 'GW', status: 'active', kycStatus: 'verified', isEmailVerified: true, createdAt: new Date(), updatedAt: new Date() } as any);
  await db.insert(addresses).values({ id: 'ad_v2', userId: 'usr_v2', recipientName: 'L', street: 'R', number: '1', city: 'B', state: 'B', countryCode: 'GW', phone: '9', isDefault: false, addressType: 'business', createdAt: new Date(), updatedAt: new Date() } as any);
  await db.insert(stores).values({ id: 'st_v2', sellerId: 'sel_v2', name: 'V2', slug: 'st-v2', countryCode: 'GW', status: 'active', operationalAddressId: 'ad_v2', createdAt: new Date(), updatedAt: new Date() } as any);

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
  let withOutro = 0, formIssues: any[] = [], hintIssues: any[] = [], created = 0, createFail: any[] = [], sheetOk = 0;
  for (const slug of subsSlugs) {
    const id = tree.get(slug)!.id;
    const eff = await resolveEffectiveAttributes(db, id);
    const specs = eff.filter((a: any) => a.role === 'spec');
    const outroSelects = specs.filter((a: any) => a.isRequired && a.type === 'select' && !(a.optionsJson as string[]).slice(0, 1).some(() => false) && ESC.test(String((a.optionsJson as string[]).slice(-1)[0])));
    if (!outroSelects.length) continue;
    withOutro++;
    const values: Record<string, unknown> = {};
    for (const a of specs) values[a.code] = sample(a);
    for (const a of outroSelects) values[a.code] = (a.optionsJson as string[]).slice(-1)[0]; // "Outro"
    const form = selectFormAttributes(eff);
    const fv: FormValues = {};
    for (const a of form.fields) { const v = values[a.code]; fv[a.code] = a.type === 'boolean' ? (v ? 'true' : 'false') : a.type === 'multiselect' ? (v as string[]) : String(v); }
    for (const a of outroSelects) if (isOtherOption(values[a.code])) fv[otherFormKey(a.code)] = 'Especificação de teste';
    const clientErrors = validateFormFields(form.fields, fv);
    const typed = buildAttributeSpecs(form.fields, fv);
    const strict = validateProductAttributes(eff as any, { ...typed, Marca: 'X', Modelo: 'Y', 'Condição': 'Novo' }, { strictUnknown: true });
    if (Object.keys(clientErrors).length || strict.errors.length || strict.unknownKeys.length) formIssues.push({ slug, client: clientErrors, server: strict.errors.slice(0, 2) });
    for (const a of outroSelects) {
      const f = form.fields.find((x) => x.code === a.code)!;
      // "Outro": pede a especificacao (sem ela o formulario bloqueia); opcoes normais e "Nao se aplica" nao pedem nada
      const other = isOtherOption(fv[a.code]);
      const without = { ...fv, [otherFormKey(a.code)]: '' };
      const blocked = !!validateFormFields(form.fields, without)[a.code];
      const none = needsOtherDetail(f, (a.optionsJson as string[])[0]);
      if (needsOtherDetail(f, fv[a.code]) !== other || blocked !== other || none) hintIssues.push({ slug, code: a.code, other, blocked, none });
    }
    // produto real (so onde nao ha eixos obrigatorios: nao exige variantes)
    const axesReq = eff.some((a: any) => a.role === 'variant_axis' && a.isRequired);
    if (!axesReq && created < 12) {
      try {
        const prod: any = await ProductCreationService.createProduct('usr_v2', { title: `Outro ${slug}`.slice(0, 120), price: 1000, image: 'x.jpg', categoryId: id, storeId: 'st_v2', weightKg: 0.3, dimensionsCm: { length: 5, width: 5, height: 5 }, stock: 3, condition: 'new', specs: { ...typed, Marca: 'X', Modelo: 'Y', 'Condição': 'Novo' } } as any, db);
        created++;
        const stored = await q('SELECT option_value FROM product_attribute_values WHERE product_id=$1 AND attribute_code=$2', [prod.id, outroSelects[0].code]);
        const d: any = await CatalogService.getProductById(prod.id, undefined, db);
        const items = [...d.specSheet.groups.flatMap((g: any) => g.items), ...d.specSheet.other];
        if (stored.some((r: any) => r.option_value === (outroSelects[0].optionsJson as string[]).slice(-1)[0]) && items.some((i: any) => i.displayValue === 'Especificação de teste' || !isOtherOption(typed[outroSelects[0].code]))) sheetOk++;
      } catch (e: any) { createFail.push({ slug, msg: String(e.message).slice(0, 150) }); }
    }
  }
  report(`F2 "Outro" no assistente: ${withOutro} subcategorias com select obrigatorio + saida; valores com "Outro" passam no cliente E no servidor ESTRITO`, withOutro >= 100 && formIssues.length === 0, formIssues.slice(0, 3));
  report('F3 campo complementar: "Outro" exige especificacao (formulario bloqueia sem ela); demais opcoes e "Nao se aplica" nao pedem nada', hintIssues.length === 0, hintIssues.slice(0, 3));
  report(`F4 produto real com "Outro" gravado como valor tipado (option_value) e exibido na ficha publica: ${sheetOk}/${created}`, created >= 10 && sheetOk === created && createFail.length === 0, createFail.slice(0, 3));
  report('F5 efetivos das 322 categorias no servico real == resolvedor puro (herança, overrides, desativacoes, eixos)', await (async () => {
    const { verifyEffective } = await import('../scripts/attribute-matrix/verifyEffective.js');
    const idBySlug = new Map<string, string>(inv.categories.map((c: any) => [c.slug, c.id]));
    const v = await verifyEffective(db, resolution.effective, idBySlug);
    return v.checked === 322 && v.mismatches.length === 0;
  })());
  await pool.end();
  console.log(`\n=== RESULTADO: ${passed}/${total} ===`);
  process.exit(passed === total ? 0 : 1);
}
main().catch((e) => { console.error('ERRO FATAL', e); process.exit(2); });
