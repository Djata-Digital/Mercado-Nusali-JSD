/**
 * ETAPA B (interface) — seletor de serviço de entrega: Economy/Standard/Express com preço do servidor, serviços indisponíveis com motivo,
 * sem prazos inventados, sem serviço pré-selecionado; checkout guarda só o CÓDIGO escolhido e o revalida a cada cotação. Sem rede/banco.
 */
import React from 'react';
import fs from 'fs';
import { renderToStaticMarkup } from 'react-dom/server';
import { ShippingServiceSelector } from '../src/components/checkout/ShippingServiceSelector.js';
import { shippingServiceLabel, compareShippingServices } from '../src/utils/shippingServiceLabels.js';
import { describeShippingLine } from '../src/utils/shippingDisplay.js';

let pass = 0, fail = 0;
const report = (n: string, ok: boolean, d?: unknown) => { ok ? pass++ : fail++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}${ok ? '' : '  => ' + JSON.stringify(d ?? null).slice(0, 300)}`); };
const src = (p: string) => fs.readFileSync(p, 'utf8').split(String.fromCharCode(13, 10)).join(String.fromCharCode(10));
const fmt = (n: number) => `${n.toLocaleString('pt-PT')} XOF`;
const opt = (code: string, charged: number, cost = charged) => ({ code, name: code, available: true, shippingChargedToBuyer: charged, shippingCost: cost, currency: 'XOF' });
const off = (code: string, message = 'Não há tarifa de frete cadastrada para esta rota e faixa de peso.') => ({ code, name: code, available: false, unavailableCode: 'SHIPPING_RATE_NOT_AVAILABLE', unavailableMessage: message });
const html = (p: Partial<React.ComponentProps<typeof ShippingServiceSelector>>) =>
  renderToStaticMarkup(<ShippingServiceSelector options={[]} selectedCode={null} onSelect={() => {}} loading={false} formatAmount={fmt} {...p} />);

const all3 = html({ options: [opt('ECONOMY', 800), opt('STANDARD', 1500), opt('EXPRESS', 3000)] as any });
report('B1 três serviços: Economy, Standard e Express com o rótulo certo e o preço do servidor em XOF', /Economy/.test(all3) && /Entrega económica/.test(all3) && /Standard/.test(all3) && /Entrega padrão/.test(all3) && /Express/.test(all3) && /Entrega expressa/.test(all3) && /800 XOF/.test(all3) && /1[\s .]?500 XOF/.test(all3) && /3[\s .]?000 XOF/.test(all3), all3.slice(0, 200));
report('B2 acessível: grupo de rádio com nome, um <input type="radio"> por serviço (visualmente oculto) e rótulo clicável', /role="radiogroup"/.test(all3) && (all3.match(/type="radio"/g) || []).length === 3 && (all3.match(/<label/g) || []).length === 3 && /class="sr-only"/.test(all3));
report('B3 NENHUM serviço pré-selecionado e dica "Escolha o serviço de entrega para continuar."', !/checked=""/.test(all3) && /Escolha o serviço de entrega para continuar\./.test(all3));
const sel = html({ options: [opt('ECONOMY', 800), opt('STANDARD', 1500)] as any, selectedCode: 'STANDARD' });
report('B4 serviço escolhido fica marcado (checked) e a dica some', (sel.match(/checked=""/g) || []).length === 1 && /value="STANDARD"[^>]*checked=""|checked=""[^>]*value="STANDARD"/.test(sel) && !/Escolha o serviço de entrega para continuar/.test(sel));
const mix = html({ options: [off('ECONOMY'), opt('STANDARD', 1500), opt('EXPRESS', 3000)] as any });
report('B5 serviço indisponível: marcado como "Indisponível", desabilitado, com o motivo e SEM preço', /data-testid="shipping-service-option-ECONOMY"[^>]*data-available="false"/.test(mix) && /shipping-service-price-ECONOMY[^>]*>Indisponível</.test(mix) && /shipping-service-reason-ECONOMY[^>]*>Não há tarifa/.test(mix) && /value="ECONOMY"[^>]*disabled=""|disabled=""[^>]*value="ECONOMY"/.test(mix) && !/0 XOF/.test(mix.split('shipping-service-option-STANDARD')[0]));
report('B6 escolher um serviço indisponível não marca nada (mesmo que o código venha selecionado)', !/checked=""/.test(html({ options: [off('ECONOMY'), opt('STANDARD', 1500)] as any, selectedCode: 'ECONOMY' })));
const none = html({ options: [off('ECONOMY'), off('STANDARD'), off('EXPRESS')] as any, unavailableMessage: 'Não há tarifa de frete cadastrada para esta rota e faixa de peso.' });
report('B7 nenhum disponível: alerta com o motivo e os três como indisponíveis (nunca frete 0)', /shipping-service-none-available/.test(none) && (none.match(/Indisponível</g) || []).length === 3 && !/GRÁTIS/.test(none));
report('B8 sem opções (ex.: endereço sem setor): alerta com a mensagem do servidor', /shipping-service-empty/.test(html({ options: [], unavailableMessage: 'Selecione/atualize seu endereço de entrega para calcular o frete.' })) && /Selecione\/atualize seu endereço/.test(html({ options: [], unavailableMessage: 'Selecione/atualize seu endereço de entrega para calcular o frete.' })));
report('B9 calculando: mostra o estado de carregamento e nenhuma opção/preço antigo', /shipping-service-loading/.test(html({ loading: true, options: [opt('STANDARD', 1500)] as any })) && !/1[\s .]?500 XOF/.test(html({ loading: true, options: [opt('STANDARD', 1500)] as any })) && /aria-busy="true"/.test(html({ loading: true })));
report('B10 aviso quando a escolha anterior deixou de valer (anunciado como status)', /role="status"[^>]*shipping-service-notice|shipping-service-notice[^>]*role="status"/.test(html({ options: [opt('STANDARD', 1500)] as any, notice: 'O serviço Express deixou de estar disponível.' })) && /deixou de estar disponível/.test(html({ options: [opt('STANDARD', 1500)] as any, notice: 'O serviço Express deixou de estar disponível.' })));
const freeP = html({ options: [opt('STANDARD', 0, 1500)] as any, selectedCode: 'STANDARD' });
const zeroT = html({ options: [opt('STANDARD', 0, 0)] as any });
report('B11 grátis só por política (custo real > 0 coberto) = "GRÁTIS"; custo 0 sem subsídio = "Sem custo de frete"', />GRÁTIS</.test(freeP) && />Sem custo de frete</.test(zeroT) && !/>GRÁTIS</.test(zeroT));
report('B12 NENHUM prazo é inventado: sem prazo configurado cada serviço disponível mostra só "Prazo a confirmar" (nunca dias, horas, "amanhã" ou datas)', [all3, sel].every((h) => (h.match(/Prazo a confirmar/g) || []).length >= 2 && !/\b\d+ ?(dias?|horas?)\b|amanhã|entrega em/i.test(h.replace(/Entrega (económica|padrão|expressa)/g, '').replace(/Os prazos são estimativas[^<]*/g, ''))), [all3].map((h) => h.match(/.{20}(dias|horas|amanhã).{20}/i)?.[0]));
report('B13 rótulos puros: ordem Economy → Standard → Express, outros serviços pelo próprio nome e sem descrição', ['EXPRESS', 'ECONOMY', 'STANDARD'].map((code) => ({ code })).sort(compareShippingServices).map((x) => x.code).join() === 'ECONOMY,STANDARD,EXPRESS' && shippingServiceLabel('economy').subtitle === 'Entrega económica' && shippingServiceLabel('XPTO', 'Serviço Especial').title === 'Serviço Especial' && shippingServiceLabel('XPTO', 'Serviço Especial').subtitle === null);
report('B14 resumo: com serviços disponíveis mas nenhum escolhido o frete é "Escolha o serviço" (não "grátis", não valor)', describeShippingLine({ loading: false, ready: true, available: false, needsSelection: true, shippingChargedToBuyer: 0, shippingCost: 0 }) === 'choose');

const co = src('src/components/CheckoutView.tsx');
report('B15 checkout: só o CÓDIGO do serviço é guardado (sessionStorage) e a escolha é revalidada a cada cotação — se o serviço sumiu, limpa e avisa (nunca troca por outro)', co.includes("'nusali_checkout_shipping_service'") && /if \(kept && !options\.some\(\(o\) => o\.code === kept && o\.available\)\) \{[\s\S]*chooseService\(null\)/.test(co) && co.includes('deixou de estar disponível para este carrinho e destino'));
report('B16 checkout: nunca escolhe um serviço automaticamente (sem "mais barato" por padrão)', !/chooseService\(options\.find|chooseService\(cheapest|setSelectedServiceCode\(options\[0\]/.test(co));
report('B17 checkout: o frete do resumo é DERIVADO do serviço escolhido e a troca de serviço atualiza o resumo sem nova chamada (opções já vêm do servidor)', /const selectedOption = useMemo\(/.test(co) && /shippingChargedToBuyer: selectedOption\?\.shippingChargedToBuyer \?\? 0/.test(co));
report('B18 checkout: o pedido leva só shippingServiceCode + o total que o cliente viu (o servidor recalcula)', /shippingServiceCode: selectedServiceCode,\s*expectedShippingChargedToBuyer: freightQuote\.shippingChargedToBuyer,/.test(co));
report('B19 checkout: falha de serviço indisponível limpa a escolha e recota; seção "2. Serviço de Entrega" antes do pagamento ("3.")', /code === 'SHIPPING_SERVICE_UNAVAILABLE'[\s\S]*chooseService\(null\)[\s\S]*setQuoteVersion/.test(co) && co.includes('2. Serviço de Entrega') && co.includes('3. Método de Pagamento') && co.indexOf('2. Serviço de Entrega') < co.indexOf('3. Método de Pagamento'));
report('B20 checkout: botão de pagar exige serviço escolhido e disponível (available derivado da escolha)', /disabled=\{isProcessing \|\| freightQuote\.loading \|\| !freightQuote\.available/.test(co) && /available: !!selectedOption/.test(co));
report('B21 carrinho continua "a partir de" (serviço mais barato) e o checkout é onde se escolhe', src('src/components/CartView.tsx').includes("'Frete (a partir de):'"));

console.log(`\nRESULTADO: ${pass} PASS, ${fail} FAIL`);
process.exit(fail ? 1 : 0);
