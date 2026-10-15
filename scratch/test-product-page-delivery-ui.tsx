/**
 * PÁGINA DO PRODUTO (interface) — prévia das opções de entrega: Economy/Standard/Express com preço e prazo, "Frete a calcular" / "Entrega
 * indisponível" nos casos certos, "GRÁTIS" só com confirmação do servidor (e dizendo quem custeia), sem seleção/preço inventado, compra imediata
 * bloqueada só com entrega definitivamente indisponível; coerência com carrinho e checkout (mesma regra). Sem rede/banco.
 */
import React from 'react';
import fs from 'fs';
import { renderToStaticMarkup } from 'react-dom/server';
import { ProductDeliveryOptions } from '../src/components/ProductDeliveryOptions.js';
import { ShippingServiceSelector } from '../src/components/checkout/ShippingServiceSelector.js';
import { deliveryStateFromQuote, deliveryBlocksPurchase, deliveryHeadline, PRODUCT_DELIVERY_IDLE, type ProductDeliveryState } from '../src/utils/productDeliveryState.js';
import { describeShippingLine, describeServiceOptionPrice, describeFreeShippingPayer, SHIPPING_LINE_LABEL } from '../src/utils/shippingDisplay.js';

let pass = 0, fail = 0;
const report = (n: string, ok: boolean, d?: unknown) => { ok ? pass++ : fail++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}${ok ? '' : '  => ' + JSON.stringify(d ?? null).slice(0, 300)}`); };
const src = (p: string) => fs.readFileSync(p, 'utf8').split(String.fromCharCode(13, 10)).join(String.fromCharCode(10));
const fmt = (n: number) => `${n.toLocaleString('pt-PT')} XOF`;

const svc = (code: string, charged: number, cost: number, lead: { minDays: number; maxDays: number } | null, coveredBy: any = null) => ({ code, name: code, available: true, shippingChargedToBuyer: charged, shippingCost: cost, currency: 'XOF', leadTime: lead, shippingCoveredBy: coveredBy });
const off = (code: string) => ({ code, name: code, available: false, unavailableCode: 'SHIPPING_RATE_NOT_AVAILABLE', unavailableMessage: 'Não há tarifa de frete cadastrada para esta rota e faixa de peso.' });
const html = (state: ProductDeliveryState) => renderToStaticMarkup(<ProductDeliveryOptions state={state} formatAmount={fmt} />);

// ---- regra de apresentação do valor
report('D1 "GRÁTIS" exige os DOIS números do servidor: custo real > 0 e cobrado 0; custo 0 = "Sem custo de frete"; qualquer valor ausente/inválido = "Frete a calcular"', describeShippingLine({ loading: false, ready: true, available: true, shippingChargedToBuyer: 0, shippingCost: 100 }) === 'free_by_policy' && describeShippingLine({ loading: false, ready: true, available: true, shippingChargedToBuyer: 0, shippingCost: 0 }) === 'no_cost' && [undefined, null, NaN, 'x', -5].every((bad) => describeShippingLine({ loading: false, ready: true, available: true, shippingChargedToBuyer: bad as any, shippingCost: 100 }) === 'unconfirmed' && describeShippingLine({ loading: false, ready: true, available: true, shippingChargedToBuyer: 0, shippingCost: bad as any }) === 'unconfirmed') && SHIPPING_LINE_LABEL.unconfirmed === 'Frete a calcular');
report('D2 indisponível/calculando nunca viram GRÁTIS, mesmo com cobrado 0', describeShippingLine({ loading: false, ready: true, available: false, shippingChargedToBuyer: 0, shippingCost: 100 }) === 'unavailable' && describeShippingLine({ loading: true, ready: true, available: true, shippingChargedToBuyer: 0, shippingCost: 100 }) === 'calculating');
report('D3 quem custeia é dito explicitamente: Nusali, vendedor ou ambos; comprador paga = sem nota', describeFreeShippingPayer('marketplace') === 'Frete custeado pela Nusali' && describeFreeShippingPayer('seller') === 'Frete custeado pelo vendedor' && describeFreeShippingPayer('shared') === 'Frete custeado pela Nusali e pelo vendedor' && describeFreeShippingPayer(null) === null && describeFreeShippingPayer(undefined) === null);
const eco = describeServiceOptionPrice(svc('ECONOMY', 0, 100, null, 'marketplace') as any, fmt), std = describeServiceOptionPrice(svc('STANDARD', 150, 200, null) as any, fmt);
report('D4 preço por serviço: grátis confirmado traz a nota; pago mostra o valor em XOF; indisponível mostra "Indisponível" sem valor', eco.kind === 'free_by_policy' && eco.note === 'Frete custeado pela Nusali' && std.kind === 'paid' && std.text === fmt(150) && describeServiceOptionPrice(off('X') as any, fmt).text === 'Indisponível');

// ---- estado da prévia a partir da cotação do servidor
const ok3 = { success: true, data: { available: true, serviceCode: 'ECONOMY', services: [svc('ECONOMY', 0, 100, { minDays: 2, maxDays: 3 }, 'marketplace'), svc('STANDARD', 0, 200, { minDays: 1, maxDays: 2 }, 'marketplace'), svc('EXPRESS', 0, 300, { minDays: 1, maxDays: 1 }, 'marketplace')] } } as any;
report('D5 cotação com serviços disponíveis → "ready" (prévia com as opções)', deliveryStateFromQuote(ok3).status === 'ready' && deliveryStateFromQuote(ok3).options.length === 3);
report('D6 sem setor de entrega → "needs_address" ("Frete a calcular"), não "indisponível"', deliveryStateFromQuote({ success: true, data: { available: false, code: 'DELIVERY_SECTOR_REQUIRED', message: 'Selecione um endereço', services: [] } } as any).status === 'needs_address');
const un = deliveryStateFromQuote({ success: true, data: { available: false, code: 'SHIPPING_RATE_NOT_AVAILABLE', message: 'Não há tarifa de frete cadastrada para esta rota e faixa de peso.', services: [off('ECONOMY'), off('STANDARD'), off('EXPRESS')] } } as any);
report('D7 sem tarifa/estoque/rota → "unavailable" ("Entrega indisponível") e é o ÚNICO estado que bloqueia a compra imediata', un.status === 'unavailable' && deliveryBlocksPurchase(un) && !deliveryBlocksPurchase(deliveryStateFromQuote(ok3)) && !deliveryBlocksPurchase(PRODUCT_DELIVERY_IDLE) && !deliveryBlocksPurchase({ status: 'needs_address', options: [] }) && !deliveryBlocksPurchase({ status: 'needs_variant', options: [] }) && !deliveryBlocksPurchase({ status: 'loading', options: [] }));
const fl = deliveryStateFromQuote({ success: false, error: { message: 'timeout' } } as any);
report('D8 falha de rede/servidor → "to_calculate" ("Frete a calcular"): nunca grátis e nunca indisponível definitivo; resposta vazia também', fl.status === 'to_calculate' && !deliveryBlocksPurchase(fl) && deliveryStateFromQuote(null).status === 'to_calculate' && deliveryStateFromQuote({ success: true, data: { available: true, services: [] } } as any).status === 'unavailable');

// ---- componente (SSR)
const ready = html(deliveryStateFromQuote(ok3));
report('D9 prévia: Economy, Standard e Express, cada um com preço e prazo ("Prazo estimado: 2 a 3 dias", "1 a 2 dias", "1 dia")', ['ECONOMY', 'STANDARD', 'EXPRESS'].every((c) => ready.includes(`product-delivery-option-${c}`)) && /Prazo estimado: 2 a 3 dias/.test(ready) && /Prazo estimado: 1 a 2 dias/.test(ready) && /Prazo estimado: 1 dia/.test(ready), ready.slice(0, 200));
report('D10 com a política padrão da plataforma: GRÁTIS aparece só junto de "Frete custeado pela Nusali" (nunca como se fosse oferta do vendedor)', (ready.match(/>GRÁTIS</g) || []).length === 3 && (ready.match(/Frete custeado pela Nusali/g) || []).length === 3 && !/pelo vendedor/.test(ready));
report('D11 a prévia NÃO tem seleção (sem radio/botão) nem preço escolhido: avisa que o serviço é escolhido no checkout e que prazos são estimativas', !/type="radio"|<button|checked/.test(ready) && /escolhe o serviço de entrega no checkout/.test(ready) && /estimativas e não garantem/.test(ready));
const noLead = html({ status: 'ready', options: [svc('STANDARD', 200, 200, null)] as any });
report('D12 serviço sem prazo cadastrado: "Prazo a confirmar" (nunca prazo inventado) e valor pago em XOF', /product-delivery-leadtime-STANDARD[^>]*>Prazo a confirmar</.test(noLead) && /200 XOF/.test(noLead) && !/GRÁTIS/.test(noLead));
const mixed = html({ status: 'ready', options: [off('ECONOMY'), svc('STANDARD', 200, 200, { minDays: 1, maxDays: 2 }), svc('EXPRESS', 300, 300, { minDays: 1, maxDays: 1 })] as any });
report('D13 serviço indisponível na lista: "Indisponível" + motivo, sem preço e sem prazo; os outros normais', /product-delivery-price-ECONOMY[^>]*>Indisponível</.test(mixed) && /product-delivery-reason-ECONOMY/.test(mixed) && !/product-delivery-leadtime-ECONOMY/.test(mixed) && /300 XOF/.test(mixed));
report('D14 "Entrega indisponível" com o motivo real (alerta); "Frete a calcular" sem endereço/variação/falha; carregando; idle não renderiza nada', /Entrega indisponível/.test(html(un)) && /Não há tarifa de frete/.test(html(un)) && /role="alert"/.test(html(un)) && /Frete a calcular/.test(html({ status: 'needs_address', options: [], message: 'Selecione um endereço de entrega para calcular o frete.' })) && /Frete a calcular/.test(html({ status: 'needs_variant', options: [] })) && /Frete a calcular/.test(html(fl)) && /Calculando entrega/.test(html({ status: 'loading', options: [] })) && html(PRODUCT_DELIVERY_IDLE) === '' && deliveryHeadline(un) === 'Entrega indisponível');
report('D15 nenhum estado sem cotação válida mostra "GRÁTIS" ou valor em XOF', [un, fl, { status: 'needs_address', options: [] } as ProductDeliveryState, { status: 'needs_variant', options: [] } as ProductDeliveryState, { status: 'loading', options: [] } as ProductDeliveryState].every((st) => !/GRÁTIS|XOF/.test(html(st))));

// ---- coerência com o checkout (mesmo componente de preço)
const selHtml = renderToStaticMarkup(<ShippingServiceSelector options={ok3.data.services} selectedCode={null} onSelect={() => {}} loading={false} formatAmount={fmt} />);
report('D16 checkout usa a MESMA regra: GRÁTIS com a nota de quem custeia, prazo por serviço, e valor ausente = "Frete a calcular" (nunca grátis)', (selHtml.match(/>GRÁTIS</g) || []).length === 3 && (selHtml.match(/Frete custeado pela Nusali/g) || []).length === 3 && /Prazo estimado: 2 a 3 dias/.test(selHtml) && /Frete a calcular/.test(renderToStaticMarkup(<ShippingServiceSelector options={[{ code: 'STANDARD', name: 'Standard', available: true } as any]} selectedCode={null} onSelect={() => {}} loading={false} formatAmount={fmt} />)) && !/GRÁTIS/.test(renderToStaticMarkup(<ShippingServiceSelector options={[{ code: 'STANDARD', name: 'Standard', available: true } as any]} selectedCode={null} onSelect={() => {}} loading={false} formatAmount={fmt} />)));

// ---- travas de código da página
const page = src('src/components/ProductDetailView.tsx'), cart = src('src/components/CartView.tsx'), sel = src('src/components/checkout/ShippingServiceSelector.tsx');
report('D17 a página do produto usa a cotação por serviço (getCartPreview) e o componente de prévia — sem o antigo "Frete (SERVIÇO): GRÁTIS" por valor ≤ 0', page.includes('ShippingService.getCartPreview(') && !page.includes('ShippingService.getPreview(') && page.includes('<ProductDeliveryOptions') && !/shippingChargedToBuyer > 0\s*\?\s*formatCurrency/.test(page) && !/'GRÁTIS'/.test(page));
report('D18 "Comprar agora": bloqueado só quando a entrega está definitivamente indisponível ("Entrega indisponível"); falta de endereço/variação não bloqueia por esta regra', (page.match(/deliveryBlocksPurchase\(deliveryState\)/g) || []).length >= 4 && page.includes("'Entrega indisponível'"));
report('D19 aviso claro quando o checkout online ainda não está liberado para o país (a página não promete compra que o checkout não conclui), sem alterar a liberação', page.includes('data-testid="product-checkout-not-available"') && page.includes('isOnlineCheckoutAvailable(selectedCountry)') && /CHECKOUT_ENABLED_COUNTRIES: readonly string\[\] = \[\];/.test(src('src/utils/checkoutAvailability.ts')));
report('D20 carrinho: custo ausente nunca vira GRÁTIS nem "sem custo" (usa "Frete a calcular"); seletor do checkout usa describeServiceOptionPrice', cart.includes('SHIPPING_LINE_LABEL.unconfirmed') && !cart.includes('shippingQuote.shippingCost ?? 0') && sel.includes('describeServiceOptionPrice(o, formatAmount)') && !/\?\? 0\) === 0/.test(sel));
report('D21 nenhum segundo motor de frete no frontend: a prévia só chama a API de cotação do servidor (ShippingService) e usa utilitários de TEXTO', !/shippingRouteRates|resolveSectorShippingQuote|calculateFreight/.test(page + src('src/components/ProductDeliveryOptions.tsx') + src('src/utils/productDeliveryState.ts')));

console.log(`\nRESULTADO: ${pass} PASS, ${fail} FAIL`);
process.exit(fail ? 1 : 0);
