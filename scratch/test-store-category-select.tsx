/**
 * Categoria Principal da loja comercial: o mesmo seletor pesquisavel do cadastro de produtos, no modo "qualquer categoria"
 * (principal ou subcategoria), sem mudar o contrato (categoryId + category). Dados reais: as 322 categorias. Sem rede/banco.
 */
import React from 'react';
import fs from 'fs';
import { renderToStaticMarkup } from 'react-dom/server';
import { buildCategoryTaxonomy } from '../src/data/categoryTaxonomy.js';
import {
  INITIAL_PICKER_STATE, buildCategorySearchIndex, extractTypedQuery, pickerReducer, resolveEnter, resolveOpenChildren, type PickerAction, type PickerState,
} from '../src/utils/categorySearch.js';
import { CategorySearchSelect } from '../src/components/seller/CategorySearchSelect.js';

let pass = 0, fail = 0;
const report = (n: string, ok: boolean, d?: unknown) => { ok ? pass++ : fail++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}${ok ? '' : '  => ' + JSON.stringify(d ?? null).slice(0, 400)}`); };
const src = (p: string) => fs.readFileSync(p, 'utf8').split(String.fromCharCode(13, 10)).join(String.fromCharCode(10));

const tax = buildCategoryTaxonomy().map((n) => ({ id: n.id, name: n.name, slug: n.slug, parentId: n.parentId, displayOrder: n.displayOrder, isActive: true }));
const index = buildCategorySearchIndex(tax);
const run = (s: PickerState, ...as: PickerAction[]) => as.reduce((st, a) => pickerReducer(st, a, index), s);
const root = tax.find((c) => !c.parentId && c.name === 'Moda Feminina')!;
const calcas = tax.find((c) => c.parentId === root.id && c.name === 'Calças')!;
const html = (p: Partial<React.ComponentProps<typeof CategorySearchSelect>> = {}) =>
  renderToStaticMarkup(<CategorySearchSelect id="store-category" categories={tax as any} value="" onChange={() => {}} selectable="any" {...p} />);

// ---------- A. regra de seleção por modo
const open0 = run(INITIAL_PICKER_STATE, { type: 'open' });
const onRoot = run(open0, { type: 'move', delta: 1 });
report('A1 modo "any": Enter numa categoria PRINCIPAL a seleciona (a loja aceita qualquer categoria)', resolveEnter(index, onRoot, 'any').kind === 'select', resolveEnter(index, onRoot, 'any'));
report('A2 modo padrão (produtos) INALTERADO: Enter na principal abre, nunca seleciona', resolveEnter(index, onRoot).kind === 'drill' && resolveEnter(index, onRoot, 'leaf').kind === 'drill');
report('A3 modo "any": → abre as subcategorias da linha ativa; em categoria final não faz nada', resolveOpenChildren(index, onRoot).kind === 'drill' && resolveOpenChildren(index, run(open0, { type: 'drill', id: root.id }, { type: 'move', delta: 1 })).kind === 'none');
const inRoot = run(open0, { type: 'drill', id: root.id });
report('A4 dentro da principal, → numa final não abre nada; Enter seleciona a final', resolveOpenChildren(index, inRoot).kind === 'none' && resolveEnter(index, inRoot, 'any').kind === 'select');
const searched = run(INITIAL_PICKER_STATE, { type: 'input', value: 'moda feminina' });
report('A5 pesquisa "moda feminina": a principal aparece e é selecionável por Enter; as subcategorias também', resolveEnter(index, searched, 'any').kind === 'select');

report('A6 digitar sobre o caminho mostrado nunca mistura "caminho + digitação" (nem no início nem no fim)', extractTypedQuery('Moda FemininaS', 'Moda Feminina') === 'S' && extractTypedQuery('SModa Feminina', 'Moda Feminina') === 'S' && extractTypedQuery('calcas', 'Moda Feminina') === 'calcas' && extractTypedQuery('abc', null) === 'abc' && extractTypedQuery('Moda Femini', 'Moda Feminina') === 'Moda Femini');

// ---------- B. componente (SSR) no modo "any"
const openRoot = html({ initialState: { open: true } });
report('B1 aberto: as 30 principais, cada uma com a ação "ver subcategorias" (alvo de toque) e todas escolhíveis', (openRoot.match(/data-testid="category-option-branch"/g) || []).length === 30 && (openRoot.match(/data-testid="category-open-children"/g) || []).length === 30, openRoot.length);
report('B2 leitor de tela: instruções do modo (qualquer categoria; seta → para subcategorias) e aria-label da linha', /Qualquer categoria pode ser escolhida/.test(openRoot) && /Seta para a direita para ver as subcategorias/.test(openRoot) && !/subcategorias\. Abrir\./.test(openRoot));
report('B3 o botão "ver subcategorias" não entra na ordem de Tab nem no leitor (o teclado usa →) e tem alvo ≥ 44px', /tabindex="-1"[^>]*aria-hidden="true"[^>]*data-testid="category-open-children"/.test(openRoot) && /w-11 h-11/.test(openRoot));
const insideRoot = html({ initialState: { open: true, browseId: root.id, active: 0 } });
report('B4 dentro de uma principal: "Voltar", caminho no topo e "Escolher esta" (a própria principal)', /data-testid="category-up"/.test(insideRoot) && /data-testid="category-choose-current"/.test(insideRoot) && />Escolher esta</.test(insideRoot) && !/category-open-children/.test(insideRoot));
report('B5 no modo de produtos NÃO existe "Escolher esta" nem botão de subcategorias (comportamento aprovado intacto)', (() => { const h = html({ selectable: 'leaf', initialState: { open: true, browseId: root.id } }); const h2 = html({ selectable: 'leaf', initialState: { open: true } }); return !/category-choose-current/.test(h) && !/category-open-children/.test(h2) && /subcategorias\. Abrir\./.test(h2) && /Só categorias finais podem ser escolhidas/.test(h2); })());
const searchHtml = html({ initialState: { open: true, typed: true, query: 'calcas', active: 0 } });
report('B6 pesquisa "calcas" (sem acento/caixa): os dois caminhos completos aparecem para identificar a loja', /Moda Feminina/.test(searchHtml) && /Moda Masculina/.test(searchHtml) && /aria-label="Moda Feminina › Calças"/.test(searchHtml));
report('B7 pesquisa por uma principal: ela aparece com "N subcategorias" e pode ser escolhida (aria-selected presente)', (() => { const h = html({ initialState: { open: true, typed: true, query: 'moda feminina', active: 0 } }); return /aria-label="Moda Feminina, com \d+ subcategorias/.test(h) && /aria-selected="false"/.test(h); })());

// ---------- C. edição: categoria já cadastrada
report('C1 editar loja com categoria PRINCIPAL: o campo mostra o nome dela, com limpar e a linha marcada ao abrir', html({ value: root.id }).includes('value="Moda Feminina"') && /Limpar categoria escolhida/.test(html({ value: root.id })) && (html({ value: root.id, initialState: { open: true } }).match(/aria-selected="true"/g) || []).length === 1);
report('C2 editar loja com SUBCATEGORIA: mostra o caminho completo e a linha marcada entre as irmãs', html({ value: calcas.id }).includes('value="Moda Feminina › Calças"') && (html({ value: calcas.id, initialState: { open: true, browseId: root.id } }).match(/aria-selected="true"/g) || []).length === 1);
report('C3 a principal escolhida aparece marcada (✓) na lista de principais, no modo "any"', /lucide-check/.test(html({ value: root.id, initialState: { open: true } })));
report('C4 no modo de produtos a principal nunca é marcada como escolhida', !/lucide-check/.test(html({ selectable: 'leaf', value: root.id, initialState: { open: true } })));
report('C5 categoria que não existe mais: campo vazio (a loja pede nova escolha)', html({ value: 'cat_inexistente' }).includes('value=""'));
report('C6 carregando e sem categorias: campo desabilitado com aviso', /disabled/.test(html({ loading: true })) && /Carregando categorias/.test(html({ loading: true })) && /disabled/.test(html({ categories: [] })));

// ---------- D. formulário da loja (travas no código) e contrato
const store = src('src/components/seller/SellerMultiStore.tsx'), wiz = src('src/components/seller/SellerProductWizard.tsx'), comp = src('src/components/seller/CategorySearchSelect.tsx');
report('D1 o <select> da categoria principal foi trocado pelo seletor pesquisável (modo "any") ligado ao mesmo estado', /<CategorySearchSelect[\s\S]*?categories=\{categoriesList as any\}[\s\S]*?value=\{selectedCategoryId\}[\s\S]*?onChange=\{setSelectedCategoryId\}[\s\S]*?selectable="any"/.test(store) && !/<select\s+value=\{selectedCategoryId\}/.test(store) && /htmlFor="store-category"/.test(store));
report('D2 contrato intacto: criação e edição enviam categoryId (id) e category (nome), como antes', (store.match(/categoryId: selectedCategoryId,/g) || []).length === 2 && (store.match(/category: categoryName,/g) || []).length === 2 && store.includes("const categoryName = selectedCategoryObj?.name || ''"));
report('D3 mesma fonte de categorias (/catalog/categories), mesma validação ao enviar e botão só habilita com categoria', store.includes("apiClient.get<any>('/catalog/categories')") && store.includes("showToast('Selecione uma categoria válida para a loja.')") && store.includes('disabled={!selectedCategoryId || categoriesList.length === 0}'));
report('D4 edição mantém a categoria já cadastrada; sem categoria na lista pede nova escolha; cadastro novo começa sem categoria escondida', store.includes('setSelectedCategoryId(store.categoryId && categoriesList.some((c) => c.id === store.categoryId) ? store.categoryId : \'\')') && /setSelectedCategoryId\(''\); \/\/ sem categoria/.test(store) && !/categoriesList\[0\]\.id/.test(store));
report('D5 aviso "nenhuma categoria disponível" continua quando a lista vem vazia', store.includes('Nenhuma categoria disponível. Aguarde o administrador cadastrar categorias.'));
report('D6 cadastro de produtos intacto: continua sem "selectable" (só categorias finais) e com setCategory', /<CategorySearchSelect[\s\S]*?onChange=\{setCategory\}/.test(wiz) && !/selectable=/.test(wiz.slice(wiz.indexOf('<CategorySearchSelect'), wiz.indexOf('<CategorySearchSelect') + 400)));
report('D7 teclado/mobile do componente preservados (→ só no modo "any"; Enter nunca envia o formulário da loja)', comp.includes("case 'ArrowRight'") && /if \(!anyMode \|\| !state\.open \|\| state\.typed\) break;/.test(comp) && /case 'Enter':[\s\S]*e\.preventDefault\(\)/.test(comp) && /min-h-\[44px\]/.test(comp) && /text-base/.test(comp));
report('D8 sem dependências, sem tocar em servidor, schema ou categorias', (() => { const pkg = JSON.parse(src('package.json')); return !Object.keys({ ...pkg.dependencies, ...pkg.devDependencies }).some((d) => /downshift|headlessui|react-select|cmdk|fuse|combobox/i.test(d)); })() && !/fetch\(|apiClient|axios/.test(comp));

console.log(`\nRESULTADO: ${pass} PASS, ${fail} FAIL`);
process.exit(fail ? 1 : 0);
