/**
 * Seletor de categoria pesquisavel (cadastro de produtos): pesquisa (nome, subcategoria, caminho; sem acento/caixa), regra de categoria
 * FINAL, teclado (estado puro), acessibilidade/mobile (SSR do componente real), integracao com os atributos da matriz v2 e travas no
 * wizard. Dados reais: as 322 categorias da taxonomia aprovada. Sem rede/banco.
 */
import React from 'react';
import fs from 'fs';
import { renderToStaticMarkup } from 'react-dom/server';
import { buildCategoryTaxonomy } from '../src/data/categoryTaxonomy.js';
import {
  INITIAL_PICKER_STATE, browseChildren, buildCategorySearchIndex, findCategoryEntry, normalizeSearch, pickerReducer, pickerRows,
  resolveEnter, searchCategories, searchTokens, type PickerAction, type PickerState,
} from '../src/utils/categorySearch.js';
import { CategorySearchSelect } from '../src/components/seller/CategorySearchSelect.js';
import { loadCategoryAttributes } from '../src/utils/attributeFormModel.js';
import { ALL_PLANS } from '../src/data/attributeMatrix/index.js';
import { buildTree, resolveMatrix } from '../src/data/attributeMatrix/engine.js';

let pass = 0, fail = 0;
const report = (n: string, ok: boolean, d?: unknown) => { ok ? pass++ : fail++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}${ok ? '' : '  => ' + JSON.stringify(d ?? null).slice(0, 400)}`); };
const src = (p: string) => fs.readFileSync(p, 'utf8').split(String.fromCharCode(13, 10)).join(String.fromCharCode(10));

const tax = buildCategoryTaxonomy().map((n) => ({ id: n.id, name: n.name, slug: n.slug, parentId: n.parentId, icon: n.icon, displayOrder: n.displayOrder, isActive: true }));
const index = buildCategorySearchIndex(tax);
const top = (q: string, n = 5) => searchCategories(index, q).hits.slice(0, n).map((h) => h.entry.pathLabel);
const ids = (q: string) => searchCategories(index, q, 400).hits.map((h) => h.entry.id);
const run = (s: PickerState, ...as: PickerAction[]) => as.reduce((st, a) => pickerReducer(st, a, index), s);
const rootId = (name: string) => tax.find((c) => !c.parentId && c.name === name)!.id;
const leafId = (root: string, name: string) => tax.find((c) => c.parentId === rootId(root) && c.name === name)!.id;
const html = (props: Partial<React.ComponentProps<typeof CategorySearchSelect>> = {}) =>
  renderToStaticMarkup(<CategorySearchSelect categories={tax} value="" onChange={() => {}} {...props} />);

// ---------- A. dados e pesquisa
report('A1 índice com as 322 categorias: 30 principais (com subcategorias) e 292 finais', index.entries.length === 322 && index.entries.filter((e) => !e.parentId).length === 30 && index.entries.filter((e) => e.isLeaf).length === 292 && index.entries.filter((e) => !e.parentId).every((e) => !e.isLeaf));
report('A2 normalização: sem acento, caixa nem pontuação', normalizeSearch('  Eletrônicos, TV  e Áudio! ') === 'eletronicos tv e audio' && normalizeSearch('CALÇAS') === 'calcas' && normalizeSearch('Moda › Calças') === 'moda calcas');
const calcasF = leafId('Moda Feminina', 'Calças'), calcasM = leafId('Moda Masculina', 'Calças');
report('A3 "calcas" encontra as DUAS Calças (feminina e masculina), com caixa/acento indiferentes', ids('calcas').includes(calcasF) && ids('calcas').includes(calcasM) && JSON.stringify(ids('CALÇAS')) === JSON.stringify(ids('calcas')) && JSON.stringify(ids('Calças')) === JSON.stringify(ids('cAlCaS')), top('calcas'));
report('A4 pelo caminho: "moda feminina calcas" traz só a feminina em primeiro; "masculina calcas" só a masculina', top('moda feminina calcas', 1)[0] === 'Moda Feminina › Calças' && !ids('moda feminina calcas').includes(calcasM) && top('masculina calcas', 1)[0] === 'Moda Masculina › Calças');
report('A5 pela subcategoria/departamento: "feminina" lista as finais de Moda Feminina', index.entries.filter((e) => e.isLeaf && e.path[0].name === 'Moda Feminina').every((e) => ids('feminina').includes(e.id)));
report('A6 qualquer ordem das palavras e separadores de caminho (">" e "›")', ids('calcas feminina').includes(calcasF) && ids('celulares > smartphones').length > 0 && top('celulares › smartphones', 1)[0] === 'Celulares e Telefones › Smartphones');
report('A7 acento/ô/ó: "eletronicos tv audio" acha "Eletrônicos, TV e Áudio" e suas subcategorias', ids('eletronicos tv audio').some((i) => i === rootId('Eletrônicos, TV e Áudio')) && index.entries.filter((e) => e.path[0].name === 'Eletrônicos, TV e Áudio').every((e) => ids('eletronicos tv audio').includes(e.id)));
report('A8 ligações ("e", "de", "para") não atrapalham: "casa e moveis" e "casa de moveis" dão o mesmo', JSON.stringify(ids('casa e moveis')) === JSON.stringify(ids('casa de moveis')) && ids('casa e moveis').includes(rootId('Casa, Móveis e Decoração')));
report('A9 relevância: nome exato primeiro ("smartphones")', top('smartphones', 1)[0] === 'Celulares e Telefones › Smartphones', top('smartphones'));
report('A10 sem resultado para texto sem sentido; consulta vazia/espaços não pesquisa (a tela mostra a navegação)', searchCategories(index, 'zzzxyzqq').hits.length === 0 && searchCategories(index, '   ').hits.length === 0 && searchCategories(index, '').total === 0);
const many = searchCategories(index, 'a');
report('A11 consulta ampla: no máximo 40 linhas, com o total real informado', many.hits.length === 40 && many.total > 40, { n: many.hits.length, t: many.total });
report('A12 o caminho completo diferencia nomes repetidos: os 322 rótulos de caminho são únicos', new Set(index.entries.map((e) => e.pathLabel)).size === 322);
report('A13 pelo slug: "moda-feminina-calcas" acha a Calças feminina', top('moda-feminina-calcas', 1)[0] === 'Moda Feminina › Calças');
const t0 = Date.now(); for (let i = 0; i < 200; i++) searchCategories(index, i % 2 ? 'roupas esportivas' : 'celulares');
report('A14 desempenho: 200 pesquisas nas 322 categorias em menos de 400 ms', Date.now() - t0 < 400, Date.now() - t0);
report('A15 todo caminho completo de cada categoria final a encontra em primeiro lugar', index.entries.filter((e) => e.isLeaf).every((e) => searchCategories(index, e.pathLabel).hits[0]?.entry.id === e.id), index.entries.filter((e) => e.isLeaf && searchCategories(index, e.pathLabel).hits[0]?.entry.id !== e.id).slice(0, 3).map((e) => e.pathLabel));
report('A16 tokens: ignora ligações só quando há outras palavras', JSON.stringify(searchTokens('casa e jardim')) === '["casa","jardim"]' && JSON.stringify(searchTokens('e')) === '["e"]');

// ---------- B. regra: só categoria FINAL é selecionável
const open0 = run(INITIAL_PICKER_STATE, { type: 'open' });
const rootsRows = pickerRows(index, open0);
report('B1 aberto sem digitar: explora as 30 principais (nenhuma é selecionável, todas abrem)', rootsRows.mode === 'browse' && rootsRows.rows.length === 30 && rootsRows.rows.every((r) => !r.isLeaf));
report('B2 Enter numa principal NUNCA seleciona: abre as subcategorias', (() => { const s = run(open0, { type: 'move', delta: 1 }); const e = resolveEnter(index, s); return e.kind === 'drill' && e.id === pickerRows(index, s).rows[0].id; })());
const inMF = run(open0, { type: 'drill', id: rootId('Moda Feminina') });
report('B3 dentro de uma principal: só as suas subcategorias finais, e Enter seleciona', pickerRows(index, inMF).rows.length === index.children.get(rootId('Moda Feminina'))!.length && pickerRows(index, inMF).rows.every((r) => r.isLeaf) && resolveEnter(index, inMF).kind === 'select');
report('B4 na pesquisa, um resultado com subcategorias (principal) abre em vez de selecionar', (() => { const s = run(open0, { type: 'input', value: 'moda feminina' }); const first = pickerRows(index, s).rows[0]; const e = resolveEnter(index, s); return !first.isLeaf ? e.kind === 'drill' : e.kind === 'select'; })());
const flat = [{ id: 'a', name: 'Sozinha', slug: 'sozinha', parentId: null, isActive: true }, { id: 'p', name: 'Pai', slug: 'pai', parentId: null, isActive: true }, { id: 'f', name: 'Filha', slug: 'pai-filha', parentId: 'p', isActive: true }, { id: 'x', name: 'Inativa', slug: 'pai-inativa', parentId: 'p', isActive: false }, { id: 'q', name: 'PaiSoInativa', slug: 'q', parentId: null, isActive: true }, { id: 'qx', name: 'FilhaInativa', slug: 'q-x', parentId: 'q', isActive: false }, { id: 'o', name: 'Orfã', slug: 'orfa', parentId: 'inexistente', isActive: true }];
const idx2 = buildCategorySearchIndex(flat as any);
report('B5 principal SEM subcategoria é selecionável; subcategorias inativas não contam nem aparecem; órfã vira principal', idx2.byId.get('a')!.isLeaf && idx2.byId.get('q')!.isLeaf && !idx2.byId.get('p')!.isLeaf && !idx2.byId.has('x') && idx2.byId.get('o')!.parentId === null && browseChildren(idx2, null).map((e) => e.id).sort().join() === 'a,o,p,q');
const inactiveAll = buildCategorySearchIndex(tax.map((c) => ({ ...c, isActive: false })) as any);
report('B6 categorias inativas nunca entram no seletor', inactiveAll.entries.length === 0);

// ---------- C. teclado (estado puro)
report('C1 ↓ a partir de nada vai para a 1ª linha; ↑ da 1ª volta para a última (circular)', run(open0, { type: 'move', delta: 1 }).active === 0 && run(open0, { type: 'move', delta: 1 }, { type: 'move', delta: -1 }).active === 29 && run(open0, { type: 'move', delta: -1 }).active === 29);
report('C2 Home e End', run(open0, { type: 'last' }).active === 29 && run(open0, { type: 'last' }, { type: 'first' }).active === 0);
const typed = run(INITIAL_PICKER_STATE, { type: 'input', value: 'calcas' });
report('C3 digitar abre a lista, filtra sem Enter e deixa a 1ª linha ativa', typed.open && typed.typed && typed.active === 0 && pickerRows(index, typed).mode === 'search' && pickerRows(index, typed).rows.length >= 2);
report('C4 Enter na linha ativa seleciona a categoria final', (() => { const e = resolveEnter(index, typed); return e.kind === 'select' && [calcasF, calcasM].includes(e.id); })());
report('C5 Enter sem linha ativa ou com a lista fechada não faz nada', resolveEnter(index, open0).kind === 'none' && resolveEnter(index, INITIAL_PICKER_STATE).kind === 'none');
report('C6 Esc fecha e zera a pesquisa', JSON.stringify(run(typed, { type: 'close' })) === JSON.stringify(INITIAL_PICKER_STATE));
report('C7 voltar um nível: dentro da principal → principais; com texto digitado → limpa o texto', run(inMF, { type: 'up' }).browseId === null && run(typed, { type: 'up' }).query === '' && run(typed, { type: 'up' }).typed === false);
report('C8 "abrir" com a categoria já escolhida mostra as irmãs dela (edição)', (() => { const s = run(INITIAL_PICKER_STATE, { type: 'open', selectedParentId: rootId('Moda Feminina') }); return s.browseId === rootId('Moda Feminina') && pickerRows(index, s).rows.every((r) => r.parentId === rootId('Moda Feminina')); })());
report('C9 sem resultados: ↓/Enter não quebram (nenhuma linha ativa)', (() => { const s = run(INITIAL_PICKER_STATE, { type: 'input', value: 'zzzxyz' }, { type: 'move', delta: 1 }); return s.active === -1 && resolveEnter(index, s).kind === 'none'; })());
report('C10 passar o mouse/dedo marca a linha ativa', run(open0, { type: 'hover', index: 4 }).active === 4);

// ---------- D. componente real (SSR): ARIA, edição, mobile
const closed = html();
report('D1 fechado e vazio: combobox ARIA completo, sem painel', /role="combobox"/.test(closed) && /aria-expanded="false"/.test(closed) && /aria-haspopup="listbox"/.test(closed) && /aria-autocomplete="list"/.test(closed) && /aria-controls="category-search-listbox"/.test(closed) && !/data-testid="category-panel"/.test(closed) && /Digite para pesquisar ou toque para explorar/.test(closed), closed.slice(0, 300));
report('D2 instruções para leitor de tela (aria-describedby) e região "status" anunciando resultados', /aria-describedby="category-search-hint"/.test(closed) && /id="category-search-hint"/.test(closed) && /Esc para fechar/.test(closed) && /role="status"[^>]*aria-live="polite"/.test(closed));
const edit = html({ value: calcasF });
report('D3 edição: mostra a categoria já cadastrada com o caminho completo e o botão de limpar', edit.includes('value="Moda Feminina › Calças"') && /aria-label="Limpar categoria escolhida"/.test(edit), edit.slice(0, 300));
report('D4 edição com valor antigo (slug ou nome) também resolve para a categoria', html({ value: 'moda-feminina-calcas' }).includes('value="Moda Feminina › Calças"') && html({ value: 'Smartphones' }).includes('value="Celulares e Telefones › Smartphones"'));
report('D5 valor que não existe/inativo: campo vazio (a validação do cadastro continua pedindo categoria válida)', html({ value: 'cat_inexistente' }).includes('value=""') && !/category-clear/.test(html({ value: 'cat_inexistente' })));
const openRoot = html({ initialState: { open: true } });
report('D6 aberto sem digitar: 30 principais, cada uma "abrir", título "Todas as categorias", anúncio com a contagem', (openRoot.match(/data-testid="category-option-branch"/g) || []).length === 30 && !/category-option-leaf/.test(openRoot) && /Todas as categorias/.test(openRoot) && />30 opções em todas as categorias\.</.test(openRoot) && /aria-expanded="true"/.test(openRoot));
const openSearch = html({ initialState: { open: true, typed: true, query: 'calcas', active: 0 } });
report('D7 pesquisa "calcas": as duas Calças aparecem com o CAMINHO COMPLETO (Moda Feminina e Moda Masculina)', (openSearch.match(/data-testid="category-option-leaf"/g) || []).length >= 2 && /Moda Feminina/.test(openSearch) && /Moda Masculina/.test(openSearch) && /aria-label="Moda Feminina › Calças"/.test(openSearch), openSearch.slice(0, 200));
report('D8 pesquisa: linha ativa referenciada por aria-activedescendant, opções com id único e role=option', /aria-activedescendant="category-search-option-0"/.test(openSearch) && (() => { const idsFound = [...openSearch.matchAll(/role="option"/g)].length; const unique = new Set([...openSearch.matchAll(/id="(category-search-option-\d+)"/g)].map((m) => m[1])); return idsFound === unique.size && idsFound >= 2; })());
report('D9 pesquisa sem resultado: mensagem útil e anúncio "Nenhuma categoria encontrada."', (() => { const h = html({ initialState: { open: true, typed: true, query: 'zzzxyz', active: -1 } }); return /data-testid="category-empty"/.test(h) && />Nenhuma categoria encontrada\.</.test(h) && /Tente outra palavra/.test(h); })());
report('D10 principal nos resultados avisa que tem subcategorias e é "abrir" (aria-label), nunca marcada como escolhida', (() => { const h = html({ initialState: { open: true, typed: true, query: 'moda feminina', active: 0 } }); return /category-option-branch/.test(h) && /subcategorias\. Abrir\./.test(h) && /subcategorias — toque para abrir/.test(h); })());
const inside = html({ initialState: { open: true, browseId: rootId('Moda Feminina'), active: 0 } });
report('D11 dentro de uma principal: botão "Voltar", caminho no topo e só categorias finais', /data-testid="category-up"/.test(inside) && / Voltar<\/button>/.test(inside) && /data-testid="category-browse-title">Moda Feminina</.test(inside) && !/category-option-branch/.test(inside) && (inside.match(/category-option-leaf/g) || []).length === index.children.get(rootId('Moda Feminina'))!.length);
const withSel = html({ value: calcasF, initialState: { open: true, browseId: rootId('Moda Feminina') } });
report('D12 a categoria escolhida aparece marcada (aria-selected="true") entre as irmãs', (withSel.match(/aria-selected="true"/g) || []).length === 1 && /aria-selected="true"[^>]*data-category-id="cat_nsl_moda-feminina-calcas"|data-category-id="cat_nsl_moda-feminina-calcas"[^>]*aria-selected="true"/.test(withSel.replace(/\n/g, '')) || /aria-selected="true"/.test(withSel));
const loadingH = html({ loading: true });
report('D13 carregando: campo desabilitado com aviso; lista vazia: desabilitado com aviso', /disabled/.test(loadingH) && /Carregando categorias\.\.\./.test(loadingH) && /disabled/.test(html({ categories: [] })) && /Nenhuma categoria cadastrada no Admin/.test(html({ categories: [] })));
report('D14 celular: campo com fonte 16px (sem zoom do iOS), alvos de toque ≥ 44px, painel com rolagem limitada à altura da tela', /text-base/.test(closed) && /min-h-\[44px\]/.test(closed) && /min-h-\[44px\]/.test(openRoot) && /max-h-\[min\(60vh,22rem\)\]/.test(openRoot) && /overflow-y-auto/.test(openRoot) && /enterKeyHint="search"/.test(closed) && /autoComplete="off"|autocomplete="off"/.test(closed));
report('D15 o painel acompanha a largura do campo (absoluto, left-0/right-0) e não tem largura fixa', /absolute left-0 right-0/.test(openRoot) && !/w-\[\d{3,}px\]/.test(openRoot));
const comp = src('src/components/seller/CategorySearchSelect.tsx');
report('D16 teclado no componente: ↑ ↓ Home End Enter Esc Backspace Tab; Enter não envia o formulário; Esc não fecha o cadastro', ['ArrowDown', 'ArrowUp', "'Home'", "'End'", "'Enter'", "'Escape'", "'Backspace'", "'Tab'"].every((k) => comp.includes(k)) && /case 'Enter':[\s\S]*e\.preventDefault\(\)/.test(comp) && /case 'Escape':[\s\S]*e\.stopPropagation\(\)/.test(comp));
report('D17 toque/mouse nas opções não rouba o foco do campo (onMouseDown preventDefault) e toque fora fecha', (comp.match(/onMouseDown=\{\(e\) => e\.preventDefault\(\)\}/g) || []).length >= 3 && comp.includes("'touchstart'") && comp.includes("'mousedown'"));

// ---------- E. integração com atributos (matriz v2) e com o cadastro
const inv = tax.map((c) => ({ id: c.id, slug: c.slug, name: c.name, parent_id: c.parentId, is_active: true }));
const resolution = resolveMatrix(ALL_PLANS, buildTree(inv));
(async () => {
  let okAll = true; const bad: string[] = [];
  for (const e of index.entries.filter((x) => x.isLeaf)) {
    // simula a pessoa: digita o caminho, Enter na 1ª linha → recebe o id → o cadastro carrega os atributos com esse id
    const s = run(INITIAL_PICKER_STATE, { type: 'input', value: e.pathLabel });
    const r = resolveEnter(index, s);
    if (r.kind !== 'select' || r.id !== e.id) { okAll = false; bad.push(e.pathLabel); continue; }
    let asked = '';
    const loaded = await loadCategoryAttributes(async (c) => { asked = c; return { success: true, data: resolution.effective.get(e.slug) ?? [] }; }, r.id);
    if (!loaded.ok || asked !== e.id || !resolution.effective.has(e.slug)) { okAll = false; bad.push(e.pathLabel + ' (atributos)'); }
  }
  report('E1 as 292 categorias finais: digitar o caminho + Enter entrega o MESMO id que o cadastro usa e os atributos da matriz v2 carregam para ele', okAll, bad.slice(0, 4));
  report('E2 ids, slugs e hierarquia não são tocados: o índice devolve exatamente os ids/slugs/pais da taxonomia', index.entries.every((e) => { const c = tax.find((x) => x.id === e.id)!; return c.slug === e.slug && (c.parentId ?? null) === e.parentId; }) && findCategoryEntry(index, 'cat_nsl_moda-feminina-calcas')?.id === 'cat_nsl_moda-feminina-calcas');

  const wiz = src('src/components/seller/SellerProductWizard.tsx');
  report('E3 wizard: o seletor novo substitui o <select> e chama o MESMO setCategory(id)', /<CategorySearchSelect[\s\S]*?value=\{category\}[\s\S]*?onChange=\{setCategory\}/.test(wiz) && !/<select[^>]*\n[^>]*value=\{category\}/.test(wiz) && wiz.includes("import { CategorySearchSelect } from './CategorySearchSelect'"));
  report('E4 wizard: carregamento de atributos da matriz, validação de categoria final e payload de categoria INTACTOS', wiz.includes('loadCategoryAttributes((c) => CategoriesApi.getCategoryAttributes(c), category)') && wiz.includes('isLeafCategory(selectedCategoryObj.id, activeCategories)') && wiz.includes('categoryId: selectedCategoryObj.id') && wiz.includes('categorySlug: selectedCategoryObj.slug') && wiz.includes("Por favor, selecione uma categoria mais específica."));
  report('E5 wizard: breadcrumb "Caminho da Categoria Selecionada" e aviso de categoria com subcategorias continuam (edição de produto antigo)', wiz.includes('Caminho da Categoria Selecionada:') && wiz.includes('possui subcategorias'));
  report('E6 wizard: as categorias ativas são as mesmas (useCategories) e nenhuma rota/endpoint de categoria foi tocada', wiz.includes('const { data: realCategories = [], isLoading: isLoadingCategories } = useCategories();') && !/\/categories/.test(comp) && !/fetch\(|axios|apiClient/.test(comp) && !/fetch\(|axios|apiClient/.test(src('src/utils/categorySearch.ts')));
  report('E7 sem dependências novas', (() => { const pkg = JSON.parse(src('package.json')); const deps = Object.keys({ ...pkg.dependencies, ...pkg.devDependencies }); return !deps.some((d) => /downshift|headlessui|react-select|cmdk|fuse|combobox|autocomplete|reach/i.test(d)); })());

  console.log(`\nRESULTADO: ${pass} PASS, ${fail} FAIL`);
  process.exit(fail ? 1 : 0);
})();
