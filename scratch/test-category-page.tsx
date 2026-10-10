/**
 * Páginas /categories/:slug (SSR do SearchResultsView REAL com providers reais; sem rede, sem banco).
 * Os caches do react-query são pré-carregados com dados ARTIFICIAIS que imitam o contrato real do backend:
 *   GET /categories                      -> categorias ativas (com parentId)
 *   GET /products?categoryTree=<id>&q=.. -> (P3) produtos da categoria E das descendentes, filtrados e paginados NO SERVIDOR
 *                                           (resposta { items, pagination }); a chave do cache é a MESMA que a tela monta (buildCatalogParams).
 * O comportamento ponta a ponta contra o servidor/Postgres reais é verificado à parte (servidor local + banco descartável).
 */
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider } from '../src/context/AuthContext.js';
import { PreferencesProvider, usePreferences } from '../src/context/PreferencesContext.js';
import { SearchResultsPage } from '../src/pages/SearchResultsPage.js';
import { normalizeProduct } from '../src/utils/productUtils.js';
import { buildCatalogParams } from '../src/utils/catalogQuery.js';

let passed = 0, total = 0;
const report = (l: string, ok: boolean, d?: any) => { total++; if (ok) passed++; console.log(`[${ok ? 'PASS' : 'FAIL'}] ${l}${d !== undefined ? ' -> ' + JSON.stringify(d).slice(0, 220) : ''}`); };
const textOf = (html: string) => html.replace(/<[^>]+>/g, ' ').replace(/&#x27;/g, "'").replace(/&quot;/g, '"').replace(/\s+/g, ' ').trim();

// ---- dados artificiais
const cats = [
  { id: 'c_alim', name: 'Alimentos Teste', slug: 'alimentos-teste', parentId: null, isActive: true },
  { id: 'c_frut', name: 'Frutas Teste', slug: 'frutas-teste', parentId: 'c_alim', isActive: true },
  { id: 'c_mang', name: 'Manga Teste', slug: 'manga-teste', parentId: 'c_frut', isActive: true },
  { id: 'c_bana', name: 'Banana Teste', slug: 'banana-teste', parentId: 'c_frut', isActive: true },
  { id: 'c_elet', name: 'Eletronicos Teste', slug: 'eletronicos-teste', parentId: null, isActive: true },
  { id: 'c_vazia', name: 'Categoria Vazia Teste', slug: 'vazia-teste', parentId: null, isActive: true },
];
const raw = (id: string, title: string, categoryId: string) => ({ id, title, price: '100.00', currency: 'XOF', categoryId, stock: 5, countryCode: 'GW', image: 'https://example.invalid/p.jpg', sellerId: 'sel_x', storeId: 'sto_x' });
const P_MANGA = normalizeProduct(raw('p1', 'ZZManga Exclusiva', 'c_mang'));
const P_BANANA = normalizeProduct(raw('p2', 'ZZBanana Exclusiva', 'c_bana'));
const P_ELET = normalizeProduct(raw('p3', 'ZZFone Exclusivo', 'c_elet'));
const ALL = [P_MANGA, P_BANANA, P_ELET];
const byCategory: Record<string, any[]> = { c_mang: [P_MANGA], c_bana: [P_BANANA], c_elet: [P_ELET], c_frut: [], c_alim: [], c_vazia: [] };

// país/origem efetivos do PreferencesProvider (as chaves das queries dependem deles)
let prefs: any = null;
const Probe = () => { prefs = usePreferences(); return null; };
renderToStaticMarkup(<QueryClientProvider client={new QueryClient()}><AuthProvider><PreferencesProvider><Probe /></PreferencesProvider></AuthProvider></QueryClientProvider>);
const base = { country: prefs.selectedCountry, originCountryFilter: prefs.catalogOriginFilter };

type Seed = { categories?: any[] | 'error'; search?: 'none' | 'error' };
const descendants = (id: string): string[] => [id, ...cats.filter((c) => c.parentId === id).flatMap((c) => descendants(c.id))];
/** o "servidor": categoria + descendentes, texto no titulo, resposta no contrato { items, pagination } */
const serverPage = (categoryId: string | null, q: string) => {
  const tree = categoryId ? descendants(categoryId) : null;
  const catOf: Record<string, string> = { p1: 'c_mang', p2: 'c_bana', p3: 'c_elet' }; // normalizeProduct nao expoe categoryId
  const items = ALL.filter((p) => (!tree || tree.includes(catOf[p.id])) && (!q || p.title.toLowerCase().includes(q.toLowerCase())));
  return { items, pagination: { total: items.length, page: 1, limit: 24, totalPages: Math.max(1, Math.ceil(items.length / 24)) } };
};
const render = (url: string, seed: Seed = {}) => {
  // retryOnMount:false — sem isso o react-query reinicia queries em erro ao montar e o estado de falha simulado some.
  const qc = new QueryClient({ defaultOptions: { queries: { retryOnMount: false } } });
  const cache = qc.getQueryCache();
  const fail = (key: unknown[]) => cache.build(qc, { queryKey: key }).setState({ status: 'error', error: new Error('falha simulada'), data: undefined, fetchStatus: 'idle' } as any);
  if (seed.categories === 'error') fail(['categories']);
  else qc.setQueryData(['categories'], seed.categories ?? cats);
  const [path, qs = ''] = url.split('?');
  const q = new URLSearchParams(qs).get('q') || '';
  const seg = path.startsWith('/categories/') ? decodeURIComponent(path.slice('/categories/'.length)) : null;
  const cat = seg ? (seed.categories && seed.categories !== 'error' ? seed.categories : cats).find((c: any) => (c.slug === seg || c.id === seg) && c.isActive !== false) : null;
  if (!seg || cat) {
    const params = buildCatalogParams({ query: q, categoryTree: cat?.id, brand: undefined, condition: 'all', priceMin: undefined, priceMax: undefined, sortBy: 'relevance', attrs: {}, page: 1 }, { country: base.country, originCountryFilter: base.originCountryFilter, limit: 24 });
    const key = ['catalog-search', params];
    if (seed.search === 'error') fail(key); else if (seed.search !== 'none') qc.setQueryData(key, serverPage(cat?.id ?? null, q));
  }
  const html = renderToStaticMarkup(
    <QueryClientProvider client={qc}><AuthProvider><PreferencesProvider>
      <MemoryRouter initialEntries={[url]}>
        <Routes>
          <Route path="/products" element={<SearchResultsPage />} />
          <Route path="/search" element={<SearchResultsPage />} />
          <Route path="/categories/:slug" element={<SearchResultsPage />} />
        </Routes>
      </MemoryRouter>
    </PreferencesProvider></AuthProvider></QueryClientProvider>
  );
  return { html, t: textOf(html) };
};
const has = (t: string, ...titles: string[]) => titles.every((x) => t.includes(x));
const hasNone = (t: string, ...titles: string[]) => titles.every((x) => !t.includes(x));
const count = (t: string) => (t.match(/(\d+) produtos? encontrados?/) || [])[1];

// 1-2: categoria A não mostra produto exclusivo da B e vice-versa
let r = render('/categories/eletronicos-teste');
report('1. /categories/eletronicos-teste mostra só o produto de Eletrônicos (nada de Manga/Banana)', has(r.t, 'ZZFone Exclusivo') && hasNone(r.t, 'ZZManga', 'ZZBanana') && count(r.t) === '1', { n: count(r.t) });
r = render('/categories/manga-teste');
report('2a. /categories/manga-teste mostra só Manga (nada de Banana/Eletrônicos)', has(r.t, 'ZZManga Exclusiva') && hasNone(r.t, 'ZZBanana', 'ZZFone') && count(r.t) === '1');
r = render('/categories/banana-teste');
report('2b. /categories/banana-teste mostra só Banana (nada de Manga/Eletrônicos)', has(r.t, 'ZZBanana Exclusiva') && hasNone(r.t, 'ZZManga', 'ZZFone') && count(r.t) === '1');
report('2c. o título da página é o nome da categoria', /<h1[^>]*>\s*Banana Teste\s*<\/h1>/.test(r.html));

// hierarquia: pai inclui os filhos (produtos ficam nas folhas)
r = render('/categories/frutas-teste');
report('H1. categoria pai (Frutas) inclui Manga e Banana e exclui Eletrônicos', has(r.t, 'ZZManga Exclusiva', 'ZZBanana Exclusiva') && hasNone(r.t, 'ZZFone') && count(r.t) === '2', { n: count(r.t) });
r = render('/categories/alimentos-teste');
report('H2. categoria avó (Alimentos) inclui os netos e exclui Eletrônicos', has(r.t, 'ZZManga Exclusiva', 'ZZBanana Exclusiva') && hasNone(r.t, 'ZZFone'));
r = render('/categories/c_mang');
report('H3. o id da categoria também funciona como segmento (Header/Carousel usam slug || id)', has(r.t, 'ZZManga Exclusiva') && hasNone(r.t, 'ZZBanana', 'ZZFone'));

// 3: categoria válida sem produto -> estado vazio, NUNCA o catálogo completo
r = render('/categories/vazia-teste');
report('3. categoria válida sem produtos mostra estado vazio da categoria e nenhum produto do catálogo', has(r.t, 'Ainda não há produtos em Categoria Vazia Teste', 'Ver todos os produtos do catálogo') && hasNone(r.t, 'ZZManga', 'ZZBanana', 'ZZFone') && count(r.t) === '0', { n: count(r.t) });
r = render('/categories/frutas-teste', { search: 'none' });
// (frutas sem filhos carregados) -> pendente: nunca cai para o catálogo
report('3b. enquanto as consultas da categoria não terminam: "Carregando categoria" e nenhum produto', has(r.t, 'Carregando categoria') && hasNone(r.t, 'ZZManga', 'ZZBanana', 'ZZFone'));

// 4: slug inexistente / inativo
r = render('/categories/nao-existe');
report('4a. slug inexistente: "Categoria não encontrada", link para /categories e NENHUM produto', has(r.t, 'Categoria não encontrada', 'Ver todas as categorias') && hasNone(r.t, 'ZZManga', 'ZZBanana', 'ZZFone'));
r = render('/categories/oculta', { categories: [...cats, { id: 'c_ocul', name: 'Oculta', slug: 'oculta', parentId: null, isActive: false }] });
report('4b. categoria inativa é tratada como inexistente (nenhum produto)', has(r.t, 'Categoria não encontrada') && hasNone(r.t, 'ZZManga', 'ZZBanana', 'ZZFone'));
r = render('/categories/manga-teste', { categories: [] });
report('4c. lista de categorias vazia: não encontrada, nunca o catálogo', has(r.t, 'Categoria não encontrada') && hasNone(r.t, 'ZZManga', 'ZZBanana', 'ZZFone'));

// carregamento / falha nunca viram catálogo completo
const qcPending = (() => { // categorias ainda não carregadas
  const qc = new QueryClient(); qc.setQueryData(['products', base], ALL);
  return textOf(renderToStaticMarkup(<QueryClientProvider client={qc}><AuthProvider><PreferencesProvider><MemoryRouter initialEntries={['/categories/manga-teste']}><Routes><Route path="/categories/:slug" element={<SearchResultsPage />} /></Routes></MemoryRouter></PreferencesProvider></AuthProvider></QueryClientProvider>));
})();
report('5a. categorias ainda carregando: "Carregando categoria" e nenhum produto', has(qcPending, 'Carregando categoria') && hasNone(qcPending, 'ZZManga', 'ZZBanana', 'ZZFone'));
r = render('/categories/manga-teste', { categories: 'error' });
report('5b. falha ao carregar categorias: mensagem de erro e nenhum produto', has(r.t, 'Não foi possível carregar esta categoria agora') && hasNone(r.t, 'ZZManga', 'ZZBanana', 'ZZFone'));
r = render('/categories/frutas-teste', { search: 'error' });
report('5c. falha ao carregar produtos de uma categoria do escopo: mensagem de erro (não mostra lista parcial nem catálogo)', has(r.t, 'Não foi possível carregar esta categoria agora') && hasNone(r.t, 'ZZManga', 'ZZBanana', 'ZZFone'));

// 5: catálogo geral intacto
r = render('/products');
report('6. /products continua mostrando TODOS os produtos, título geral e sem estado de categoria', has(r.t, 'ZZManga Exclusiva', 'ZZBanana Exclusiva', 'ZZFone Exclusivo') && has(r.t, 'Todos os Produtos e Ofertas') && count(r.t) === '3' && hasNone(r.t, 'Categoria não encontrada', 'Carregando categoria'));
r = render('/products', { categories: 'error' });
report('6b. /products não depende de categorias nem das consultas por categoria (continua listando tudo)', has(r.t, 'ZZManga Exclusiva', 'ZZBanana Exclusiva', 'ZZFone Exclusivo'));

// 6: busca
r = render('/search?q=ZZBanana');
report('7a. busca textual (/search?q=) continua filtrando o catálogo geral', has(r.t, 'ZZBanana Exclusiva') && hasNone(r.t, 'ZZManga', 'ZZFone') && has(r.t, 'Resultados para "ZZBanana"') && !/ em /.test((r.t.match(/Resultados para "[^"]*"[^<]{0,30}/) || [''])[0]), { n: count(r.t) });
r = render('/products?q=ZZFone');
report('7b. /products?q= também continua filtrando', has(r.t, 'ZZFone Exclusivo') && hasNone(r.t, 'ZZManga', 'ZZBanana'));
r = render('/categories/frutas-teste?q=ZZManga');
report('7c. busca DENTRO da categoria: só o que casa E pertence à categoria; título cita a categoria', has(r.t, 'ZZManga Exclusiva', 'Resultados para "ZZManga" em Frutas Teste') && hasNone(r.t, 'ZZBanana', 'ZZFone'));
r = render('/categories/frutas-teste?q=ZZFone');
report('7d. busca por produto de OUTRA categoria dentro de Frutas não o traz (escopo respeitado)', hasNone(r.t, 'ZZFone Exclusivo'));

console.log(`\n=== RESULTADO: ${passed}/${total} ===`);
process.exit(passed === total ? 0 : 1);
