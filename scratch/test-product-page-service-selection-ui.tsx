/**
 * ESCOLHA DO SERVIÇO DE ENTREGA NA PÁGINA DO PRODUTO — utilitário puro (reconciliação, total estimado, armazenamento), marcação selecionável,
 * persistência entre produto → carrinho → checkout e travas de código (sem segundo motor de preço, checkout da Guiné-Bissau desligado). Sem rede/banco.
 */
import React from 'react';
import fs from 'fs';
import { execSync } from 'child_process';
import { renderToStaticMarkup } from 'react-dom/server';
import { ProductDeliveryOptions } from '../src/components/ProductDeliveryOptions.js';
import { SERVICE_STORAGE_KEY, readStoredServiceCode, writeStoredServiceCode, reconcileServiceSelection, findSelectedOption, estimateTotalWithShipping } from '../src/utils/shippingServiceSelection.js';

let pass = 0, fail = 0;
const report = (n: string, ok: boolean, d?: unknown) => { ok ? pass++ : fail++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}${ok ? '' : '  => ' + JSON.stringify(d ?? null).slice(0, 300)}`); };
const src = (p: string) => fs.readFileSync(p, 'utf8').split(String.fromCharCode(13, 10)).join(String.fromCharCode(10));
const fmt = (n: number) => `${n} XOF`;

const opt = (code: string, charged: number, extra: any = {}) => ({ code, name: code, available: true, shippingChargedToBuyer: charged, shippingCost: charged, shippingMarketplaceSubsidy: 0, shippingCoveredBy: null, currency: 'XOF', leadTime: null, ...extra }) as any;
const ECO = opt('ECONOMY', 100), STD = opt('STANDARD', 200), EXP = opt('EXPRESS', 300);
const ready = (options: any[]) => ({ status: 'ready' as const, options });

// ---- utilitário: reconciliação da escolha
report('S1 sem escolha: nada muda, nenhum aviso', JSON.stringify(reconcileServiceSelection(null, ready([ECO, STD]))) === JSON.stringify({ code: null, notice: null }));
report('S2 cotação pronta e serviço ainda disponível: a escolha é mantida (sem aviso) e o preço novo vem da cotação', (() => { const r = reconcileServiceSelection('STANDARD', ready([ECO, { ...STD, shippingChargedToBuyer: 250 }, EXP])); return r.code === 'STANDARD' && r.notice === null; })());
report('S3 serviço deixou de estar disponível (ou sumiu da cotação): a escolha é REMOVIDA com aviso e NUNCA trocada por outro em silêncio', (() => {
  const a = reconcileServiceSelection('EXPRESS', ready([ECO, STD, { ...EXP, available: false }]));
  const b = reconcileServiceSelection('EXPRESS', ready([ECO, STD]));
  return a.code === null && /Express/.test(a.notice || '') && b.code === null && /Express/.test(b.notice || '');
})());
report('S4 sem endereço / entrega indisponível / produto fora do país (idle): a escolha é removida com aviso', ['needs_address', 'unavailable', 'idle'].every((st) => { const r = reconcileServiceSelection('STANDARD', { status: st as any, options: [] }); return r.code === null && /removida/.test(r.notice || ''); }));
report('S5 calculando, variação por escolher ou falha de rede: a escolha é MANTIDA (nada se sabe ainda) e sem aviso', ['loading', 'needs_variant', 'to_calculate'].every((st) => { const r = reconcileServiceSelection('STANDARD', { status: st as any, options: [] }); return r.code === 'STANDARD' && r.notice === null; }));

// ---- total estimado: produto + frete DO SERVIDOR; sem dado válido não há total
report('S6 total estimado = produto + frete do serviço escolhido (centavos exatos)', estimateTotalWithShipping(1000, STD, 'XOF') === 1200 && estimateTotalWithShipping(1999.99, opt('X', 0.01), 'XOF') === 2000 && estimateTotalWithShipping(500, opt('X', 0), 'XOF') === 500);
report('S7 sem opção, indisponível, valor ausente/NaN/negativo ou moeda diferente: NÃO há total (nunca vira "frete grátis")', [
  estimateTotalWithShipping(1000, null, 'XOF'),
  estimateTotalWithShipping(1000, { ...STD, available: false }, 'XOF'),
  estimateTotalWithShipping(1000, { ...STD, shippingChargedToBuyer: undefined }, 'XOF'),
  estimateTotalWithShipping(1000, { ...STD, shippingChargedToBuyer: NaN }, 'XOF'),
  estimateTotalWithShipping(1000, { ...STD, shippingChargedToBuyer: -5 }, 'XOF'),
  estimateTotalWithShipping(1000, { ...STD, currency: 'BRL' }, 'XOF'),
  estimateTotalWithShipping(NaN, STD, 'XOF'),
].every((v) => v === null));
report('S8 findSelectedOption só devolve serviço DISPONÍVEL', findSelectedOption([ECO, STD], 'STANDARD')?.code === 'STANDARD' && findSelectedOption([ECO, { ...STD, available: false }], 'STANDARD') === null && findSelectedOption([ECO], null) === null && findSelectedOption([ECO], 'EXPRESS') === null);

// ---- armazenamento (sessionStorage) — só o código; tolera falta/erro de armazenamento
const store: Record<string, string> = {};
(globalThis as any).window = { sessionStorage: { getItem: (k: string) => (k in store ? store[k] : null), setItem: (k: string, v: string) => { store[k] = v; }, removeItem: (k: string) => { delete store[k]; } } };
writeStoredServiceCode('EXPRESS');
const savedOnlyCode = store[SERVICE_STORAGE_KEY] === 'EXPRESS' && Object.keys(store).length === 1;
writeStoredServiceCode(null);
report('S9 grava SÓ o código na chave do checkout (nunca preço/prazo) e remove ao limpar; ler devolve o código', savedOnlyCode && readStoredServiceCode() === null && (() => { writeStoredServiceCode('ECONOMY'); return readStoredServiceCode() === 'ECONOMY'; })() && SERVICE_STORAGE_KEY === 'nusali_checkout_shipping_service');
(globalThis as any).window = { sessionStorage: { getItem: () => { throw new Error('bloqueado'); }, setItem: () => { throw new Error('bloqueado'); }, removeItem: () => { throw new Error('bloqueado'); } } };
let threw = false; try { writeStoredServiceCode('X'); writeStoredServiceCode(null); readStoredServiceCode(); } catch { threw = true; }
report('S10 armazenamento bloqueado: nenhuma exceção (a escolha vale só na tela) e leitura devolve null', !threw && readStoredServiceCode() === null);
delete (globalThis as any).window;
report('S11 sem window (SSR): leitura null e escrita sem erro', readStoredServiceCode() === null);

// ---- marcação selecionável
const full = [ECO, STD, EXP];
const sel = renderToStaticMarkup(<ProductDeliveryOptions state={ready(full)} formatAmount={fmt} selectedCode="STANDARD" onSelect={() => {}} estimatedTotalText="5200 XOF" />);
report('S12 Economy/Standard/Express viram opções de rádio (name único) e SÓ a escolhida vem marcada, com "Selecionado" e data-selected', (sel.match(/type="radio"/g) || []).length === 3 && /name="product-delivery-service"/.test(sel) && (sel.match(/checked=""/g) || []).length === 1 && /product-delivery-selected-STANDARD/.test(sel) && !/product-delivery-selected-(ECONOMY|EXPRESS)/.test(sel) && /data-testid="product-delivery-option-STANDARD"[^>]*data-selected="true"/.test(sel) && /data-testid="product-delivery-option-ECONOMY"[^>]*data-selected="false"/.test(sel), sel.slice(0, 300));
report('S13 grupo acessível: radiogroup com nome, rádios dentro de <label> (alvo ≥44px) e foco visível', /role="radiogroup"/.test(sel) && /aria-label="Serviço de entrega"/.test(sel) && /min-h-\[44px\]/.test(sel) && /focus-within:ring-2/.test(sel) && (sel.match(/<label /g) || []).length === 3);
report('S14 total estimado aparece com a escolha e traz o valor formatado; preço, prazo e subsídio de cada opção continuam visíveis', /product-delivery-estimated-total/.test(sel) && /Total estimado \(produto \+ entrega\): 5200 XOF/.test(sel) && /100 XOF/.test(sel) && /200 XOF/.test(sel) && /300 XOF/.test(sel) && /product-delivery-leadtime-EXPRESS/.test(sel));
const none = renderToStaticMarkup(<ProductDeliveryOptions state={ready(full)} formatAmount={fmt} selectedCode={null} onSelect={() => {}} estimatedTotalText={null} />);
report('S15 sem escolha: nenhuma opção marcada, dica "Escolha o serviço..." e NENHUM total estimado', (none.match(/checked=""/g) || []).length === 0 && /product-delivery-choose-hint/.test(none) && !/product-delivery-estimated-total/.test(none) && !/Selecionado/.test(none));
const noTotal = renderToStaticMarkup(<ProductDeliveryOptions state={ready(full)} formatAmount={fmt} selectedCode="STANDARD" onSelect={() => {}} estimatedTotalText={null} />);
report('S16 escolha sem total válido (estimativa null): a linha de total não aparece (nada inventado)', !/product-delivery-estimated-total/.test(noTotal));
const mixed = renderToStaticMarkup(<ProductDeliveryOptions state={ready([{ ...ECO, available: false, unavailableMessage: 'Sem tarifa' }, STD, EXP])} formatAmount={fmt} selectedCode="ECONOMY" onSelect={() => {}} />);
report('S17 serviço indisponível não é selecionável (sem rádio, sem marca) mesmo que o código guardado seja o dele; mostra o motivo', (mixed.match(/type="radio"/g) || []).length === 2 && !/product-delivery-selected-ECONOMY/.test(mixed) && /product-delivery-reason-ECONOMY/.test(mixed) && /data-testid="product-delivery-option-ECONOMY"[^>]*data-selected="false"/.test(mixed));
const noticeHtml = renderToStaticMarkup(<ProductDeliveryOptions state={ready([ECO, STD])} formatAmount={fmt} selectedCode={null} onSelect={() => {}} notice="O serviço Express deixou de estar disponível." />);
report('S18 aviso de escolha removida aparece em role=status', /role="status"[^>]*data-testid="product-delivery-notice"|data-testid="product-delivery-notice"[^>]*>/.test(noticeHtml) && /Express deixou de estar disponível/.test(noticeHtml));
const free = renderToStaticMarkup(<ProductDeliveryOptions state={ready([{ ...STD, shippingChargedToBuyer: 0, shippingCost: 200, shippingMarketplaceSubsidy: 200, shippingCoveredBy: 'marketplace' }])} formatAmount={fmt} selectedCode="STANDARD" onSelect={() => {}} estimatedTotalText="1000 XOF" />);
report('S19 "GRÁTIS" só com custo real > 0 coberto (mesma regra de antes), também no modo selecionável', />GRÁTIS</.test(free) && /Frete custeado pela Nusali/.test(free));
const unconfirmed = renderToStaticMarkup(<ProductDeliveryOptions state={ready([{ code: 'STANDARD', name: 'Standard', available: true } as any])} formatAmount={fmt} selectedCode="STANDARD" onSelect={() => {}} estimatedTotalText={null} />);
report('S20 serviço sem valor devolvido pelo servidor: "Frete a calcular" — nunca GRÁTIS nem preço inventado', /Frete a calcular/.test(unconfirmed) && !/GRÁTIS/.test(unconfirmed) && !/product-delivery-estimated-total/.test(unconfirmed));
const ro = renderToStaticMarkup(<ProductDeliveryOptions state={ready(full)} formatAmount={fmt} />);
report('S21 sem onSelect a lista continua informativa (sem rádio/botão, sem total) — compatível com a prévia anterior', !/type="radio"|<button|checked/.test(ro) && !/product-delivery-estimated-total/.test(ro) && /escolhe o serviço de entrega no checkout/.test(ro));
for (const st of ['loading', 'needs_variant', 'needs_address', 'unavailable', 'to_calculate'] as const) {
  const h = renderToStaticMarkup(<ProductDeliveryOptions state={{ status: st, options: [], message: 'x' }} formatAmount={fmt} selectedCode="STANDARD" onSelect={() => {}} estimatedTotalText="9 XOF" />);
  if (!(!/type="radio"/.test(h) && !/product-delivery-estimated-total/.test(h) && !/GRÁTIS/.test(h))) { report(`S22 estado ${st} nunca mostra opções, total estimado nem GRÁTIS`, false, h.slice(0, 200)); }
}
report('S22 estados loading/needs_variant/needs_address/unavailable/to_calculate: sem rádios, sem total estimado e sem GRÁTIS', true);

const nn = (st: any) => renderToStaticMarkup(<ProductDeliveryOptions state={{ status: st, options: [], message: 'x' }} formatAmount={fmt} selectedCode={null} onSelect={() => {}} notice="Escolha removida." />);
report('S22b a escolha removida é DITA mesmo sem opções (sem endereço, indisponível, a calcular) e some do modo informativo', ['needs_address', 'unavailable', 'to_calculate'].every((st) => /product-delivery-notice/.test(nn(st)) && /Escolha removida/.test(nn(st))) && !/product-delivery-notice/.test(renderToStaticMarkup(<ProductDeliveryOptions state={{ status: 'needs_address', options: [] }} formatAmount={fmt} notice="x" />)));

// ---- travas de código: página do produto, carrinho, checkout
const pdv = src('src/components/ProductDetailView.tsx'), cart = src('src/components/CartView.tsx'), checkout = src('src/components/CheckoutView.tsx');
report('S23 página do produto: escolha guardada pelo utilitário compartilhado, reconciliada a cada cotação e nunca por um motor de preço próprio', pdv.includes("from '../utils/shippingServiceSelection'") && pdv.includes('reconcileServiceSelection(selectedServiceRef.current, next)') && pdv.includes('estimateTotalWithShipping(') && !/Rate|rateCard|tariff/i.test(pdv.slice(pdv.indexOf('const chooseService'), pdv.indexOf('if (!isValidId)'))));
report('S24 a cotação usa as linhas REAIS (variação + quantidade/kit; várias variações no modo multi) e re-cota quando qualquer uma muda (previewKey), além do setor de destino', pdv.includes('selectedKit ? selectedKit.quantity : quantity') && pdv.includes('multiVariantSummary.lines.map') && pdv.includes('}, [product?.id, previewKey, destinationShippingSectorId, previewNeedsVariant, isUnavailableForDestination]);'));
report('S25 produto fora do país / sem endereço / entrega indisponível limpam a escolha (publishDelivery com idle/needs_address) e a variação por escolher a mantém', /isUnavailableForDestination \|\| product\.availableForCountry === false\) \{\n\s+publishDelivery\(PRODUCT_DELIVERY_IDLE\)/.test(pdv) && /previewNeedsVariant\) \{\n\s+publishDelivery\(\{ status: 'needs_variant'/.test(pdv) && /!destinationShippingSectorId\) \{\n\s+publishDelivery\(\{ status: 'needs_address'/.test(pdv));
report('S26 "Adicionar ao carrinho" e "Comprar agora" (simples, multi, kit) reafirmam a escolha antes de navegar', (pdv.match(/persistServiceChoice\(\);\n\s+navigate\('\/(cart|checkout)'\)/g) || []).length === 4);
report('S27 o total estimado = produto (kit/quantidade ou subtotal multi) + frete do servidor; o preço principal e o preço enviado ao carrinho NÃO mudam (frete nunca entra em unitPriceOverride)', pdv.includes('isMultiVariantMode ? multiVariantSummary.subtotal : effectiveTotalOrderPrice') && pdv.includes('unitPriceOverride: effectiveUnitPrice,') && !/unitPriceOverride:[^\n]*(selectedService|estimatedTotal)/.test(pdv));
report('S28 checkout intacto e compatível: mesma chave literal, escolha lida ao abrir, revalidada a cada cotação e trocável na seção "2. Serviço de Entrega"', checkout.includes("const SERVICE_STORAGE_KEY = 'nusali_checkout_shipping_service';") && checkout.includes('useState<string | null>(readStoredService)') && checkout.includes('chooseService(null);') && checkout.includes('<ShippingServiceSelector') && checkout.includes('onSelect={(code) => chooseService(code)}'));
report('S29 carrinho mostra o serviço escolhido SÓ se ele ainda está disponível no preview do servidor (valor dele, rótulo "Frete (Standard):"); senão continua "a partir de"', cart.includes('findSelectedOption(services, readStoredServiceCode())') && cart.includes('Frete (${shippingQuote.selectedServiceTitle}):') && cart.includes("'Frete (a partir de):'") && cart.includes('Você pode alterá-lo no checkout.'));
report('S30 servidor revalida na criação do pedido (código + valor esperado exigidos; 409 se mudou) — rota e guarda inalteradas', (() => { const g = src('src/server/modules/shipping/shippingQuoteGuard.ts'); return g.includes('SHIPPING_QUOTE_CHANGED') && g.includes('expectedShippingChargedToBuyer') && /SHIPPING_QUOTE_CHANGED|shippingQuoteGuard/.test(src('src/server/modules/orders/orderService.ts')); })());
report('S31 checkout da Guiné-Bissau continua DESLIGADO (CHECKOUT_ENABLED_COUNTRIES vazio)', /CHECKOUT_ENABLED_COUNTRIES[^=]*=\s*\[\s*\]/.test(src('src/utils/checkoutAvailability.ts')));
// só o commit desta funcionalidade (955a21f), não o estado atual da árvore
const touched = execSync('git show --name-only --pretty=format: 955a21f', { encoding: 'utf8' }).split(/\r?\n/).filter(Boolean);
report('S32 nenhum arquivo de servidor, schema, migração, política, tarifa, subsídio, pagamento ou Escrow foi alterado nesta mudança', !touched.some((f) => /^(src\/server|src\/db|drizzle|scripts)\//.test(f)) && !touched.some((f) => /payment|escrow|subsid|tariff|policy/i.test(f) && !f.startsWith('scratch/')), touched.filter((f) => /^(src\/server|src\/db|drizzle|scripts)\//.test(f)));

console.log(`\nRESULTADO: ${pass} PASS, ${fail} FAIL`);
process.exit(fail ? 1 : 0);
