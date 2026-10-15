/**
 * GESTÃO DE SUBSÍDIOS DE FRETE (interface do Super Admin) — leitura da percentagem, textos, simulação (mesma aritmética do servidor), apresentação
 * do subsídio parcial na página do produto/checkout e travas de código do painel (confirmação, histórico, endpoints existentes). Sem rede/banco.
 */
import React from 'react';
import fs from 'fs';
import { renderToStaticMarkup } from 'react-dom/server';
import { ProductDeliveryOptions } from '../src/components/ProductDeliveryOptions.js';
import { parsePercentInput, describeConfigStatus, describeChange, isLegacyFreeModeActive, subsidyErrorMessage } from '../src/utils/shippingSubsidyForm.js';
import { simulateShippingSplit, splitIsExact } from '../src/utils/shippingSubsidyMath.js';
import { describeServiceOptionPrice } from '../src/utils/shippingDisplay.js';

let pass = 0, fail = 0;
const report = (n: string, ok: boolean, d?: unknown) => { ok ? pass++ : fail++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}${ok ? '' : '  => ' + JSON.stringify(d ?? null).slice(0, 300)}`); };
const src = (p: string) => fs.readFileSync(p, 'utf8').split(String.fromCharCode(13, 10)).join(String.fromCharCode(10));
const fmt = (n: number) => `${n} XOF`;

// ---- percentagem digitada
const ok = (t: string) => { const r = parsePercentInput(t); return r.ok ? r.value : null; };
report('G1 percentagem: "0" é ZERO, "20", "12,5" (vírgula) e "100" são aceites; decimais até 2 casas', ok('0') === 0 && ok('20') === 20 && ok('12,5') === 12.5 && ok('12.50') === 12.5 && ok('100') === 100 && ok(' 75 ') === 75 && ok('0,01') === 0.01);
report('G2 recusadas: vazio, texto, negativo, >100, 3 casas, notação científica, expressões', ['', '  ', 'abc', '-1', '100,01', '101', '12,345', '1e2', '20%', '10+10', 'NaN', 'Infinity', '--5'].every((t) => !parsePercentInput(t).ok && parsePercentInput(t).error.length > 5));
report('G3 estado e histórico em texto claro (ativo 20%, desativado 0%, antes → depois, modo legado desativado)', describeConfigStatus({ enabled: true, percent: 20 }) === 'Ativo: 20%' && describeConfigStatus({ enabled: true, percent: 0 }) === 'Desativado (0%)' && describeConfigStatus({ enabled: false, percent: 50 }) === 'Desativado (0%)' && describeChange({ enabled: false, percent: 0 }, { enabled: true, percent: 20 }, true) === 'Desativado (0%) → Ativo: 20% · modo legado (Nusali assume 100%) desativado' && isLegacyFreeModeActive({ legacyDefaultMode: 'MARKETPLACE_FREE_SHIPPING' }) && !isLegacyFreeModeActive({ legacyDefaultMode: 'CUSTOMER_PAYS' }) && !isLegacyFreeModeActive({ legacyDefaultMode: null }));
report('G4 mensagens de erro do servidor traduzidas (outro administrador mexeu, impacto não confirmado, sem permissão)', /Outra pessoa alterou/.test(subsidyErrorMessage('CONFIG_CHANGED', 'x')) && /Confirme o impacto/.test(subsidyErrorMessage('IMPACT_CONFIRMATION_REQUIRED', 'x')) && /Administrador Geral/.test(subsidyErrorMessage('GLOBAL_ADMIN_REQUIRED', 'x')) && subsidyErrorMessage('OUTRO', 'texto do servidor') === 'texto do servidor' && subsidyErrorMessage(undefined, undefined).length > 5);

// ---- simulação do painel = conta do servidor
const sim = simulateShippingSplit(1000, 50, 50);
report('G5 simulação do painel: frete 1000, vendedor 50%, Nusali 50% → vendedor 500, Nusali 250, cliente 250 (soma exata)', sim.seller === 500 && sim.nusali === 250 && sim.buyer === 250 && splitIsExact(sim));
report('G6 simulação com 0%: Nusali 0 e cliente paga o saldo; com 100%: cliente 0 e vendedor igual; entradas inválidas não geram valores negativos', simulateShippingSplit(1000, 50, 0).nusali === 0 && simulateShippingSplit(1000, 50, 0).buyer === 500 && simulateShippingSplit(1000, 50, 100).buyer === 0 && simulateShippingSplit(1000, 50, 100).seller === 500 && [simulateShippingSplit(-5, 10, 10), simulateShippingSplit(1000, -10, 10), simulateShippingSplit(1000, 200, 10)].every((s) => s.seller >= 0 && s.nusali >= 0 && s.buyer >= 0 && splitIsExact(s)));

// ---- apresentação ao cliente
const partial = { code: 'STANDARD', name: 'Standard', available: true, shippingChargedToBuyer: 500, shippingCost: 1000, shippingMarketplaceSubsidy: 500, shippingCoveredBy: 'marketplace', currency: 'XOF', leadTime: null } as any;
const full = { ...partial, shippingChargedToBuyer: 0, shippingMarketplaceSubsidy: 1000 };
const pHtml = renderToStaticMarkup(<ProductDeliveryOptions state={{ status: 'ready', options: [partial] }} formatAmount={fmt} />);
report('G7 subsídio PARCIAL: o cliente vê o valor que paga (500 XOF) e a nota "Frete com subsídio da Nusali" — nunca "GRÁTIS"', /500 XOF/.test(pHtml) && /Frete com subsídio da Nusali/.test(pHtml) && !/GRÁTIS/.test(pHtml) && describeServiceOptionPrice(partial, fmt).kind === 'paid');
const fHtml = renderToStaticMarkup(<ProductDeliveryOptions state={{ status: 'ready', options: [full] }} formatAmount={fmt} />);
report('G8 subsídio de 100%: "GRÁTIS" com a nota de quem custeia (a Nusali); sem subsídio nenhum: valor pago sem nota', />GRÁTIS</.test(fHtml) && /Frete custeado pela Nusali/.test(fHtml) && !/Frete com subsídio/.test(renderToStaticMarkup(<ProductDeliveryOptions state={{ status: 'ready', options: [{ ...partial, shippingChargedToBuyer: 1000, shippingMarketplaceSubsidy: 0, shippingCoveredBy: null }] }} formatAmount={fmt} />)));

// ---- travas de código do painel
const panel = src('src/components/admin/AdminShippingSubsidyManager.tsx'), dash = src('src/components/AdminDashboardView.tsx'), api = src('src/api/clients/AdminApi.ts');
report('G9 secção "Gestão de Subsídios de Frete" existe no painel (menu Logística) e abre o componente', dash.includes("id: 'shipping_subsidy', label: 'Gestão de Subsídios de Frete'") && dash.includes("activeTab === 'shipping_subsidy' && <AdminShippingSubsidyManager"));
report('G10 o painel usa os endpoints dedicados via AdminApi (consulta, alteração, histórico) — sem fetch direto', api.includes("apiClient.get('/admin/shipping-subsidy')") && api.includes("apiClient.put('/admin/shipping-subsidy', data)") && api.includes("apiClient.get('/admin/shipping-subsidy/history'") && !/\bfetch\(/.test(panel));
report('G11 o painel mostra: configuração atual, ativar/desativar, percentagem (0–100 com decimais), simulação, histórico (data, utilizador, antes → depois) e o aviso do modo legado', ['subsidy-status', 'subsidy-enabled', 'subsidy-percent', 'sim-result', 'subsidy-history', 'subsidy-legacy-warning', 'Configuração atual', 'Simulação da divisão do frete', 'Histórico de alterações', 'Valor anterior → novo valor'].every((k) => panel.includes(k)));
report('G12 guardar exige confirmar o impacto: o botão "Guardar" abre a confirmação, "Confirmar e guardar" só habilita com a caixa marcada, e o pedido leva confirmImpact + os valores vistos (expected)', panel.includes('openConfirm') && panel.includes('disabled={!understood || saving}') && /AdminApi\.updateShippingSubsidy\(\{[\s\S]{0,200}confirmImpact: true[\s\S]{0,260}expected: \{ enabled: config\.enabled, percent: config\.percent \}/.test(panel));
report('G13 a simulação usa a MESMA aritmética do servidor (importada), nunca uma conta própria', panel.includes("from '../../utils/shippingSubsidyMath'") && panel.includes('simulateShippingSplit(cost, seller, effectiveDraftPercent)') && !/Math\.round\(.*\* *\(?percent/.test(panel));
report('G14 telemóvel: colunas empilhadas (grid-cols-1), alvos de toque de 44px, tabela do histórico rolável na horizontal e modal como folha inferior', panel.includes('grid grid-cols-1 sm:grid-cols-2') && (panel.match(/min-h-\[44px\]/g) || []).length >= 6 && panel.includes('overflow-x-auto') && panel.includes('items-end sm:items-center'));
report('G15 o painel avisa que pedidos já criados não são recalculados e que o vendedor nunca paga mais', /Pedidos já criados não são recalculados/.test(panel) && /vendedor nunca paga mais/.test(panel));

console.log(`\nRESULTADO: ${pass} PASS, ${fail} FAIL`);
process.exit(fail ? 1 : 0);
