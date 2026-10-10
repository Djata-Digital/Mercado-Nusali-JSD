/**
 * P3 — filtros por caracteristica no frontend/API: utilitarios puros, parametros da API, painel de filtros (SSR do componente real),
 * paginacao, leitura da querystring no servidor e travas no codigo da tela. Sem banco, sem rede.
 */
import React from 'react';
import fs from 'fs';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  clearAttributeFilter, countActiveAttributeFilters, parseAttributeFilters, serializeAttributeFilters, setAttributeBoolean, setAttributeRange, toggleAttributeOption,
  type CatalogFacets,
} from '../src/utils/attributeFilters.js';
import { buildCatalogParams, buildFacetParams, hasActiveCatalogFilters, type CatalogUiState } from '../src/utils/catalogQuery.js';
import { CatalogFacetsPanel } from '../src/components/CatalogFacetsPanel.js';
import { pageWindow } from '../src/components/SearchResultsView.js';
import { parsePublicCatalogFilters } from '../src/server/modules/catalog/catalogRoutes.js';

let pass = 0, fail = 0;
const report = (n: string, ok: boolean, d?: unknown) => { ok ? pass++ : fail++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}${ok ? '' : '  => ' + JSON.stringify(d ?? null).slice(0, 500)}`); };

// ---------- A. operacoes imutaveis dos filtros
const f0 = {};
const f1 = toggleAttributeOption(f0, 'cor', 'Preto');
const f2 = toggleAttributeOption(f1, 'cor', 'Branco');
report('A1 multipla escolha: marcar duas opcoes; desmarcar a ultima remove o filtro (nunca lista vazia)', JSON.stringify(f2) === '{"cor":["Preto","Branco"]}' && JSON.stringify(toggleAttributeOption(toggleAttributeOption(f1, 'cor', 'Preto'), 'x', 'y')) === '{"x":["y"]}' && Object.keys(toggleAttributeOption(f1, 'cor', 'Preto')).length === 0);
report('A2 funcoes sao imutaveis (o objeto anterior nao muda)', JSON.stringify(f1) === '{"cor":["Preto"]}' && JSON.stringify(f0) === '{}');
report('A3 Sim/Nao: marcar, trocar e repetir o mesmo limpa; null limpa', JSON.stringify(setAttributeBoolean({}, 'agua', true)) === '{"agua":true}' && JSON.stringify(setAttributeBoolean({ agua: true }, 'agua', false)) === '{"agua":false}' && Object.keys(setAttributeBoolean({ agua: true }, 'agua', true)).length === 0 && Object.keys(setAttributeBoolean({ agua: true }, 'agua', null)).length === 0);
report('A4 intervalo: texto com virgula decimal, so min, so max, vazio limpa, invalido e ignorado', JSON.stringify(setAttributeRange({}, 'ram', '8', '16')) === '{"ram":{"min":8,"max":16}}' && JSON.stringify(setAttributeRange({}, 'peso', '0,5', '')) === '{"peso":{"min":0.5}}' && JSON.stringify(setAttributeRange({}, 'ram', '', '4')) === '{"ram":{"max":4}}' && Object.keys(setAttributeRange({ ram: { min: 1 } }, 'ram', '', '')).length === 0 && Object.keys(setAttributeRange({}, 'ram', 'abc', '')).length === 0 && Object.keys(setAttributeRange({}, 'ram', '9', '2')).length === 0);
report('A5 contagem de filtros ativos e limpeza de um filtro', countActiveAttributeFilters({ a: ['x'], b: true, c: { min: 1 }, d: [] as any }) === 3 && Object.keys(clearAttributeFilter({ a: ['x'], b: true }, 'a')).join() === 'b');
report('A6 ida e volta pela URL/API: serializar e parsear devolve os mesmos filtros', JSON.stringify(parseAttributeFilters(serializeAttributeFilters({ cor: ['B', 'A'], agua: false, ram: { min: 2, max: 8 } })).filters) === '{"agua":false,"cor":["A","B"],"ram":{"min":2,"max":8}}');

// ---------- B. parametros da API
const base: CatalogUiState = { query: '  celular  ', categoryTree: 'cat_cel', brand: 'Acme', condition: 'novo', priceMin: 100, priceMax: 900, sortBy: 'sales', attrs: { sistema: ['Android'], ram: { min: 8 } }, page: 3 };
const p = buildCatalogParams(base, { country: 'GW', originCountryFilter: 'ALL', limit: 24 });
report('B1 listagem: texto aparado, categoria (arvore), marca, condicao em ingles, preco, ordem "sales" -> sales_desc, pagina, limite e pais', p.q === 'celular' && p.categoryTree === 'cat_cel' && p.brand === 'Acme' && p.condition === 'novo' && p.minPrice === 100 && p.maxPrice === 900 && p.sort === 'sales_desc' && p.page === 3 && p.limit === 24 && p.country === 'GW' && p.originCountryFilter === 'ALL', p);
report('B2 caracteristicas vao como JSON canonico em "attrs"', p.attrs === '{"ram":{"min":8},"sistema":["Android"]}', p.attrs);
report('B3 sem categoria as caracteristicas NAO vao (so valem com categoria escolhida)', buildCatalogParams({ ...base, categoryTree: undefined }, {}).attrs === undefined);
report('B4 facets: mesmos filtros, SEM ordem nem pagina', (() => { const f = buildFacetParams(base, { country: 'GW' }); return f.q === 'celular' && f.attrs === p.attrs && f.sort === undefined && f.page === undefined && f.limit === undefined; })());
report('B5 mapa de ordenacao completo e valores padrao (relevance, page 1, limit 24); condicao "all" e vazios nao vao', (() => { const d = buildCatalogParams({ query: '', condition: 'all', sortBy: 'relevance', attrs: {}, page: 0 }, {}); return d.sort === 'relevance' && d.page === 1 && d.limit === 24 && d.condition === undefined && d.q === undefined && d.brand === undefined && d.minPrice === undefined; })() && buildCatalogParams({ ...base, sortBy: 'rating' }, {}).sort === 'rating_desc' && buildCatalogParams({ ...base, sortBy: 'price_asc' }, {}).sort === 'price_asc');
report('B6 hasActiveCatalogFilters: marca/condicao/preco/caracteristica contam; texto e categoria nao', hasActiveCatalogFilters({ ...base, brand: undefined, condition: 'all', priceMin: undefined, priceMax: undefined, attrs: {} }) === false && hasActiveCatalogFilters({ ...base, brand: undefined, condition: 'all', priceMin: undefined, priceMax: undefined, attrs: { a: true } }) === true && hasActiveCatalogFilters({ ...base, brand: undefined, condition: 'usado', priceMin: undefined, priceMax: undefined, attrs: {} }) === true);

// ---------- C. querystring no servidor
const req = (query: Record<string, any>) => ({ query, headers: {} } as any);
const sf = parsePublicCatalogFilters(req({ q: 'celular', categoryTree: ' cat_cel ', condition: 'usado', attrs: '{"sistema":["Android"],"ram":{"min":8}}', sort: 'sales_desc', minPrice: '10', maxPrice: '99', brand: 'Acme' }));
report('C1 servidor le q, categoryTree (aparado), condicao, attrs (JSON), ordem permitida, preco e marca', sf.q === 'celular' && sf.categoryTree === 'cat_cel' && sf.condition === 'usado' && JSON.stringify(sf.attrs) === '{"sistema":["Android"],"ram":{"min":8}}' && sf.sort === 'sales_desc' && sf.minPrice === 10 && sf.maxPrice === 99 && sf.brand === 'Acme', sf);
const bad = parsePublicCatalogFilters(req({ attrs: '{lixo', sort: 'DROP TABLE', categoryTree: '   ', q: ['a', 'b'] }));
report('C2 entrada hostil nao quebra: attrs invalido vira vazio, ordem desconhecida e ignorada, categoryTree vazio e ignorado, q nao-texto ignorado', JSON.stringify(bad.attrs) === '{}' && bad.sort === undefined && bad.categoryTree === undefined && bad.q === undefined, bad);
report('C3 sem attrs nada e enviado ao servico (undefined)', parsePublicCatalogFilters(req({})).attrs === undefined);

// ---------- D. painel de filtros (SSR do componente real)
const facets: CatalogFacets = {
  total: 12,
  brands: [{ value: 'Acme', count: 7 }, { value: 'Beta', count: 5 }],
  conditions: [{ value: 'new', count: 10 }, { value: 'used', count: 2 }],
  price: { min: 300, max: 2000 },
  ignoredAttributes: [],
  attributes: [
    { code: 'sistema', name: 'Sistema', type: 'select', unit: null, decimals: null, displayGroup: null, options: [{ value: 'Android', count: 8 }, { value: 'iOS', count: 4 }] },
    { code: 'conectividade', name: 'Conectividade', type: 'multiselect', unit: null, decimals: null, displayGroup: null, options: Array.from({ length: 11 }, (_, i) => ({ value: `Op${i}`, count: 11 - i })) },
    { code: 'agua', name: 'Resistente à água', type: 'boolean', unit: null, decimals: null, displayGroup: null, bool: { yes: 6, no: 0 } },
    { code: 'ram', name: 'Memória RAM', type: 'number', unit: 'GB', decimals: 0, displayGroup: null, range: { min: 2, max: 16 } },
  ],
};
const sel = { condition: 'all' as const, attrs: {} };
const noop = () => {};
const render = (over: any = {}) => renderToStaticMarkup(<CatalogFacetsPanel facets={facets} selection={sel} showAttributes onBrand={noop} onCondition={noop} onPrice={noop} onAttrs={noop} {...over} />);
const html = render();
report('D1 selecao: opcoes com contagem (Android 8, iOS 4) como caixas de marcar', /Android<\/span><span[^>]*>8</.test(html) && /iOS<\/span><span[^>]*>4</.test(html) && (html.match(/type="checkbox"/g) || []).length >= 4);
report('D2 muitas opcoes: mostra 8 e o resto atras de "Ver todas (3 a mais)"', /Ver todas \(3 a mais\)/.test(html) && /<details/.test(html));
report('D3 Sim/Nao: so oferece "Sim" (6) porque "Nao" tem 0 resultado; sempre com "Todos"', /Sim<\/span><span[^>]*>6</.test(html) && !/>Não</.test(html.slice(html.indexOf('facet-attr-agua'), html.indexOf('facet-attr-ram'))) && /Todos/.test(html));
report('D4 numero: titulo com unidade "Memória RAM (GB)", caixas minimo/maximo com a faixa real (2 e 16) como dica', /Memória RAM \(GB\)/.test(html) && /placeholder="2"/.test(html) && /placeholder="16"/.test(html) && /aria-label="Memória RAM: mínimo"/.test(html));
report('D5 preco com a faixa existente (300 a 2000) e marca com contagens; condicao so com o que existe (Novo 10, Usado 2)', /placeholder="300"/.test(html) && /placeholder="2000"/.test(html) && /Acme<\/span><span[^>]*>7</.test(html) && /Novo<\/span><span[^>]*>10</.test(html) && /Usado<\/span><span[^>]*>2</.test(html));
const htmlSel = render({ selection: { brand: 'Beta', condition: 'usado', priceMin: 500, attrs: { sistema: ['iOS'], conectividade: ['Op9'], agua: true, ram: { min: 4, max: 8 } } } });
report('D6 estado selecionado: caixa marcada (iOS), opcao escolhida escondida em "ver mais" continua visivel (Op9), Sim marcado, marca e condicao marcadas, valores nos campos', /checked=""[^>]*\/><span[^>]*>iOS/.test(htmlSel) && /Op9<\/span>/.test(htmlSel.slice(0, htmlSel.indexOf('<details') > 0 ? htmlSel.indexOf('<details') : undefined)) && /name="facet-bool-agua"[^>]*checked=""|checked=""[^>]*name="facet-bool-agua"/.test(htmlSel) && /value="4"/.test(htmlSel) && /value="500"/.test(htmlSel), htmlSel.slice(0, 200));
report('D7 sem categoria (showAttributes=false) NAO mostra caracteristicas, so condicao/preco/marca', !/facet-attr-/.test(render({ showAttributes: false })) && /facet-brand/.test(render({ showAttributes: false })));
report('D8 carregando sem dados: so condicao/preco (sem marca nem caracteristicas) e aria-busy', (() => { const h = render({ facets: undefined, isLoading: true }); return /aria-busy="true"/.test(h) && /facet-condition/.test(h) && !/facet-brand/.test(h) && !/facet-attr-/.test(h); })());
report('D9 erro: alerta com "Tentar novamente"', /role="alert"/.test(render({ isError: true, onRetry: noop })) && /Tentar novamente/.test(render({ isError: true, onRetry: noop })));
report('D10 opcao selecionada com 0 resultado segue na lista (para desmarcar) mostrando 0', /Zeta<\/span><span[^>]*>0</.test(render({ facets: { ...facets, attributes: [{ ...facets.attributes[0], options: [...facets.attributes[0].options!, { value: 'Zeta', count: 0 }] }] }, selection: { condition: 'all', attrs: { sistema: ['Zeta'] } } })));
report('D11 sem caracteristicas com resultado: aviso discreto "Sem outras caracteristicas para filtrar"', /Sem outras características para filtrar/.test(render({ facets: { ...facets, attributes: [] } })));
report('D12 nunca mostra codigos internos (sistema/conectividade so pelo nome)', !/>conectividade<|>sistema</.test(html));

// ---------- E. paginacao
report('E1 janela de paginas: 1, ..., atual-1, atual, atual+1, ..., ultima', JSON.stringify(pageWindow(10, 20)) === '[1,null,9,10,11,null,20]' && JSON.stringify(pageWindow(1, 3)) === '[1,2,3]' && JSON.stringify(pageWindow(1, 1)) === '[1]' && JSON.stringify(pageWindow(2, 20)) === '[1,2,3,null,20]');

// ---------- F. travas no codigo
const sr = fs.readFileSync('src/components/SearchResultsView.tsx', 'utf8');
report('F1 a tela busca no SERVIDOR (useCatalogSearch/useCatalogFacets), sem lista inteira no navegador (nada de useProducts nem filtragem local)', /useCatalogSearch\(listParams, queriesEnabled\)/.test(sr) && /useCatalogFacets\(facetParams, queriesEnabled\)/.test(sr) && !/import\s*\{[^}]*\buseProducts\b[^}]*\}/.test(sr) && !/filteredProducts/.test(sr));
report('F2 filtros e ordem voltam para a pagina 1; trocar de categoria limpa caracteristicas e marca', /updateFilterState = \(patch[\s\S]{0,200}setPage\(1\)/.test(sr) && /\[categoryRouteSlug\]/.test(sr) && /setAttrs\(\{\}\);\s*setBrand\(undefined\)/.test(sr));
report('F3 busca aproximada preservada: sem resultado no servidor, "Busca Inteligente" (sinonimos, correcao) sobre os mesmos filtros', /searchProductsIntelligent\(fallback\.data\.items, filterState\.query\)/.test(sr) && /const serverEmpty = /.test(sr));
report('F4 painel de filtros usado com caracteristicas so em pagina de categoria', /showAttributes=\{categoryMode\}/.test(sr));
report('F5 paginacao acessivel (nav com aria-label, aria-current) e lista com aria-busy durante a troca', /aria-label="Paginação dos resultados"/.test(sr) && /aria-current=\{n === page \? 'page' : undefined\}/.test(sr) && /aria-busy=\{catalog\.isFetching/.test(sr));
const api = fs.readFileSync('src/server/api.ts', 'utf8');
report('F6 rota /products/facets registrada ANTES de /products/:id', api.indexOf("apiRouter.get('/products/facets'") > 0 && api.indexOf("apiRouter.get('/products/facets'") < api.indexOf("apiRouter.get('/products/:id'"));
const af = fs.readFileSync('src/components/seller/ProductAttributeFields.tsx', 'utf8');
report('F7 mensagem do formulario do vendedor corrigida: sem prometer "relevancia", descreve ficha, pesquisa e filtros', !/aumentar a relevância/.test(af) && /ficha do produto/.test(af) && /pesquisa/.test(af) && /filtros da categoria/.test(af));

console.log(`\nRESULTADO: ${pass} PASS, ${fail} FAIL`);
process.exit(fail === 0 ? 0 : 1);
