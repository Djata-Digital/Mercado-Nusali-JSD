/** ATRIBUTOS FASE 7 - testes UNITARIOS (puros): eixos, chave de identidade, ponte do assistente e painel. Sem banco. */
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { axisTarget, buildVariantKey, validateVariantAxes, planAxisUi, activeAxes } from '../src/utils/variantAxes.js';
import { buildAxisPayload, effectiveSecondColumn, extraAxisValuesFromVariants, inferSecondColumn, uiVariantsFromLoaded, validatePayloadAgainstAxes } from '../src/utils/variantAxisWizard.js';
import { VariantAxesPanel } from '../src/components/seller/VariantAxesPanel.js';
import { deriveSizesFromVariants } from '../src/utils/productVariantWizard.js';

let pass = 0, fail = 0;
const report = (n: string, ok: boolean, d?: unknown) => { ok ? pass++ : fail++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}${ok ? '' : '  => ' + JSON.stringify(d ?? null).slice(0, 500)}`); };
const axis = (o: any) => ({ id: `id_${o.code}`, role: 'variant_axis', isActive: true, isRequired: false, optionsJson: null, unit: null, ...o });
const COR = axis({ code: 'cor', name: 'Cor', type: 'select', isRequired: true, optionsJson: ['Preto', 'Azul Marinho'] });
const CAP = axis({ code: 'capacidade', name: 'Capacidade', type: 'select', isRequired: true, optionsJson: ['64 GB', '128 GB'] });
const TAM = axis({ code: 'tamanho', name: 'Tamanho', type: 'select', optionsJson: ['P', 'M'] });
const VOLT = axis({ code: 'voltagem', name: 'Voltagem', type: 'select', optionsJson: ['110V', '220V'] });

report('A1 mapeamento: cor/color->color, tamanho/size->size, capacidade/capacity->capacity, outros -> attributes_json', (axisTarget('cor') as any).column === 'color' && (axisTarget('Color') as any).column === 'color' && (axisTarget('tamanho') as any).column === 'size' && (axisTarget('capacity') as any).column === 'capacity' && (axisTarget('voltagem') as any).json === 'voltagem');
report('A2 chave: ordenada, sem acento/caixa, so valores preenchidos', buildVariantKey({ color: 'Azul Céu', size: ' P ', capacity: null }) === 'cor=azul_ceu|tamanho=p' && buildVariantKey({ capacity: '128 GB', color: 'Preto' }) === 'capacidade=128_gb|cor=preto');
report('A3 chave inclui valores de attributes_json (eixo extra) e ignora os que ja moram em coluna', buildVariantKey({ color: 'Preto', attributesJson: { voltagem: '110V', cor: 'Preto' } }) === 'cor=preto|voltagem=110v');
report('A4 sem nenhum valor de identidade => chave nula (nao participa da unicidade)', buildVariantKey({ sku: 'X', title: 'Y' }) === null && buildVariantKey({ color: '  ', size: null }) === null);
report('A5 mesma combinacao em caixa/acento/espacos diferentes => mesma chave', buildVariantKey({ color: 'PRETO', size: 'p' }) === buildVariantKey({ color: 'preto', size: ' P' }) && buildVariantKey({ color: 'Preto', size: 'M' }) !== buildVariantKey({ color: 'Preto', size: 'P' }));

const ok1 = validateVariantAxes([COR, CAP, VOLT], [{ sku: 'A', color: 'preto', capacity: '128 GB', attributesJson: { voltagem: '110v' } }]);
report('B1 valores canonizados pela opcao e voltagem no mapa; sem erros', ok1.errors.length === 0 && ok1.items[0].variant.color === 'Preto' && (ok1.items[0].variant as any).attributesJson.voltagem === '110V' && ok1.items[0].key === 'capacidade=128_gb|cor=preto|voltagem=110v', ok1);
const e1 = validateVariantAxes([COR, CAP], [{ sku: 'A', color: 'Verde', capacity: '1 TB' }, { sku: 'B', color: null, capacity: '64 GB' }]);
report('B2 tres erros: Cor invalida, Capacidade invalida, Cor obrigatoria ausente — com a variacao e o eixo', e1.errors.length === 3 && e1.errors.filter((e) => e.code === 'AXIS_INVALID').length === 2 && e1.errors.some((e) => e.code === 'AXIS_REQUIRED' && e.axis === 'cor' && e.variantIndex === 1 && /"B"/.test(e.message)), e1.errors);
const d1 = validateVariantAxes([], [{ color: 'Preto', size: 'P', sku: 'X' }, { color: 'preto', size: 'p', sku: 'Y' }]);
report('B3 duplicata detectada MESMO sem eixos definidos (variantes livres); a mensagem cita as duas', d1.errors.length === 1 && d1.errors[0].code === 'DUPLICATE_COMBINATION' && /"Y"/.test(d1.errors[0].message) && /"X"/.test(d1.errors[0].message) && d1.errors[0].variantIndex === 1, d1.errors);
report('B4 variantes sem identidade nao se consideram duplicadas', validateVariantAxes([], [{ sku: 'A' }, { sku: 'B' }]).errors.length === 0);
report('B5 valor livre fora dos eixos e aceito (categoria so tem Cor; tamanho "GG" passa)', validateVariantAxes([COR], [{ color: 'Preto', size: 'GG', sku: 'A' }]).errors.length === 0);
report('B6 eixo opcional ausente passa; eixo opcional com valor invalido recusa', validateVariantAxes([TAM], [{ sku: 'A' }]).errors.length === 0 && validateVariantAxes([TAM], [{ sku: 'A', size: 'XL' }]).errors[0]?.code === 'AXIS_INVALID');
report('B7 eixo numerico/texto livre (sem opcoes): texto aceito e aparado', (() => { const t = axis({ code: 'material', name: 'Material', type: 'text' }); const r = validateVariantAxes([t], [{ sku: 'A', attributesJson: { material: ' Algodão ' } }]); return r.errors.length === 0 && (r.items[0].variant as any).attributesJson.material === 'Algodão'; })());
report('B8 activeAxes so devolve eixos ATIVOS (ignora specs e eixos inativos)', activeAxes([COR, { ...CAP, isActive: false }, { id: 'x', code: 'obs', role: 'spec' }]).map((a) => a.code).join() === 'cor');

const ui = planAxisUi([COR, CAP, VOLT]);
report('C1 plano da UI: Cor, 2a dimensao = Capacidade (sem Tamanho) gravando em capacity, extra = Voltagem', ui.colorAxis?.code === 'cor' && ui.secondAxis?.code === 'capacidade' && ui.secondColumn === 'capacity' && ui.extraAxes.map((a) => a.code).join() === 'voltagem');
const ui2 = planAxisUi([COR, TAM, CAP]);
report('C2 com Tamanho E Capacidade: 2a dimensao = Tamanho (size); Capacidade vira eixo extra (valor por anuncio)', ui2.secondAxis?.code === 'tamanho' && ui2.secondColumn === 'size' && ui2.extraAxes.map((a) => a.code).join() === 'capacidade');
report('C3 sem eixos: 2a dimensao = size, nenhum extra', planAxisUi([]).secondColumn === 'size' && planAxisUi([]).extraAxes.length === 0);

const matrix = [{ id: 'var-1', color: 'Preto', size: '128 GB', stock: 1, price: 10, sku: 'S1' }, { id: 'var-2', color: 'Azul Marinho', size: '64 GB', stock: 2, price: 20, sku: 'S2' }];
const pay = buildAxisPayload(matrix, { secondColumn: 'capacity', extraAxes: [VOLT], extraValues: { voltagem: '220V' } }) as any[];
report('D1 payload com Capacidade: o tamanho da UI vai para capacity (size vazio) e a voltagem do anuncio entra em todas as variantes (attributes_json)', pay.every((v) => v.size === undefined && v.attributesJson.voltagem === '220V') && pay[0].capacity === '128 GB' && validatePayloadAgainstAxes([COR, CAP, VOLT], pay).length === 0, pay);
const pay2 = buildAxisPayload(matrix, { secondColumn: 'size', extraAxes: [], extraValues: {} }) as any[];
report('D2 sem eixos a 2a dimensao fica em size e a matriz nao e alterada', pay2[0].size === '128 GB' && pay2[0].capacity === undefined);
report('D3 eixo extra obrigatorio nao preenchido => erro de servidor antecipado ("precisa do valor de Voltagem")', validatePayloadAgainstAxes([COR, axis({ ...VOLT, isRequired: true })], buildAxisPayload(matrix, { secondColumn: 'size', extraAxes: [axis({ ...VOLT, isRequired: true })], extraValues: {} }) as any[]).some((e) => e.axis === 'voltagem' && e.code === 'AXIS_REQUIRED'));
report('D4 coluna capacidade em eixo extra (Tamanho+Capacidade): vai para capacity em todas', (buildAxisPayload(matrix, { secondColumn: 'size', extraAxes: [CAP], extraValues: { capacidade: '64 GB' } }) as any[]).every((v) => v.capacity === '64 GB' && v.size));
const loaded = [{ id: 'p1', color: 'Preto', capacity: '128 GB', isActive: true, attributesJson: { voltagem: '110V' } }, { id: 'p2', color: 'Branco', capacity: '64 GB' }];
report('E1 edicao: variantes so com capacidade => segunda coluna e capacity; a UI mostra a capacidade em "Tamanhos / Capacidades"', inferSecondColumn(loaded) === 'capacity' && (uiVariantsFromLoaded(loaded)[0] as any).size === '128 GB' && deriveSizesFromVariants(loaded as any).join() === '128 GB,64 GB');
report('E2 variantes com tamanho => size; eixo Capacidade definido manda ("capacity") mesmo sem variantes carregadas', inferSecondColumn([{ size: 'P' }]) === 'size' && effectiveSecondColumn([COR, CAP], []) === 'capacity' && effectiveSecondColumn([], loaded) === 'capacity' && effectiveSecondColumn([COR, TAM], loaded) === 'size');
report('E3 valor do eixo extra recuperado das variantes carregadas', extraAxisValuesFromVariants([VOLT], loaded).voltagem === '110V');

const html = renderToStaticMarkup(<VariantAxesPanel axes={[COR, CAP, VOLT] as any} selectedColors={['Preto']} selectedSeconds={[]} onToggleColor={() => {}} onToggleSecond={() => {}} extraValues={{ voltagem: '110V' }} onExtraChange={() => {}} problems={['A variação "S1" precisa do valor de "Voltagem".']} />);
report('F1 painel: nome dos eixos, obrigatorio/opcional, opcoes como chips (Preto marcado), onde cada eixo se define, select do eixo extra e erros em role=alert', /Variações desta categoria/.test(html) && /Cor<span[^>]*>\*/.test(html) && /Voltagem<span[^>]*>\(opcional\)/.test(html) && /aria-pressed="true"[^>]*>Preto/.test(html) && /1\. Cores Disponíveis/.test(html) && /2\. Capacidade/.test(html) && /id="axis-extra-voltagem"/.test(html) && /role="alert"/.test(html) && /precisa do valor de/.test(html), html.slice(0, 200));
report('F2 painel nao mostra codigos internos (capacidade/voltagem) como texto; sem eixos e sem problemas nao renderiza', !/>[^<]*(capacidade|voltagem)[^<]*</.test(html.replace(/id="[^"]*"/g, '').replace(/value="[^"]*"/g, '')) && renderToStaticMarkup(<VariantAxesPanel axes={[]} selectedColors={[]} selectedSeconds={[]} onToggleColor={() => {}} onToggleSecond={() => {}} extraValues={{}} onExtraChange={() => {}} problems={[]} />) === '');

console.log(`\nRESULTADO: ${pass} PASS, ${fail} FAIL`);
process.exit(fail ? 1 : 0);
