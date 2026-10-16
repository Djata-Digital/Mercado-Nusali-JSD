/**
 * LISTAGEM COMPACTA NO CELULAR (2 colunas, ~4 cartões por tela de conteúdo), categorias compactas com «Ver todas», página do produto no topo e
 * correção do ajuste rápido de estoque do vendedor — regras puras + travas de código. Sem rede/banco. A medição real (360/390/430 px) é feita no
 * navegador com os componentes reais (ver relatório).
 */
import fs from 'fs';
import { execSync } from 'child_process';
import { cardDiscountPercent, cardDeliveryLine, hasRealReviews } from '../src/utils/productCardInfo.js';
import { shouldScrollToTop } from '../src/utils/scrollToTopRule.js';
import { planQuickStockChange, quickStockErrorMessage } from '../src/utils/sellerQuickStock.js';

let pass = 0, fail = 0;
const report = (n: string, ok: boolean, d?: unknown) => { ok ? pass++ : fail++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}${ok ? '' : '  => ' + JSON.stringify(d ?? null).slice(0, 300)}`); };
const src = (p: string) => fs.readFileSync(p, 'utf8').split(String.fromCharCode(13, 10)).join(String.fromCharCode(10));

// ---- informações do cartão (nada inventado)
report('C1 desconto REAL calculado dos preços: 8000→7000 = 13%; sem preço original, igual, menor ou inválido = null (nunca um selo inventado)', cardDiscountPercent(7000, 8000) === 13 && cardDiscountPercent(100, undefined) === null && cardDiscountPercent(100, null) === null && cardDiscountPercent(100, 100) === null && cardDiscountPercent(100, 90) === null && cardDiscountPercent(0, 100) === null && cardDiscountPercent(NaN, 100) === null && cardDiscountPercent(1000, 1002) === null, [cardDiscountPercent(7000, 8000)]);
report('C2 linha de entrega verdadeira e curta: "Entrega para <país>" ou "Entrega a calcular"; sem frete grátis, sem prazo', cardDeliveryLine('Guiné-Bissau') === 'Entrega para Guiné-Bissau' && cardDeliveryLine('') === 'Entrega a calcular' && cardDeliveryLine(null) === 'Entrega a calcular' && !/grátis|dias|amanh/i.test(cardDeliveryLine('Brasil')));
report('C3 avaliação só com avaliações reais: nota e quantidade positivas; 0 (0), nulos e texto não mostram nada', hasRealReviews(4.5, 12) && !hasRealReviews(0, 0) && !hasRealReviews(4.8, 0) && !hasRealReviews(0, 5) && !hasRealReviews(null, null) && !hasRealReviews(undefined, 3) && !hasRealReviews('x', 'y'));

// ---- cartão (código)
const card = src('src/components/ProductCard.tsx');
report('C4 cartão: imagem QUADRADA sem corte (aspect-square + object-contain), nome em no máximo 2 linhas (line-clamp-2), preço e desconto real', card.includes('aspect-square') && card.includes('object-contain') && card.includes('line-clamp-2') && card.includes('cardDiscountPercent(priceValue, origPriceValue)') && card.includes('data-testid="product-card-discount"'));
report('C5 cartão: SEM avaliação fictícia (só com avaliações reais), SEM "Frete grátis", SEM prazo inventado ("8 a 12 dias"), SEM "Chega amanhã" e SEM fallback "|| 4.8"', card.includes('hasRealReviews(product.rating, product.reviewsCount)') && !/Entrega CPLP Global/.test(card) && !/estimatedDays/.test(card) && !/>\s*Frete\s+gr[aá]tis/i.test(card.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\{\/\*[\s\S]*?\*\/\}/g, '')) && !/\|\| 4\.8/.test(card));
report('C6 cartão: secundários (parcelas, kits, cores, selos de mídia, FULL, reputação, avaliações, condição) só a partir de sm; no celular sobram nome, preço, desconto, entrega e o botão', (card.match(/hidden sm:/g) || []).length >= 4 && card.includes('hidden sm:block space-y-1') && card.includes('hidden sm:flex absolute bottom-1.5'));
report('C7 botões preservados e acessíveis: favoritos (aria-pressed) e o botão de compra (aria-label com a ação e o nome; 40px no celular, favorito 32px); comportamento do Adicionar na seção A', card.includes('aria-label={favorited ?') && card.includes('aria-pressed={favorited}') && card.includes('toggleFavorite(product.id)') && card.includes('w-10 h-10') && card.includes('w-8 h-8') && card.includes('data-testid="product-card-buy"'));

// ---- grades 2 colunas
const home = src('src/pages/HomePage.tsx'), search = src('src/components/SearchResultsView.tsx'), store = src('src/components/StorePublicView.tsx'), fav = src('src/components/FavoritesView.tsx'), cats = src('src/pages/CategoriesPage.tsx');
const noOneCol = (t: string) => !/grid grid-cols-1 sm:grid-cols-2/.test(t.replace(/lg:grid-cols-12/g, ''));
report('G1 Home: as duas vitrines (ofertas e catálogo) e os esqueletos usam 2 COLUNAS no celular (grid-cols-2), nunca 1 produto por tela', (home.match(/grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2 sm:gap-4/g) || []).length === 4 && !/grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4/.test(home) && home.includes('h-56 sm:h-72'));
report('G2 Busca, categorias (mesma tela de resultados), loja e favoritos: 2 colunas no celular', search.includes('data-testid="catalog-grid" className={`grid grid-cols-2 md:grid-cols-3 gap-2 sm:gap-4') && /grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2 sm:gap-6/.test(store) && /grid grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-4/.test(fav) && noOneCol(search) && noOneCol(store) && noOneCol(fav));
report('G3 recomendações do produto já eram 2 por linha no celular (50% − gap) e usam o mesmo cartão compacto', /w-\[calc\(50%-0\.5rem\)\]/.test(src('src/components/ProductRecommendationsSection.tsx')));
report('G4 página de Categorias: 2 colunas no celular, cartão compacto, só as primeiras subcategorias + "Ver todas (N)"', cats.includes('data-testid="categories-grid" className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2 sm:gap-6"') && cats.includes('SUBCATEGORY_PREVIEW_MOBILE = 3') && cats.includes("idx >= SUBCATEGORY_PREVIEW_MOBILE ? 'hidden sm:block'") && cats.includes('Ver todas (${subs.length})') && cats.includes('Ver todas as ${subs.length} subcategorias'));

// ---- categorias compactas com «Ver todas»
const carousel = src('src/components/CategoryCarousel.tsx');
report('K1 Home no celular: faixa compacta de categorias (uma linha, rolagem horizontal) com as primeiras 8 e o atalho «Ver todas» para /categories; a grade alta fica só a partir de sm', carousel.includes('data-testid="category-strip"') && carousel.includes('sm:hidden flex gap-3 overflow-x-auto') && carousel.includes('HOME_CATEGORY_LIMIT_MOBILE = 8') && carousel.includes('data-testid="category-strip-all"') && carousel.includes('to="/categories"') && carousel.includes('hidden sm:grid grid-cols-4 lg:grid-cols-8'));

// ---- cabeçalho e banner
const header = src('src/components/Header.tsx'), banner = src('src/components/BannerSlider.tsx');
report('H1 o cabeçalho de 3 linhas NÃO é fixo no celular (relative; sticky só de md para cima) e a busca/menu continuam nele', header.includes('relative md:sticky md:top-0 z-40') && !/<header className=\{`sticky top-0/.test(header));
report('H2 banner da Home menos alto no celular (min-h 132px; setas ocultas; pré-visualização do admin com forced mantém o tamanho antigo)', banner.includes("forced ? 'py-10 min-h-[260px]' : 'py-4 min-h-[132px] sm:py-10 sm:min-h-[260px]'") && banner.includes('hidden sm:block absolute left-3') && banner.includes('hidden sm:block absolute right-3'));
report('H3 busca no celular: filtros recolhidos atrás do botão "Filtros" (aria-expanded), painel só abre ao tocar; em lg continua sempre visível', search.includes('data-testid="filters-toggle"') && search.includes('aria-expanded={filtersOpen}') && search.includes("${filtersOpen ? 'block' : 'hidden'} lg:block") && search.includes('lg:hidden inline-flex'));

// ---- abrir a página no topo
report('T1 regra de topo: navegação nova para OUTRA rota → topo; mesma rota (filtros/paginação), âncora (#), voltar/avançar (POP) e primeira carga → não mexe', shouldScrollToTop({ pathname: '/products' }, { pathname: '/products/p1' }, 'PUSH') && shouldScrollToTop({ pathname: '/' }, { pathname: '/products/p2' }, 'REPLACE') && shouldScrollToTop({ pathname: '/products/a' }, { pathname: '/products/b' }, 'PUSH') && !shouldScrollToTop({ pathname: '/products' }, { pathname: '/products' }, 'PUSH') && !shouldScrollToTop({ pathname: '/products' }, { pathname: '/products/p1', hash: '#specs' }, 'PUSH') && !shouldScrollToTop({ pathname: '/products/p1' }, { pathname: '/products' }, 'POP') && !shouldScrollToTop(null, { pathname: '/products/p1' }, 'PUSH'));
const app = src('src/App.tsx'), stt = src('src/components/ScrollToTop.tsx');
report('T2 o ScrollToTop está montado DENTRO do BrowserRouter (antes do <Routes>) e usa a regra pura + window.scrollTo(0, 0)', app.includes("import { ScrollToTop } from './components/ScrollToTop'") && /<SeoManager \/>[\s\S]{0,260}<ScrollToTop \/>[\s\S]{0,40}<Routes>/.test(app) && stt.includes('shouldScrollToTop(prev.current') && stt.includes('window.scrollTo(0, 0)') && stt.includes('useNavigationType()'));
report('T3 abrir o produto pelo cartão continua usando navigate(/products/:id) (PUSH) — logo a regra de topo se aplica ao clique no cartão, no título e na busca do cabeçalho', card.includes('navigate(`/products/${id}`)') && header.includes('navigate(`/products/${product.id}`)'));

// ---- estoque do vendedor
report('S1 ajuste rápido parte do FÍSICO real: físico 10 / reservado 4 / disponível 6 → +1 = 11 (antes gravava 7), −1 = 9', (() => { const p = { quantityOnHand: 10, quantityReserved: 4, stock: 6 }; const up = planQuickStockChange(p, 1), dn = planQuickStockChange(p, -1); return up.ok === true && (up as any).newOnHand === 11 && dn.ok === true && (dn as any).newOnHand === 9; })());
report('S2 nunca abaixo do reservado nem negativo: físico 5 / reservado 5 → −1 recusado (BELOW_RESERVED, com a quantidade); físico 0 → −1 recusado (NEGATIVE)', (() => { const a = planQuickStockChange({ quantityOnHand: 5, quantityReserved: 5, stock: 0 }, -1), b = planQuickStockChange({ quantityOnHand: 0, quantityReserved: 0, stock: 0 }, -1); return a.ok === false && (a as any).code === 'BELOW_RESERVED' && /5 unidade/.test((a as any).message) && b.ok === false && (b as any).code === 'NEGATIVE'; })());
report('S3 dado legado sem físico: reconstrói disponível + reservado (nunca trata o disponível como físico); ajuste inválido (0, NaN) recusado', (() => { const l = planQuickStockChange({ stock: 6, quantityReserved: 4 }, 1); const z = planQuickStockChange({ quantityOnHand: 3 }, 0); const n = planQuickStockChange({ quantityOnHand: 3 }, NaN as any); return l.ok === true && (l as any).newOnHand === 11 && z.ok === false && n.ok === false; })());
report('S4 mensagens do servidor viram texto claro: prefixo técnico removido; produto com variações explica "estoque por variação"; vazio → mensagem padrão', quickStockErrorMessage('Quantidade em estoque (2) não pode ser menor que o estoque já reservado (3).') === 'Quantidade em estoque (2) não pode ser menor que o estoque já reservado (3).' && /variações/.test(quickStockErrorMessage('VARIANT_REQUIRED: este produto tem variações — o estoque é informado por variação.')) && !/VARIANT_REQUIRED/.test(quickStockErrorMessage('VARIANT_REQUIRED: x')) && quickStockErrorMessage('SOME_CODE: falhou') === 'falhou' && /Não foi possível/.test(quickStockErrorMessage('')) && /Não foi possível/.test(quickStockErrorMessage(undefined)));
const list = src('src/components/seller/SellerProductsList.tsx'), hub = src('src/components/SellerHubView.tsx');
report('S5 a lista usa o plano puro e o endpoint DEDICADO (updateStock → PATCH /seller/products/:id/stock), NÃO reenvia o produto inteiro; só confirma depois da resposta e bloqueia cliques duplos', list.includes('planQuickStockChange(p as any, delta)') && list.includes('await onQuickStockChange(p.id, plan.newOnHand)') && !/onUpdateProduct/.test(list) && list.includes('stockBusyIds') && list.includes('disabled={stockBusyIds.includes(p.id)}') && hub.includes('SellerService.updateStock(id, newOnHand)') && hub.includes('onQuickStockChange={handleQuickStockChange}') && src('src/api/clients/SellerApi.ts').includes("apiClient.patch(`/seller/products/${id}/stock`, { stock })"));
report('S6 a mensagem de sucesso só aparece com o servidor confirmando; a falha mostra a mensagem real (inclui produto com variações)', /result\.ok\s*\?\s*`Estoque de/.test(list) && list.includes("result.message || 'Não foi possível alterar o estoque") && hub.includes('quickStockErrorMessage(') && hub.includes('await fetchSellerProducts()'));


// ---- botão Adicionar (propagação do clique) e carrinho
import { subscribeCartUpdates, emitCartUpdated } from '../src/services/cartEvents.js';
const buyBlock = card.slice(card.indexOf('const handleBuyClick'), card.indexOf('return (', card.indexOf('const handleBuyClick')));
report('A1 "Adicionar" NÃO propaga o clique ao cartão (e.stopPropagation() é a 1ª ação): clicar nele nunca abre a página do produto por engano', /const handleBuyClick = async \(e: React\.MouseEvent\) => \{\n\s+e\.stopPropagation\(\);/.test(card) && card.includes('onClick={handleBuyClick}'));
report('A2 produto COM variações obrigatórias: o botão ("Escolher opções") só leva à página do produto (no topo), onde cor/tamanho são escolhidos e validados — nunca adiciona sem variação', /if \(isVariableProduct\) \{\s+openProductDetail\(product\.id\);\s+return;\s+\}/.test(buyBlock) && card.includes("'Escolher opções (cor, tamanho...) na página do produto'") && card.includes('data-variable={isVariableProduct ?') && card.includes('ListChecks'));
report('A3 produto simples: adiciona 1 unidade pelo serviço do carrinho (CartService.addItem), mostra o resultado REAL (sucesso ou a mensagem do servidor) e continua na listagem; clique duplo bloqueado enquanto adiciona', buyBlock.includes('await CartService.addItem(product, 1)') && buyBlock.includes("showToast('Produto adicionado ao carrinho.')") && buyBlock.includes("err?.message || 'Não foi possível adicionar ao carrinho") && buyBlock.includes('if (adding) return;') && card.includes('disabled={adding}') && !/navigate\(/.test(buyBlock));
report('A4 imagem e nome continuam abrindo o produto: imagem → openProductDetail; nome é link real (/products/:id) com stopPropagation (não navega duas vezes)', /className="relative w-full aspect-square[^"]*" onClick=\{\(\) => openProductDetail\(product\.id\)\}/.test(card) && card.includes('to={`/products/${encodeURIComponent(product.id)}`}') && /onClick=\{\(e\) => e\.stopPropagation\(\)\}\s+className="block"/.test(card));
report('A5 bloqueio da Guiné-Bissau preservado e nada de checkout/pagamento no botão', /CHECKOUT_ENABLED_COUNTRIES[^=]*=\s*\[\s*\]/.test(src('src/utils/checkoutAvailability.ts')) && !/checkout|payment|escrow/i.test(buyBlock));
const seen: number[] = []; const unsub = subscribeCartUpdates((items) => { seen.push(items.length); }); const bad = subscribeCartUpdates(() => { throw new Error('assinante com erro'); }); const seen2: number[] = []; const unsub2 = subscribeCartUpdates((items) => { seen2.push(items.length); });
emitCartUpdated([{} as any, {} as any]); unsub(); emitCartUpdated([{} as any]); unsub2(); bad();
report('A6 contador do cabeçalho: emitCartUpdated avisa TODOS os assinantes (um com erro não impede os outros) e unsubscribe para de avisar', seen.join() === '2' && seen2.join() === '2,1');
const useCartSrc = src('src/hooks/useCart.ts');
report('A7 useCart assina as mudanças e TODAS as mutações emitem o aviso (add, lote, quantidade, remover, limpar)', useCartSrc.includes('subscribeCartUpdates((updated) => setItems([...updated]))') && (useCartSrc.match(/emitCartUpdated\(updated\)/g) || []).length === 5);
report('A8 o cartão não chama mais useCart (antes cada cartão de uma lista disparava uma leitura do carrinho ao montar)', !/useCart\(/.test(card) && !card.includes('hooks/useCart'));

// ---- escopo: nada financeiro/frete/pagamento/checkout/pedidos tocado
const changed = [...execSync('git diff --name-only main', { encoding: 'utf8' }).split(/\r?\n/), ...execSync('git ls-files --others --exclude-standard', { encoding: 'utf8' }).split(/\r?\n/)].filter(Boolean);
const forbidden = changed.filter((f) => /^(src\/server\/modules\/(shipping|payments|orders|ledger|wallet|escrow)|src\/db|drizzle|scripts)\//.test(f) || (/(payment|escrow|subsid|shipping|checkout|ledger|wallet)/i.test(f) && !f.startsWith('scratch/') && !f.startsWith('tests/')));
report('X1 escopo: nenhum módulo de frete, subsídio, pagamentos, pedidos, carteira/Escrow, ledger, checkout, banco/esquema/migração ou script foi alterado (diff contra main) — só listagens, carrinho (aviso de atualização), estoque do vendedor e o formulário', forbidden.length === 0, forbidden); // depois do merge o diff contra main é vazio e o guarda passa; numa branch nova ele protege o escopo

console.log(`\nRESULTADO: ${pass} PASS, ${fail} FAIL`);
process.exit(fail ? 1 : 0);
