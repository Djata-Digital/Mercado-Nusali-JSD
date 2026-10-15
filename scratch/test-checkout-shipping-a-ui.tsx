/**
 * ETAPA A (interface) — o frete nunca aparece como "GRÁTIS" por indisponibilidade ou antes do cálculo; selo legado de frete grátis por
 * produto removido; sem promessa de prazo não configurado. Regra pura + travas no código dos componentes. Sem rede/banco.
 */
import fs from 'fs';
import { describeShippingLine, SHIPPING_LINE_LABEL, type ShippingLineInput } from '../src/utils/shippingDisplay.js';

let pass = 0, fail = 0;
const report = (n: string, ok: boolean, d?: unknown) => { ok ? pass++ : fail++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}${ok ? '' : '  => ' + JSON.stringify(d ?? null).slice(0, 300)}`); };
const src = (p: string) => fs.readFileSync(p, 'utf8').split(String.fromCharCode(13, 10)).join(String.fromCharCode(10));
const st = (o: Partial<ShippingLineInput>): ShippingLineInput => ({ loading: false, ready: true, available: true, shippingChargedToBuyer: 0, shippingCost: 0, ...o });

report('A1 antes do primeiro cálculo (ready=false) → "calculando", nunca grátis', describeShippingLine(st({ ready: false })) === 'calculating' && describeShippingLine(st({ ready: false, available: true, shippingChargedToBuyer: 0 })) === 'calculating');
report('A2 recalculando (loading) → "calculando" mesmo com valor antigo na tela', describeShippingLine(st({ loading: true, shippingChargedToBuyer: 1500, shippingCost: 1500 })) === 'calculating');
report('A3 indisponível com cobrado 0 → "indisponível" (NUNCA grátis)', describeShippingLine(st({ available: false, shippingChargedToBuyer: 0, shippingCost: 0 })) === 'unavailable' && SHIPPING_LINE_LABEL.unavailable === 'Indisponível');
report('A4 valor cobrado > 0 → "pago"', describeShippingLine(st({ shippingChargedToBuyer: 1500, shippingCost: 1500 })) === 'paid');
report('A5 cobrado 0 com custo real > 0 (subsídio do vendedor/plataforma) → "grátis por política"', describeShippingLine(st({ shippingChargedToBuyer: 0, shippingCost: 1500 })) === 'free_by_policy' && SHIPPING_LINE_LABEL.free_by_policy === 'GRÁTIS');
report('A6 cobrado 0 e custo 0 sem subsídio (tarifa zero) → "sem custo", não "grátis" por oferta', describeShippingLine(st({ shippingChargedToBuyer: 0, shippingCost: 0 })) === 'no_cost' && SHIPPING_LINE_LABEL.no_cost === 'Sem custo de frete');

const co = src('src/components/CheckoutView.tsx'), cart = src('src/components/CartView.tsx');
report('A7 checkout: estado inicial "não calculado" (ready=false, sem opções) e o frete só existe se um serviço ESCOLHIDO está disponível — nunca disponível/grátis por padrão', co.includes('({ loading: false, ready: false, options: [] })') && /available: !!selectedOption/.test(co));
report('A8 checkout: usa a regra única e não tem mais "GRÁTIS" por valor zero', co.includes("describeShippingLine(freightQuote)") && !/shippingChargedToBuyer === 0\s*\n?\s*\? 'GRÁTIS'/.test(co) && !/=== 0\s*\?\s*'GRÁTIS'/.test(co));
report('A9 checkout: total só aparece definitivo com frete calculado e disponível; senão "Calculando frete..." / "Total definido após o frete"', co.includes('checkout-grand-total-pending') && co.includes('Total definido após o frete') && /freightQuote\.ready && freightQuote\.available && !freightQuote\.loading/.test(co));
report('A10 checkout: ao recalcular marca loading/ready=false (o valor antigo deixa de ser definitivo) e o botão de pagar exige frete disponível', co.includes('loading: true, ready: false') && co.includes('disabled={isProcessing || freightQuote.loading || !freightQuote.available'));
report('A11 carrinho: frete só conta quando disponível e não recalculando; null/loading → "Calculando"; grátis só com custo real > 0', cart.includes('shippingQuote?.available && !shippingQuote.loading') && cart.includes('shippingQuote === null || shippingQuote.loading') && cart.includes("describeShippingLine({ loading: false, ready: true, available: true, shippingChargedToBuyer: shippingQuote.shippingChargedToBuyer, shippingCost: shippingQuote.shippingCost as number })"));

const badges = ['src/components/CartView.tsx', 'src/components/Header.tsx', 'src/components/ProductCard.tsx', 'src/components/ProductShareModal.tsx'];
report('A12 selo legado "FRETE GRÁTIS" por produto (shipping.freeShipping) removido dos 4 lugares', badges.every((f) => !/shipping\?\.freeShipping\s*&&/.test(src(f))) && badges.every((f) => !/⚡ ?(Frete Gr|FRETE GR)/.test(src(f))), badges.filter((f) => /shipping\?\.freeShipping\s*&&/.test(src(f))));
report('A13 promessa "Chega amanhã" (prazo não configurado) removida do cartão de produto', !/Chega amanhã<|>\s*Chega amanhã/.test(src('src/components/ProductCard.tsx').replace(/\{\/\*[\s\S]*?\*\/\}/g, '')));
report('A14 dados e filtros do backend intocados (a flag continua no esquema, só o selo saiu)', /freeShipping/.test(src('src/db/schema.ts')) && src('src/components/ProductCard.tsx').includes('fullFulfilled'));

console.log(`\nRESULTADO: ${pass} PASS, ${fail} FAIL`);
process.exit(fail ? 1 : 0);
