/**
 * PAINEL «Gestão de Subsídios de Frete» — regras por serviço e por país+serviço: travas de código (precedência, origem efetiva, simulação por
 * modalidade, aviso do modo legado, confirmação com diferenças, payload com `rules` e `expected.rules`, sem componente interno que perde o foco) e
 * contratos da API. Sem rede/banco. A interação real foi verificada no navegador com uma API simulada (ver relatório).
 */
import fs from 'fs';
import { buildEffectiveRows, rulesToDraft } from '../src/utils/shippingSubsidyForm.js';
import { buildEffectiveRows, rulesToDraft } from '../src/utils/shippingSubsidyForm.js';

let pass = 0, fail = 0;
const report = (n: string, ok: boolean, d?: unknown) => { ok ? pass++ : fail++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}${ok ? '' : '  => ' + JSON.stringify(d ?? null).slice(0, 300)}`); };
const src = (p: string) => fs.readFileSync(p, 'utf8').split(String.fromCharCode(13, 10)).join(String.fromCharCode(10));
const panel = src('src/components/admin/AdminShippingSubsidyManager.tsx'), api = src('src/api/clients/AdminApi.ts'), form = src('src/utils/shippingSubsidyForm.ts');
const rules = src('src/utils/shippingSubsidyRules.ts'), calc = src('src/server/modules/shipping/shippingCalculatorService.ts'), admin = src('src/server/modules/shipping/shippingSubsidyAdminService.ts');

report('UI1 secção de regras com editor por serviço (geral "*:SERVIÇO") e por país+serviço, estado Sem regra/Ativa/Desativada e percentagem', ['subsidy-rules', 'rules-general', 'rules-country', 'rule-state-', 'rule-percent-', 'Sem regra (herda)', 'Desativada (herda)', 'Remover'].every((k) => panel.includes(k)));
report('UI2 a precedência e as regras de 0%/desativada estão ditas no ecrã (país+serviço > serviço > global; 0% ativo = nenhum subsídio; desativada herda)', /país \+ serviço<\/strong> &gt; <strong>serviço \(todos os países\)<\/strong> &gt; <strong>percentagem global/.test(panel) && panel.includes('Uma regra ativa de <strong>0%</strong> significa nenhum subsídio') && panel.includes('Uma regra desativada herda o nível seguinte'));
report('UI3 a chave "ativar" é só do padrão global e o ecrã o diz', panel.includes('Ativar o subsídio de frete da Nusali (padrão global)') && panel.includes('controla só a percentagem global') && panel.includes('const effectiveDraftPercent = enabled ? draftPercent : 0;'));
report('UI4 origem da regra efetiva + simulação financeira POR MODALIDADE (tabela com origem, % da Nusali, vendedor/Nusali/cliente) usando o MESMO motor de precedência e a MESMA aritmética do servidor', panel.includes('subsidy-effective-table') && panel.includes('Origem da regra') && panel.includes('buildEffectiveRows(') && form.includes('resolveNusaliPercent(') && form.includes("from './shippingSubsidyRules'") && form.includes('simulateShippingSplit(sim.cost, sim.sellerPercent, r.percent)') && form.includes("from './shippingSubsidyMath'"));
report('UI5 modo legado: aviso explícito de que NENHUMA regra por serviço ou país+serviço é aplicada às lojas sem política própria enquanto ele estiver ativo, e a tabela marca cada linha', panel.includes('subsidy-legacy-rules-warning') && panel.includes('nenhuma regra por serviço ou por país+serviço é aplicada') && panel.includes('não aplicada às lojas sem política própria (modo legado)'));
report('UI6 configuração guardada inválida é MOSTRADA (problemas) — nada inválido é escondido', panel.includes('subsidy-problems') && panel.includes('Há configuração guardada inválida') && panel.includes('config.problems'));
report('UI7 guardar: bloqueado com percentagem inválida (global ou de regra), confirmação lista as regras que mudam e o efeito por modalidade, caixa "Entendo o impacto" obrigatória', panel.includes('disabled={!dirty || !parsed.ok || !converted.ok}') && panel.includes('confirm-rule-diffs') && panel.includes('confirm-per-service') && panel.includes('disabled={!understood || saving}') && panel.includes('draftToRules(draftRules)'));
report('UI8 o pedido envia as regras E os valores vistos (expected.rules) → o servidor recusa edição concorrente (409 CONFIG_CHANGED) e o painel recarrega', /updateShippingSubsidy\(\{\s*enabled, percent: parsed\.value, rules: converted\.rules, confirmImpact: true, disableLegacyFreeMode: disableLegacy,\s*expected: \{ enabled: config\.enabled, percent: config\.percent, rules: config\.rules \}/.test(panel) && panel.includes("err?.code === 'CONFIG_CHANGED') await load()"));
report('UI9 o editor de regra é uma FUNÇÃO (renderRule), não um componente declarado dentro do render — digitar numa caixa não a recria nem tira o foco', panel.includes('const renderRule = (k: string, label: string) =>') && !/const RuleEditor\b/.test(panel));
report('UI10 histórico mostra as diferenças de regras por serviço ("GW:ECONOMY: sem regra → ativa 100%")', panel.includes('describeRulesDiff(h.before?.rules, h.after?.rules)') && panel.includes('history-rule-diffs'));
report('UI11 telemóvel: editor em coluna única, alvos de toque ≥44px, tabelas rolam na horizontal', panel.includes('grid grid-cols-1 sm:grid-cols-[1fr_auto_auto_auto]') && (panel.match(/min-h-\[44px\]/g) || []).length >= 10 && (panel.match(/overflow-x-auto/g) || []).length >= 2);
report('UI12 API do painel: updateShippingSubsidy aceita rules e expected.rules', api.includes('rules?: Record<string, { enabled: boolean; percent: number }>') && api.includes('expected?: { enabled: boolean; percent: number; rules?'));

// travas do servidor (uma só fonte da precedência)
report('S1 o motor usa a precedência compartilhada e recebe país de DESTINO + serviço; não há segunda implementação da regra', calc.includes("resolveNusaliPercent(setting, { countryCode: input.countryCode, serviceCode: input.serviceCode })") && !/function resolveNusaliPercent/.test(calc + admin) && /export function resolveNusaliPercent/.test(rules));
report('S2 cotação (produto e carrinho) e pedido passam país + serviço ao motor e leem a configuração UMA vez (cotação inteira / transação do pedido)', /serviceCode: svc\.code \}, db, nusaliSetting/.test(src('src/server/modules/shipping/shippingPreviewService.ts')) && src('src/server/modules/shipping/shippingPreviewService.ts').includes('const nusaliSetting = await readNusaliSubsidySetting(db);') && src('src/server/modules/orders/orderService.ts').includes('pg_advisory_xact_lock_shared') && src('src/server/modules/orders/orderService.ts').includes('computeSmartFulfillmentFreightRes(items, commercialStoreId, sellerId, nusaliSettingForOrder)'));
report('S3 o servidor NUNCA aceita a percentagem/serviço vindos do cliente de checkout: os endpoints de pedido/cotação não leem nenhum campo de subsídio do corpo', !/nusali|subsid/i.test(src('src/server/modules/orders/orderRoutes.ts').replace(/\/\/.*$/gm, '')) && !/body[^;]{0,80}(subsid|nusaliPercent)/i.test(src('src/server/api.ts')));
report('S4 compatibilidade e rigor: configuração antiga continua válida; escrita valida regras/alvos; leitura nunca aplica regra inválida', rules.includes('Tolerante ao formato antigo') && admin.includes('assertRuleTargetsExist') && rules.includes("source: 'INVALID_RULE'") && admin.includes('STORED_RULES_INVALID'));
report('S5 transição e reversão preservam as regras (instantâneo com rules)', src('src/server/modules/shipping/shippingSubsidyTransition.ts').includes('rules: plan.current.rules') && src('scripts/transition-shipping-subsidy.ts').includes('rules: plan.current.rules'));
report('S6 políticas de vendedor, cupons e o gate do checkout da Guiné-Bissau não foram tocados', !/storeShippingPolicies/.test(admin) && /CHECKOUT_ENABLED_COUNTRIES[^=]*=\s*\[\s*\]/.test(src('src/utils/checkoutAvailability.ts')));

const cat = [{ countryCode: 'GW', countryName: 'Guiné-Bissau', serviceCode: 'STANDARD', serviceName: 'Standard', isActive: true }, { countryCode: 'GW', countryName: 'Guiné-Bissau', serviceCode: 'ECONOMY', serviceName: 'Economy', isActive: true }];
const simIn = { cost: 1000, sellerPercent: 0 };
const inv = buildEffectiveRows(cat, { enabled: true, percent: 80 }, {}, simIn, { invalidKeys: ['GW:STANDARD'], corrupt: false });
const corrupt = buildEffectiveRows(cat, { enabled: true, percent: 80 }, {}, simIn, { invalidKeys: [], corrupt: true });
const fixed = buildEffectiveRows(cat, { enabled: true, percent: 80 }, rulesToDraft({ 'GW:STANDARD': { enabled: true, percent: 40 } }), simIn, { invalidKeys: ['GW:STANDARD'], corrupt: false });
const rowOf = (rows: typeof inv, code: string) => rows.find((r) => r.serviceCode === code)!;
report('UI13 tabela do painel = motor também com configuração inválida: regra guardada inválida → 0% (INVALID_RULE, cliente paga tudo), as outras seguem a global; contêiner corrompido → todas 0%; ao substituir a regra no rascunho passa a valer a nova',
  rowOf(inv, 'STANDARD').percent === 0 && rowOf(inv, 'STANDARD').source === 'INVALID_RULE' && rowOf(inv, 'STANDARD').split!.buyer === 1000 && rowOf(inv, 'ECONOMY').percent === 80 && corrupt.every((r) => r.percent === 0 && r.source === 'INVALID_RULE') && rowOf(fixed, 'STANDARD').percent === 40);

console.log(`\nRESULTADO: ${pass} PASS, ${fail} FAIL`);
process.exit(fail ? 1 : 0);
