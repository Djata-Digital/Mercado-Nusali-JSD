/**
 * CATEGORIAS - seletor de categoria do wizard de produto (SSR do componente REAL, categorias da taxonomia aprovada). Sem rede/banco.
 */
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider } from '../src/context/AuthContext.js';
import { PreferencesProvider } from '../src/context/PreferencesContext.js';
import { SellerProductWizard } from '../src/components/seller/SellerProductWizard.js';
import { buildCategoryTaxonomy } from '../src/data/categoryTaxonomy.js';

let pass = 0, fail = 0;
const report = (n: string, ok: boolean, d?: unknown) => { ok ? pass++ : fail++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}${ok ? '' : '  => ' + JSON.stringify(d ?? null).slice(0, 300)}`); };

const tax = buildCategoryTaxonomy().map((n) => ({ id: n.id, name: n.name, slug: n.slug, parentId: n.parentId, icon: n.icon, displayOrder: n.displayOrder, isActive: true }));
const qc = new QueryClient({ defaultOptions: { queries: { staleTime: Infinity, retry: false } } });
qc.setQueryData(['categories'], tax);
const html = renderToStaticMarkup(
  <QueryClientProvider client={qc}><AuthProvider><PreferencesProvider><MemoryRouter>
    <SellerProductWizard onAddProduct={() => {}} onUpdateProduct={() => {}} onOpenProductDetail={() => {}} showToast={() => {}} selectedStoreName="Loja" stores={[]} />
  </MemoryRouter></PreferencesProvider></AuthProvider></QueryClientProvider>
);
const sel = html.slice(html.indexOf('Categoria *'));
const pickerHtml = sel.slice(0, sel.indexOf('Condição do Produto'));
// (o select antigo com 30 <optgroup> foi substituído pelo seletor pesquisável — ver test-category-search-select.tsx)
report('W1 o campo Categoria é um combobox pesquisável (sem <select> de categoria)', /role="combobox"/.test(pickerHtml) && !/<select/.test(pickerHtml) && /for="product-category"/.test(html), pickerHtml.slice(0, 200));
report('W2 nada de lista gigante no HTML inicial: nenhuma das 322 categorias é renderizada até abrir', !/role="option"/.test(pickerHtml) && (pickerHtml.match(/<li/g) || []).length === 0, (pickerHtml.match(/<li/g) || []).length);
report('W3 nenhuma categoria pré-selecionada: campo vazio, com dica para pesquisar ou explorar', /value=""/.test(pickerHtml) && /Digite para pesquisar ou toque para explorar/.test(pickerHtml), pickerHtml.slice(0, 300));
report('W4 nenhum botão de limpar nem categoria escolhida ao abrir um cadastro novo', !/data-testid="category-clear"/.test(pickerHtml));
report('W5 sem aviso de "categoria possui subcategorias" ao abrir (nada selecionado)', !/possui subcategorias/.test(html));
console.log(`\nRESULTADO: ${pass} PASS, ${fail} FAIL`);
process.exit(fail ? 1 : 0);
