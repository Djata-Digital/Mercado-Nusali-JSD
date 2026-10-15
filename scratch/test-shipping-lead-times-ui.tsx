/**
 * PRAZOS ESTIMADOS (interface) — texto do prazo ("2 a 4 dias", "Prazo a confirmar"), seletor do checkout com preço + prazo, resumo,
 * editor do painel (separado das faixas de peso, responsivo) e travas de código. Sem rede/banco.
 */
import React from 'react';
import fs from 'fs';
import { renderToStaticMarkup } from 'react-dom/server';
import { ShippingServiceSelector } from '../src/components/checkout/ShippingServiceSelector.js';
import { ShippingLeadTimeEditor } from '../src/components/admin/ShippingLeadTimeEditor.js';
import { describeLeadTime, leadTimeLine, validateLeadTimeForm, leadTimeErrorMessage, LEAD_TIME_UNCONFIRMED, LEAD_TIME_DISCLAIMER } from '../src/utils/shippingLeadTime.js';

let pass = 0, fail = 0;
const report = (n: string, ok: boolean, d?: unknown) => { ok ? pass++ : fail++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}${ok ? '' : '  => ' + JSON.stringify(d ?? null).slice(0, 300)}`); };
const src = (p: string) => fs.readFileSync(p, 'utf8').split(String.fromCharCode(13, 10)).join(String.fromCharCode(10));

// ---- texto
report('P1 describeLeadTime: faixa, valor único, 1 dia e "Prazo a confirmar" para null/ausente/inválido (nunca inventa)', describeLeadTime({ minDays: 2, maxDays: 4 }) === '2 a 4 dias' && describeLeadTime({ minDays: 3, maxDays: 3 }) === '3 dias' && describeLeadTime({ minDays: 1, maxDays: 1 }) === '1 dia'
  && [null, undefined, {}, { minDays: 0, maxDays: 3 }, { minDays: 5, maxDays: 2 }, { minDays: 1.5, maxDays: 2 }].every((v) => describeLeadTime(v as any) === LEAD_TIME_UNCONFIRMED) && LEAD_TIME_UNCONFIRMED === 'Prazo a confirmar');
report('P2 leadTimeLine: "Prazo estimado: 2 a 4 dias" ou "Prazo a confirmar"; sem "dias úteis", sem datas e sem "garantido"', leadTimeLine({ minDays: 2, maxDays: 4 }) === 'Prazo estimado: 2 a 4 dias' && leadTimeLine(null) === 'Prazo a confirmar' && !/úteis|garant|até o dia|\d{1,2}\/\d{1,2}/i.test(leadTimeLine({ minDays: 2, maxDays: 4 })));
report('P3 aviso: prazos são estimativas e não garantem a data', /estimativas/.test(LEAD_TIME_DISCLAIMER) && /não garantem/.test(LEAD_TIME_DISCLAIMER));
report('P4 validação do formulário do painel: vazio, não inteiro, <1, mín>máx, >365 rejeitados; válidos aceitos', ['', ' '].every((v) => validateLeadTimeForm(v, '3') !== null) && validateLeadTimeForm('1.5', '3') !== null && validateLeadTimeForm('0', '3') !== null && validateLeadTimeForm('-2', '3') !== null && validateLeadTimeForm('5', '3') !== null && validateLeadTimeForm('1', '366') !== null && validateLeadTimeForm('abc', '3') !== null && validateLeadTimeForm('1', '365') === null && validateLeadTimeForm('3', '3') === null && validateLeadTimeForm('2', '4') === null);
report('P5 erro do backend sem código técnico', leadTimeErrorMessage('LEAD_TIME_INVALID: o prazo mínimo não pode ser maior que o prazo máximo.') === 'o prazo mínimo não pode ser maior que o prazo máximo.' && leadTimeErrorMessage('').length > 10);

// ---- seletor do checkout
const fmt = (n: number) => `${n.toLocaleString('pt-PT')} XOF`;
const opt = (code: string, charged: number, leadTime?: { minDays: number; maxDays: number } | null) => ({ code, name: code, available: true, shippingChargedToBuyer: charged, shippingCost: charged, currency: 'XOF', ...(leadTime !== undefined ? { leadTime } : {}) });
const off = (code: string) => ({ code, name: code, available: false, unavailableCode: 'SHIPPING_RATE_NOT_AVAILABLE', unavailableMessage: 'Não há tarifa de frete cadastrada para esta rota e faixa de peso.' });
const html = (options: any[], selectedCode: string | null = null) => renderToStaticMarkup(<ShippingServiceSelector options={options as any} selectedCode={selectedCode} onSelect={() => {}} loading={false} formatAmount={fmt} />);
const h = html([opt('ECONOMY', 800, null), opt('STANDARD', 1500, { minDays: 2, maxDays: 4 }), opt('EXPRESS', 3000, { minDays: 1, maxDays: 1 })]);
report('P6 cada serviço mostra preço em XOF E o seu prazo: Standard 1 500 XOF + "Prazo estimado: 2 a 4 dias"; Express "1 dia"', /1[\s .]?500 XOF/.test(h) && /shipping-service-leadtime-STANDARD[^>]*>Prazo estimado: 2 a 4 dias</.test(h) && /shipping-service-leadtime-EXPRESS[^>]*>Prazo estimado: 1 dia</.test(h), h.slice(0, 200));
report('P7 prazo não configurado (null ou ausente): "Prazo a confirmar", sem inventar', /shipping-service-leadtime-ECONOMY[^>]*>Prazo a confirmar</.test(h) && /shipping-service-leadtime-STANDARD[^>]*>Prazo a confirmar</.test(html([opt('STANDARD', 1500)])));
const mix = html([off('ECONOMY'), opt('STANDARD', 1500, { minDays: 2, maxDays: 4 })]);
report('P8 serviço indisponível não mostra prazo (nem preço): só o motivo', !/shipping-service-leadtime-ECONOMY/.test(mix) && /shipping-service-reason-ECONOMY/.test(mix) && /shipping-service-price-ECONOMY[^>]*>Indisponível</.test(mix));
report('P9 aviso "são estimativas" aparece quando há serviço disponível e some quando nenhum está disponível', /shipping-service-leadtime-disclaimer/.test(h) && !/shipping-service-leadtime-disclaimer/.test(html([off('ECONOMY'), off('STANDARD')])));
report('P10 o prazo não muda o preço mostrado nem a seleção (mesmos preços com e sem prazo)', /800 XOF/.test(h) && /1[\s .]?500 XOF/.test(h) && /3[\s .]?000 XOF/.test(h) && (html([opt('STANDARD', 1500)]).match(/1[\s .]?500 XOF/g) || []).length === 1);

// ---- editor do painel (SSR)
const ed = (p: Partial<React.ComponentProps<typeof ShippingLeadTimeEditor>>) => renderToStaticMarkup(<ShippingLeadTimeEditor serviceName="Standard" current={null} isBusy={false} onSave={async () => null} onRemove={async () => null} {...p} />);
const e0 = ed({}), e1 = ed({ current: { minDays: 2, maxDays: 4 } });
report('P11 sem prazo: mostra "Prazo a confirmar" e o botão "Configurar prazo" (sem remover)', /shipping-lead-time-current[^>]*>Prazo a confirmar</.test(e0) && /Configurar prazo/.test(e0) && !/shipping-lead-time-remove/.test(e0), e0.slice(0, 200));
report('P12 com prazo: mostra "2 a 4 dias", "Editar prazo" e "Remover" (com rótulos acessíveis)', /shipping-lead-time-current[^>]*>2 a 4 dias</.test(e1) && /Editar prazo/.test(e1) && /aria-label="Remover prazo estimado do serviço Standard"/.test(e1) && /aria-label="Editar prazo estimado do serviço Standard"/.test(e1));
report('P13 telemóvel: botões e linha empilham em <sm; alvos de toque de 44px', /flex-col sm:flex-row/.test(e1) && /min-h-\[44px\]/.test(e1) && /min-w-\[44px\]/.test(e1));

// ---- travas de código
const dr = src('src/components/admin/AdminShippingGeographyManager.tsx');
report('P14 "Gerenciar Rota": editor de prazo SEPARADO das faixas de peso, um por serviço, com salvar/remover via API de prazos', dr.includes('<ShippingLeadTimeEditor') && /AdminApi\.setShippingLeadTime\(routeId, serviceId, \{ minDays, maxDays \}\)/.test(dr) && /AdminApi\.removeShippingLeadTime\(routeId, serviceId\)/.test(dr) && dr.indexOf('<ShippingLeadTimeEditor') < dr.indexOf('svcRates.length === 0 && addingForService') && dr.includes('detail.leadTimes'));
report('P15 mensagens: sucesso diz que o checkout já mostra o prazo e que pedidos já feitos não mudam; erro vem traduzido', dr.includes('pedidos já feitos não mudam') && (dr.match(/leadTimeErrorMessage\(/g) || []).length >= 4 && dr.includes('"Prazo a confirmar" para este serviço'));
const co = src('src/components/CheckoutView.tsx');
report('P16 resumo do checkout: linha "Entrega:" com o prazo do serviço ESCOLHIDO (só quando há escolha)', /\{selectedOption && \(\s*<div[^>]*data-testid="checkout-lead-time"[\s\S]{0,300}leadTimeLine\(selectedOption\.leadTime\)/.test(co));
report('P17 o payload do pedido NÃO envia prazo (informativo): o servidor lê o prazo vigente e grava o snapshot', !/leadTime|estimatedDays|deliveryEstimate/i.test(co.slice(co.indexOf('OrdersApi.create({'), co.indexOf('OrdersApi.create({') + 900)));
const svc = src('src/server/modules/orders/orderService.ts');
report('P18 no pedido o prazo é só copiado para order_items: não participa de preço, frete, comissão, política nem da conferência do valor', svc.includes('loadLeadTimes(tx, shipmentPlan.shipments)') && svc.includes('deliveryEstimateMinDays: item.deliveryEstimateMinDays ?? null') && !/assertShippingQuoteMatches\([^)]*lead/i.test(svc) && !/lead/i.test(src('src/server/modules/shipping/shippingQuoteGuard.ts')));

report('P19 cabeçalho do painel: o aviso antigo "Ainda não conectado ao checkout" foi removido e o texto diz que tarifas e prazos são usados pelo checkout', !/Ainda não conectado ao checkout/i.test(dr) && !/NÃO integra ao checkout/.test(dr) && /prazos estimados de entrega de cada serviço, que o checkout usa/.test(dr));
report('P20 o editor de prazo é renderizado DENTRO do laço de serviços do drawer, logo abaixo do cabeçalho do serviço e antes das faixas — sem condição que o oculte', (() => {
  const i = dr.indexOf('(detail.services || []).map(');
  const j = dr.indexOf('<ShippingLeadTimeEditor', i);
  const k = dr.indexOf('svcRates.length === 0 && addingForService', i);
  const before = dr.slice(dr.lastIndexOf('return (', j), j);
  return i > 0 && j > i && j < k && !/&&\s*$|\?\s*$|if \(/.test(before.trim());
})());

console.log(`\nRESULTADO: ${pass} PASS, ${fail} FAIL`);
process.exit(fail ? 1 : 0);
