/**
 * FINAL-FIX - experiencia publica pre-soft-launch (frontend). Sem rede, sem banco.
 */
import fs from 'fs';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider } from '../src/context/AuthContext.js';
import { PreferencesProvider } from '../src/context/PreferencesContext.js';
import { HomePage } from '../src/pages/HomePage.js';
import { HelpCenterView } from '../src/components/HelpCenterView.js';
import { mockProducts } from '../src/data/mockData.js';

let pass = 0, fail = 0;
const report = (n: string, ok: boolean, d?: unknown) => { ok ? pass++ : fail++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}${ok ? '' : '  => ' + JSON.stringify(d ?? null).slice(0, 300)}`); };
const read = (f: string) => fs.readFileSync(f, 'utf8');
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:"'`])\/\/[^\r\n]*/g, '$1');
const text = (h: string) => h.replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/&#x27;/g, "'").replace(/\s+/g, ' ');

function render(el: React.ReactElement, seed?: (qc: QueryClient) => void) {
  const qc = new QueryClient({ defaultOptions: { queries: { staleTime: Infinity, retry: false } } });
  seed?.(qc);
  return renderToStaticMarkup(React.createElement(QueryClientProvider, { client: qc }, React.createElement(AuthProvider, null, React.createElement(PreferencesProvider, null, React.createElement(MemoryRouter, { initialEntries: ['/'] }, el)))));
}
const seedProducts = (data: any[]) => (qc: QueryClient) => {
  for (const origin of ['ALL', undefined]) for (const country of ['GW', 'BR', undefined]) qc.setQueryData(['products', { country, originCountryFilter: origin }], data);
  qc.setQueryData(['products', { country: 'GW', originCountryFilter: 'ALL' }], data);
};

// A. Home com catalogo vazio
const homeEmpty = text(render(React.createElement(HomePage), seedProducts([])));
report('A1 Home vazia: estado vazio das Ofertas ("Novas ofertas serao publicadas em breve")', homeEmpty.includes('Novas ofertas serão publicadas em breve.'), homeEmpty.slice(0, 400));
report('A2 Home vazia: estado vazio do catalogo ("Os primeiros produtos do Mercado Nusali serao publicados em breve")', homeEmpty.includes('Os primeiros produtos do Mercado Nusali serão publicados em breve.'));
report('A3 Home vazia: titulos mantidos e CTA de vendedor intacto', homeEmpty.includes('Ofertas do Dia') && homeEmpty.includes('Catálogo de Produtos Nacionais e Importados') && homeEmpty.includes('Criar minha conta'));

// B. Home com produtos: estados vazios somem
const p0 = { ...(mockProducts as any[])[0], featured: false, offerOfDay: false };
const homeNoFeat = text(render(React.createElement(HomePage), seedProducts([p0])));
report('B1 Home com produtos sem oferta: nenhuma mensagem de vazio e secao "Ofertas do Dia" omitida; catalogo mostra o produto', !homeNoFeat.includes('serão publicad') && !homeNoFeat.includes('Ofertas do Dia •') && homeNoFeat.includes('Catálogo de Produtos Nacionais e Importados'), homeNoFeat.slice(0, 500));
const p1 = { ...p0, featured: true };
const homeFeat = text(render(React.createElement(HomePage), seedProducts([p1])));
report('B2 Home com produto em destaque: secao "Ofertas do Dia" aparece e nenhuma mensagem de vazio', homeFeat.includes('Ofertas do Dia •') && !homeFeat.includes('serão publicad'));

// C. Central de Ajuda (visitante)
const help = render(React.createElement(HelpCenterView));
const helpT = text(help);
report('C1 Central de Ajuda: sem 24/7, sem "Nusali Express", sem impostos automaticos, sem rastreamento internacional', !/24\s?\/\s?7|Nusali Express|cálculo automático|impostos de importação|rastreamento internacional|código de rastreamento/i.test(helpT), helpT.match(/24\/7|Nusali Express|cálculo automático/gi));
report('C2 Central de Ajuda (visitante): menu da conta oculto (Minhas Compras, Cupons, Devolucoes, Disputas, Nusali Pay, Meu Perfil)', !/Minhas Compras|Cupons|Devoluções|Disputas|Nusali Pay|Meu Perfil|Mensagens/.test(helpT), helpT.slice(0, 200));
report('C3 Central de Ajuda: FAQ 1 (compras online ainda nao liberadas) preservado e FAQ de entrega neutro', helpT.includes('as compras online ainda não estão liberadas') && helpT.includes('Como vai funcionar a entrega dos produtos?') && helpT.includes('Opções de entrega em preparação'));
const helpSrc = strip(read('src/components/HelpCenterView.tsx'));
report('C4 Central de Ajuda: BuyerNavHeader so com isAuthenticated (usuario logado continua vendo o menu)', /\{isAuthenticated && <BuyerNavHeader \/>\}/.test(helpSrc));

// D. Footer
const lay = strip(read('src/layouts/PublicLayout.tsx'));
report('D1 Footer: sem "Logistics HUB", sem "Selo Vendedor Verificado", sem "Lisboa"', !/Logistics HUB|Selo Vendedor|Lisboa/.test(lay));
report('D2 Footer: "Verificacao de vendedores" + link "Venda no Mercado Nusali" -> /register; links legais intactos', /Verificação de vendedores/.test(lay) && /to="\/register"[^>]*>\s*Venda no Mercado Nusali/.test(lay) && /to="\/termos-de-uso"/.test(lay) && /to="\/politica-de-privacidade"/.test(lay));

// E. Header
const hdr = strip(read('src/components/Header.tsx'));
const feat = strip(read('src/config/features.ts'));
report('E1 flag SHOW_NUSALI_PAY_NAV = false', /export const SHOW_NUSALI_PAY_NAV = false;/.test(feat));
report('E2 Header: Nusali Pay (desktop e mobile) atras de SHOW_NUSALI_PAY_NAV', (hdr.match(/\{SHOW_NUSALI_PAY_NAV && \(\s*<button/g) || []).length === 2 && !/<button[^>]*>\s*<Wallet className="w-3\.5 h-3\.5" \/>\s*Nusali Pay/.test(hdr.replace(/\{SHOW_NUSALI_PAY_NAV && \([\s\S]*?<\/button>\s*\)\}/g, '')), (hdr.match(/SHOW_NUSALI_PAY_NAV/g) || []).length);
report('E3 Header: Disputas (desktop e mobile) so com isAuthenticated', (hdr.match(/\{isAuthenticated && \(\s*<button[^>]*\s*onClick=\{\(\) => (navigate\('\/disputes'\)|\{\s*navigate\('\/disputes'\))/g) || []).length === 2);
report('E4 Header: placeholder generico + aria-label; sem "celulares, notebooks"', /placeholder="Buscar produtos no Mercado Nusali"/.test(hdr) && /aria-label="Buscar produtos no Mercado Nusali"/.test(hdr) && !/celulares, notebooks/.test(hdr));
report('E5 Header: Lojas Oficiais, Explorar Catalogo, Ofertas do Dia, Categorias, Entrar/Criar Conta preservados', /Explorar Catálogo/.test(hdr) && /Lojas Oficiais/.test(hdr) && /Ofertas do Dia/.test(hdr) && />\s*Categorias\s*</.test(hdr));
const login = read('src/pages/LoginPage.tsx');
report('E6 login: frase aprovada pelo proprietario intocada', login.includes('Acesse suas compras, vendas e pagamentos com segurança'));

// F. Busca
const sr = strip(read('src/components/SearchResultsView.tsx'));
report('F1 busca: sem "MercadoLider Platinum" nem checkbox de nivel de vendedor', !/MercadoLíder|Platinum<|sellerPlatinumOnly: e\.target/.test(sr) && !/>Vendedor</.test(sr));
report('F2 busca: sem sugestoes "celular/smartphone/computador/televisao/fones" ', !/celular|smartphone|computador|televisão|fones de ouvido/i.test(sr));
report('F3 busca: nunca monta `para ""` (titulo com termo so quando ha termo); orientacao generica', /Nenhum produto encontrado para "\$\{filterState\.query\}"/.test(sr) && /Tente buscar por outro produto, categoria ou palavra-chave\./.test(sr) && /filterState\.query\s*\?\s*`Nenhum produto encontrado/.test(sr.replace(/\s+/g, ' ')));
report('F4 busca: catalogo todo vazio sem termo => "Ainda nao ha produtos publicados" + "Voltar para o inicio"', /Ainda não há produtos publicados/.test(sr) && /Voltar para o início/.test(sr));
// P3: o filtro de Condicao agora vive em CatalogFacetsPanel (usado pela busca)
report('F5 busca: filtro Condicao e ordenacao preservados; filtro de plataforma nao cria nivel de vendedor', /Condição/.test(fs.readFileSync('src/components/CatalogFacetsPanel.tsx', 'utf8')) && /CatalogFacetsPanel/.test(sr) && /Mais relevantes/.test(sr) && /sellerPlatinumOnly: false/.test(sr));

// G. nada no escopo proibido tocado
import { execSync } from 'child_process';
const changed = execSync('git diff --name-only', { encoding: 'utf8' }).split(String.fromCharCode(10)).map((l) => l.trim()).filter(Boolean);
report('G1 so frontend relacionado alterado (nada em src/server, src/db, drizzle, MarketplaceContext, LoginPage, R2)', changed.every((f) => ['src/components/Header.tsx','src/components/HelpCenterView.tsx','src/components/SearchResultsView.tsx','src/config/features.ts','src/layouts/PublicLayout.tsx','src/pages/HomePage.tsx'].includes(f)), changed);

console.log(`\nRESULTADO: ${pass} PASS, ${fail} FAIL`);
process.exit(fail ? 1 : 0);
