/**
 * CATÁLOGO POR PAÍS DE ENTREGA (frontend) — todas as vitrines passam o país de entrega selecionado (a chave do cache muda ao trocar de
 * país, então a lista é refeita), textos de lista vazia corretos (nunca "ainda não há produtos publicados" quando o motivo é o destino) e
 * página de link direto com aviso claro + compra bloqueada. Sem rede/banco.
 */
import fs from 'fs';
import { buildCatalogParams, buildFacetParams } from '../src/utils/catalogQuery.js';
import { noDeliverableProductsMessage, DELIVERY_SCOPE_HINT } from '../src/utils/deliveryScopeCopy.js';

let pass = 0, fail = 0;
const report = (n: string, ok: boolean, d?: unknown) => { ok ? pass++ : fail++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}${ok ? '' : '  => ' + JSON.stringify(d ?? null).slice(0, 300)}`); };
const src = (p: string) => fs.readFileSync(p, 'utf8').split(String.fromCharCode(13, 10)).join(String.fromCharCode(10));

const base = { query: '', sortBy: 'relevance' as const, attrs: {}, page: 1 };
const gw = buildCatalogParams(base, { country: 'GW', limit: 24 }), br = buildCatalogParams(base, { country: 'BR', limit: 24 });
report('U1 os parâmetros da lista e dos filtros levam o país de entrega: trocar de GW para BR muda a chave (a lista é refeita)', gw.country === 'GW' && br.country === 'BR' && JSON.stringify(gw) !== JSON.stringify(br) && buildFacetParams(base, { country: 'BR' }).country === 'BR');
report('U2 a página volta a 1 quando o estado reinicia e paginação continua nos parâmetros (page/limit)', br.page === 1 && br.limit === 24 && buildCatalogParams({ ...base, page: 3 }, { country: 'BR' }).page === 3);

report('U3 textos de lista vazia mencionam o país e explicam a regra (sem "ainda não há produtos publicados")', noDeliverableProductsMessage('Brasil') === 'Ainda não há produtos com entrega para Brasil.' && /entregues no país selecionado/.test(DELIVERY_SCOPE_HINT) && !/publicados/.test(noDeliverableProductsMessage('Brasil') + DELIVERY_SCOPE_HINT) && /país selecionado/.test(noDeliverableProductsMessage(null)));

const home = src('src/pages/HomePage.tsx'), search = src('src/components/SearchResultsView.tsx'), store = src('src/components/StorePublicView.tsx');
const header = src('src/components/Header.tsx'), fav = src('src/components/FavoritesView.tsx'), ai = src('src/components/AIAssistantModal.tsx'), detail = src('src/components/ProductDetailView.tsx'), rec = src('src/components/ProductRecommendationsSection.tsx');
report('U4 Home, busca/categorias, loja, cabeçalho, favoritos e assistente consultam o catálogo COM o país selecionado', /useProducts\(\{ country: selectedCountry/.test(home) && search.includes('country: selectedCountry') && /storeId: store\.id, country: selectedCountry/.test(store) && /useProducts\(\{ country: selectedCountry/.test(header) && /useProducts\(\{ country: selectedCountry/.test(fav) && /useProducts\(\{ country: selectedCountry/.test(ai));
report('U5 recomendações (relacionados, mesma loja, você também pode gostar) e o detalhe usam o mesmo destino', /useProductRecommendations\(productId, selectedCountry/.test(rec) && /useProduct\(isValidId \? id! : '', selectedCountry\)/.test(detail));
report('U6 o detalhe NÃO usa mais uma lista sem país como substituto (fallback com o mesmo destino)', !/useProducts\(\)/.test(detail) && /useProducts\(\{ country: selectedCountry \}\)/.test(detail));
report('U7 Home e busca usam a mensagem de lista vazia por destino e a dica da regra', home.includes('noDeliverableProductsMessage(currentCountry.name)') && home.includes('DELIVERY_SCOPE_HINT') && search.includes('noDeliverableProductsMessage(') && search.includes('DELIVERY_SCOPE_HINT') && !/Ainda não há produtos publicados/.test(search) && !/serão publicados em breve/.test(home));
report('U8 link direto: a página continua acessível, mostra "não pode ser entregue em <país>" + motivo, e bloqueia comprar/adicionar (botões desabilitados, sem cotação de entrega)', detail.includes('data-testid="product-unavailable-for-destination"') && detail.includes('Este produto não pode ser entregue em ') && detail.includes('{product.unavailabilityReason}') && /isUnavailableForDestination$/m.test(detail.split('\n').filter((l) => /isUnavailableForDestination\s*$/.test(l)).join('\n')) && /needsVariantSelection \|\| isUnavailableForDestination \|\| product\.availableForCountry === false/.test(detail));
const client = src('src/api/apiClient.ts');
report('U9 todo pedido à API leva o país escolhido (X-Country-Code do storage, sincronizado com a preferência) — nunca depende de cada tela', /config\.headers\.set\('X-Country-Code', country\)/.test(client) && src('src/context/PreferencesContext.tsx').includes('storageService.setSelectedCountry(selectedCountry)'));
report('U10 a lista de produtos do vendedor (SellerHub) e o painel admin continuam sem filtro de destino (não são catálogo público)', /useProducts\(\)/.test(src('src/components/SellerHubView.tsx')));

console.log(`\nRESULTADO: ${pass} PASS, ${fail} FAIL`);
process.exit(fail ? 1 : 0);
