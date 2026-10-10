/**
 * P2 (pos-matriz v2) — VARIACOES: Voltagem, Capacidade, Cor e Tamanho com o NOME REAL do eixo, selecao da variacao correta, carrinho local,
 * ponte do assistente do vendedor e travas no codigo da tela. Puro / SSR / codigo-fonte. Sem banco, sem rede.
 */
import React from 'react';
import fs from 'fs';
import { renderToStaticMarkup } from 'react-dom/server';
import type { ProductVariant } from '../src/types.js';
import {
  computeBuyerPriceDisplay, getSelectionGuardMessage, getSizesForColor, hasSecondaryAxis, isVariantAvailable, resolveSelectedVariant, secondaryJsonKey,
} from '../src/utils/productVariantBuyer.js';
import { buildAxisSpecRows, cartSelectionFor, describeBuyerAxes, readStoredAxes, variantAxisValues } from '../src/utils/buyerVariantAxes.js';
import { planAxisUi, validateVariantAxes } from '../src/utils/variantAxes.js';
import { buildAxisPayload, effectiveSecondJson, inferSecondJson, requiredAxesBlockingSimple, simpleModeAxesMessage, uiVariantsFromLoaded } from '../src/utils/variantAxisWizard.js';
import { CartItemOptionChips } from '../src/components/CartItemOptionChips.js';

let pass = 0, fail = 0;
const report = (n: string, ok: boolean, d?: unknown) => { ok ? pass++ : fail++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}${ok ? '' : '  => ' + JSON.stringify(d ?? null).slice(0, 500)}`); };

const V = (id: string, o: Partial<ProductVariant> & { price?: number; availableStock?: number }): ProductVariant => ({ id, stock: 0, price: 100, availableStock: 5, isActive: true, ...o } as ProductVariant);
const axisDef = (code: string, name: string, options?: string[]) => ({ code, name, role: 'variant_axis', isActive: true, optionsJson: options ?? null });

// ---------- produtos de exemplo
const volt = [V('v110', { sku: 'A-110', price: 1000, attributesJson: { voltagem: '110V' } }), V('v220', { sku: 'A-220', price: 1100, availableStock: 0, attributesJson: { voltagem: '220V' } })];
const corVolt = [
  V('c1', { color: 'Preto', attributesJson: { voltagem: '110V' } }), V('c2', { color: 'Preto', attributesJson: { voltagem: '220V' } }),
  V('c3', { color: 'Branco', attributesJson: { voltagem: '220V' } }), // Branco so existe em 220V
];
const cap = [V('k1', { capacity: '64 GB', price: 500 }), V('k2', { capacity: '128 GB', price: 700 })];
const tam = [V('t1', { color: 'Preto', size: 'M' }), V('t2', { color: 'Preto', size: 'G' }), V('t3', { color: 'Branco', size: 'M' })];
const tamVolt = [V('x1', { size: 'M', attributesJson: { voltagem: '110V' } }), V('x2', { size: 'M', attributesJson: { voltagem: '220V' } }), V('x3', { size: 'G', attributesJson: { voltagem: '110V' } })];

// ---------- A. descoberta dos eixos e RÓTULOS REAIS
const aVolt = describeBuyerAxes(volt);
report('A1 so Voltagem: 2a dimensao = "Voltagem" (rotulo vindo do proprio codigo, sem definicao), nao e Tamanho, sem cor', aVolt.hasSecond && aVolt.secondLabel === 'Voltagem' && !aVolt.secondIsSize && !aVolt.hasColor && aVolt.secondJsonKey === 'voltagem' && aVolt.extras.length === 0, aVolt);
const aCap = describeBuyerAxes(cap);
report('A2 so Capacidade: rotulo "Capacidade" (nunca "Tamanho"), sem "guia de tamanhos"', aCap.secondLabel === 'Capacidade' && !aCap.secondIsSize && aCap.secondKey === 'capacity', aCap);
const aTam = describeBuyerAxes(tam);
report('A3 Cor x Tamanho: "Cor" e "Tamanho" (com guia de tamanhos), como sempre', aTam.hasColor && aTam.colorLabel === 'Cor' && aTam.secondLabel === 'Tamanho' && aTam.secondIsSize, aTam);
const aReal = describeBuyerAxes(tam, [axisDef('tamanho', 'Comprimento'), axisDef('cor', 'Cor')]);
report('A4 NOME REAL da definicao da categoria vence o canonico: eixo de codigo "tamanho" chamado "Comprimento" aparece como "Comprimento"', aReal.secondLabel === 'Comprimento' && aReal.colorLabel === 'Cor', aReal);
const aCV = describeBuyerAxes(corVolt, [axisDef('cor', 'Cor'), axisDef('voltagem', 'Voltagem')]);
report('A5 Cor + Voltagem: cor e a 1a dimensao, Voltagem a 2a (nao um "extra" escondido)', aCV.hasColor && aCV.secondLabel === 'Voltagem' && aCV.extras.length === 0 && aCV.preferredJson.join() === 'voltagem', aCV);
const aTV = describeBuyerAxes(tamVolt, [axisDef('tamanho', 'Tamanho'), axisDef('voltagem', 'Voltagem')]);
report('A6 Tamanho + Voltagem: Tamanho e a 2a dimensao e Voltagem um eixo ADICIONAL com suas opcoes (110V, 220V)', aTV.secondLabel === 'Tamanho' && aTV.extras.length === 1 && aTV.extras[0].label === 'Voltagem' && aTV.extras[0].values.join() === '110V,220V', aTV);
report('A7 inativas ignoradas: variante inativa nao cria eixo nem opcao', (() => { const a = describeBuyerAxes([V('z1', { size: 'M' }), V('z2', { attributesJson: { voltagem: '220V' }, isActive: false })]); return !a.extras.length && a.secondLabel === 'Tamanho'; })());
report('A8 produto sem variacoes: nenhum eixo', !describeBuyerAxes([]).hasSecond && !describeBuyerAxes(undefined).hasColor && !hasSecondaryAxis(undefined));
report('A9 valores nao-texto em attributes_json (objeto/lista/vazio) nunca viram eixo', secondaryJsonKey([V('o1', { attributesJson: { extra: { a: 1 }, lista: ['x'], vazio: '  ' } })]) === undefined);

// ---------- B. SELECAO da variacao correta (sem adivinhar)
const rv = (list: ProductVariant[], sel: any) => resolveSelectedVariant(list, sel);
report('B1 so Voltagem: escolher 220V devolve a variacao 220V (id v220); escolher 110V a v110; sem escolha = null', rv(volt, { size: '220V' })?.id === 'v220' && rv(volt, { size: '110V' })?.id === 'v110' && rv(volt, {}) === null);
report('B2 opcoes oferecidas = so as cadastradas (110V, 220V na ordem); Bivolt nao existe se o vendedor nao cadastrou', JSON.stringify(getSizesForColor(volt, null)) === '["110V","220V"]');
report('B3 Cor + Voltagem: sem cor => null; Preto lista 110V e 220V; Branco so 220V (combinacao inexistente NAO e oferecida)', rv(corVolt, { size: '110V' }) === null && JSON.stringify(getSizesForColor(corVolt, 'Preto')) === '["110V","220V"]' && JSON.stringify(getSizesForColor(corVolt, 'Branco')) === '["220V"]');
report('B4 Cor + Voltagem: Preto + 220V = c2; Branco + 220V = c3; Branco + 110V (nao existe) = null', rv(corVolt, { color: 'Preto', size: '220V' })?.id === 'c2' && rv(corVolt, { color: 'Branco', size: '220V' })?.id === 'c3' && rv(corVolt, { color: 'Branco', size: '110V' }) === null);
report('B5 Cor + Voltagem: Branco sem escolher voltagem resolve sozinha (so ha 1 candidata = c3), Preto sem voltagem nao (2 candidatas)', rv(corVolt, { color: 'Branco' })?.id === 'c3' && rv(corVolt, { color: 'Preto' }) === null);
report('B6 Capacidade: 128 GB resolve k2 com o PRECO dela (700), nao o menor (500)', rv(cap, { size: '128 GB' })?.id === 'k2' && computeBuyerPriceDisplay(cap, rv(cap, { size: '128 GB' })).price === 700 && computeBuyerPriceDisplay(cap, null).mode === 'from');
report('B7 Tamanho + Voltagem (extra): sem escolher a voltagem NAO resolve (M tem 2 candidatas); com 220V resolve x2; G so tem 110V => resolve sozinho x3', rv(tamVolt, { size: 'M' }) === null && rv(tamVolt, { size: 'M', extras: { voltagem: '220V' } })?.id === 'x2' && rv(tamVolt, { size: 'G' })?.id === 'x3');
report('B8 retrocompatibilidade Cor x Tamanho: mesmos resultados de sempre', rv(tam, { color: 'Preto', size: 'G' })?.id === 't2' && rv(tam, { color: 'Branco' })?.id === 't3' && rv(tam, { size: 'M' }) === null && rv(tam, { color: 'Preto' }) === null);
report('B9 retrocompatibilidade: tamanho/capacidade SEMPRE vencem attributes_json (variante com size e voltagem usa o size como 2a dimensao)', rv(tamVolt, { size: 'G' }) !== null && secondaryJsonKey(tamVolt) === undefined);
report('B10 produto com uma unica variacao (uma opcao) resolve sozinho, mesmo sem selecao', rv([volt[0]], {})?.id === 'v110' && rv([cap[0]], {})?.id === 'k1');

// ---------- C. DISPONIBILIDADE e mensagens
report('C1 variacao sem estoque (220V = 0): resolvida, mas indisponivel; guard bloqueia com a mensagem de estoque', isVariantAvailable(rv(volt, { size: '220V' })) === false && getSelectionGuardMessage(volt, { size: '220V' }, 'Voltagem') === 'Esta variação está sem estoque no momento.');
report('C2 guard nomeia o eixo real: "Selecione a opção de Voltagem." / "...de Capacidade."; padrao antigo "Selecione um tamanho." sem rotulo', getSelectionGuardMessage(volt, {}, 'Voltagem') === 'Selecione a opção de Voltagem.' && getSelectionGuardMessage(cap, {}, 'Capacidade') === 'Selecione a opção de Capacidade.' && getSelectionGuardMessage(tam, { color: 'Preto' }) === 'Selecione um tamanho.' && getSelectionGuardMessage(tam, {}) === 'Selecione uma cor.');
report('C3 guard de eixo adicional: Tamanho + Voltagem, tamanho M sem voltagem => "Selecione a opção de Voltagem."', getSelectionGuardMessage(tamVolt, { size: 'M' }, 'Tamanho', { voltagem: 'Voltagem' }) === 'Selecione a opção de Voltagem.' && getSelectionGuardMessage(tamVolt, { size: 'M', extras: { voltagem: '220V' } }, 'Tamanho', { voltagem: 'Voltagem' }) === null);
report('C4 guard libera produto simples (sem variacoes) e variacao valida e disponivel', getSelectionGuardMessage([], {}) === null && getSelectionGuardMessage(volt, { size: '110V' }, 'Voltagem') === null);

// ---------- D. FICHA do produto (Voltagem mesmo com uma opcao)
report('D1 uma unica voltagem: aparece na ficha como informacao ("Voltagem: 220V")', JSON.stringify(buildAxisSpecRows([V('s1', { attributesJson: { voltagem: '220V' } })], describeBuyerAxes([V('s1', { attributesJson: { voltagem: '220V' } })]), {})) === '[["Voltagem","220V"]]');
report('D2 varias: lista as opcoes sem escolha ("110V / 220V") e mostra a escolhida depois', JSON.stringify(buildAxisSpecRows(volt, aVolt, {})) === '[["Voltagem","110V / 220V"]]' && JSON.stringify(buildAxisSpecRows(volt, aVolt, { size: '110V' })) === '[["Voltagem","110V"]]');
report('D3 Cor + Voltagem + Tamanho: um rotulo real por eixo, na ordem cor, 2a dimensao, extras', JSON.stringify(buildAxisSpecRows(tamVolt, aTV, { size: 'M', extras: { voltagem: '220V' } })) === '[["Tamanho","M"],["Voltagem","220V"]]' && JSON.stringify(buildAxisSpecRows(corVolt, aCV, { color: 'Preto', size: '220V' })) === '[["Cor","Preto"],["Voltagem","220V"]]');
report('D4 ficha nunca mostra codigos internos nem eixo vazio', buildAxisSpecRows([V('e1', {})], describeBuyerAxes([V('e1', {})]), {}).length === 0);

// ---------- E. CARRINHO: retrato dos eixos e identidade
const selVolt = cartSelectionFor(volt[1], aVolt);
report('E1 retrato do carrinho: [{voltagem, "Voltagem", "220V"}]; size compativel "220V"; sem cor', JSON.stringify(selVolt) === '{"size":"220V","axes":[{"key":"voltagem","label":"Voltagem","value":"220V"}]}' || (selVolt.size === '220V' && selVolt.axes?.[0].label === 'Voltagem' && selVolt.color === undefined), selVolt);
const selCV = cartSelectionFor(corVolt[1], aCV);
report('E2 Cor + Voltagem: axes = [Cor: Preto, Voltagem: 220V]; color preservado', selCV.color === 'Preto' && selCV.axes?.map((a) => `${a.label}:${a.value}`).join() === 'Cor:Preto,Voltagem:220V', selCV);
report('E3 cartSelectionFor(null) = vazio (nunca inventa)', JSON.stringify(cartSelectionFor(null, aVolt)) === '{}');
report('E4 readStoredAxes le o retrato do servidor e ignora lixo/formato antigo', readStoredAxes({ axes: [{ key: 'voltagem', label: 'Voltagem', value: '220V' }, { label: '', value: 'x' }, null, 'lixo'] }).length === 1 && readStoredAxes(null).length === 0 && readStoredAxes({ color: 'Preto', size: 'M' }).length === 0 && readStoredAxes({ axes: 'x' }).length === 0);
report('E5 variantAxisValues devolve todos os eixos da variacao com rotulo real', variantAxisValues(tamVolt[1], aTV).map((a) => `${a.label}=${a.value}`).join() === 'Tamanho=M,Voltagem=220V');

const chips = renderToStaticMarkup(<CartItemOptionChips item={{ selectedAxes: selCV.axes, selectedColor: 'Preto', selectedSize: '220V' }} />);
report('E6 CartView: chips com o NOME REAL ("Cor: Preto", "Voltagem: 220V"); nunca "Tamanho: 220V"', /Cor: <strong[^>]*>Preto/.test(chips) && /Voltagem: <strong[^>]*>220V/.test(chips) && !/Tamanho/.test(chips) && (chips.match(/cart-axis-chip/g) || []).length === 2, chips);
const legacyChips = renderToStaticMarkup(<CartItemOptionChips item={{ selectedColor: 'Preto', selectedSize: 'M' }} />);
report('E7 item ANTIGO do carrinho (sem retrato) continua com "Cor: Preto" e "Tamanho: M"', /Cor: <strong[^>]*>Preto/.test(legacyChips) && /Tamanho: <strong[^>]*>M/.test(legacyChips) && !/cart-axis-chip/.test(legacyChips));
report('E8 item sem opcoes nao desenha nada', renderToStaticMarkup(<CartItemOptionChips item={{}} />) === '');

// ---------- F. carrinho LOCAL (visitante): duas voltagens nunca se fundem
const mem = new Map<string, string>();
(globalThis as any).localStorage = { getItem: (k: string) => (mem.has(k) ? mem.get(k)! : null), setItem: (k: string, v: string) => { mem.set(k, v); }, removeItem: (k: string) => { mem.delete(k); } };
const { CartService } = await import('../src/services/cartService.js');
const prod: any = { id: 'prod_1', title: 'Liquidificador', price: 1000, currency: 'XOF', image: 'x.jpg', category: 'c', countryCode: 'GW' };
await CartService.addItem(prod, 1, { size: '110V', axes: aVolt ? cartSelectionFor(volt[0], aVolt).axes : undefined, variantId: 'v110' });
await CartService.addItem(prod, 1, { size: '220V', axes: cartSelectionFor(volt[1], aVolt).axes, variantId: 'v220' });
let cart = CartService.getCart();
report('F1 carrinho local: 110V e 220V (SEM SKU, so id da variacao) sao DOIS itens distintos (antes se fundiam num so)', cart.length === 2 && cart.map((c) => c.selectedVariantSku).join() === 'v110,v220', cart.map((c) => [c.selectedVariantSku, c.quantity]));
await CartService.addItem(prod, 2, { size: '220V', axes: cartSelectionFor(volt[1], aVolt).axes, variantId: 'v220' });
cart = CartService.getCart();
report('F2 a MESMA variacao somada soma a quantidade (220V: 1 + 2 = 3) sem criar linha nova', cart.length === 2 && cart.find((c) => c.selectedVariantSku === 'v220')?.quantity === 3);
report('F3 o retrato dos eixos fica no item local (Voltagem: 220V)', cart.find((c) => c.selectedVariantSku === 'v220')?.selectedAxes?.[0]?.label === 'Voltagem');
await CartService.addItemsBatch(prod, [{ variantId: 'v110', quantity: 2, size: '110V', axes: cartSelectionFor(volt[0], aVolt).axes }, { variantId: 'c1', quantity: 1, color: 'Preto', size: '110V' }]);
cart = CartService.getCart();
report('F4 lote local: soma na linha da mesma variacao (v110: 1 + 2 = 3) e cria linha nova para outra (c1)', cart.length === 3 && cart.find((c) => c.selectedVariantSku === 'v110')?.quantity === 3 && cart.some((c) => c.selectedVariantSku === 'c1'), cart.map((c) => [c.selectedVariantSku, c.quantity]));
await CartService.addItem(prod, 1, { color: 'Preto', size: 'M', selectedVariantSku: 'SKU-LEGADO' });
await CartService.addItem(prod, 1, { color: 'Preto', size: 'M', selectedVariantSku: 'SKU-LEGADO' });
report('F5 compatibilidade: chamada antiga so com SKU (sem variantId) continua mesclando por cor/tamanho/SKU', CartService.getCart().filter((c) => c.selectedVariantSku === 'SKU-LEGADO').length === 1 && CartService.getCart().find((c) => c.selectedVariantSku === 'SKU-LEGADO')?.quantity === 2);

// ---------- G. ponte do ASSISTENTE DO VENDEDOR: Voltagem com varios valores
const COR = { id: 'ax1', code: 'cor', name: 'Cor', type: 'select', role: 'variant_axis', isRequired: true, isActive: true, optionsJson: ['Preto', 'Branco'] } as any;
const VOLT = { id: 'ax2', code: 'voltagem', name: 'Voltagem', type: 'select', role: 'variant_axis', isRequired: false, isActive: true, optionsJson: ['110V', '220V'] } as any;
const CAP = { id: 'ax3', code: 'capacidade', name: 'Capacidade', type: 'select', role: 'variant_axis', isRequired: false, isActive: true, optionsJson: ['64 GB'] } as any;
const TAM = { id: 'ax4', code: 'tamanho', name: 'Tamanho', type: 'select', role: 'variant_axis', isRequired: true, isActive: true, optionsJson: ['P', 'M'] } as any;
const ui1 = planAxisUi([COR, VOLT]);
report('G1 Cor + Voltagem: Voltagem e a 2a dimensao do assistente (secondJson "voltagem"), nao um valor unico por anuncio', ui1.secondAxis?.code === 'voltagem' && ui1.secondJson === 'voltagem' && ui1.extraAxes.length === 0, ui1);
const ui2 = planAxisUi([VOLT]);
report('G2 so Voltagem: tambem e a 2a dimensao', ui2.secondJson === 'voltagem' && ui2.colorAxis === undefined);
report('G3 compatibilidade: com Capacidade ou Tamanho o comportamento de sempre (Voltagem continua eixo extra de valor unico)', planAxisUi([COR, CAP, VOLT]).secondJson === undefined && planAxisUi([COR, CAP, VOLT]).extraAxes.map((a: any) => a.code).join() === 'voltagem' && planAxisUi([COR, TAM, VOLT]).secondAxis?.code === 'tamanho');
const matrix: any[] = [{ id: 'm1', color: 'Preto', size: '110V', price: 1000, stock: 3 }, { id: 'm2', color: 'Preto', size: '220V', price: 1100, stock: 2 }];
const payload = buildAxisPayload(matrix, { secondColumn: 'size', secondJson: 'voltagem', extraAxes: [], extraValues: {} }) as any[];
report('G4 payload: o valor da coluna da UI vai para attributes_json.voltagem e a coluna "tamanho" fica VAZIA', payload.every((v) => v.size === undefined && v.capacity === undefined) && payload[0].attributesJson.voltagem === '110V' && payload[1].attributesJson.voltagem === '220V', payload);
report('G5 o payload passa na validacao do servidor (obrigatorio, opcao valida, combinacao unica) e gera variant_key por voltagem', validateVariantAxes([COR, VOLT], payload).errors.length === 0 && validateVariantAxes([COR, VOLT], payload).items.map((i) => i.key).join() === 'cor=preto|voltagem=110v,cor=preto|voltagem=220v');
report('G6 voltagem fora das opcoes ou repetida no payload e recusada antes de enviar', validateVariantAxes([COR, VOLT], buildAxisPayload([{ ...matrix[0], size: '380V' }], { secondColumn: 'size', secondJson: 'voltagem', extraAxes: [], extraValues: {} }) as any[]).errors[0]?.code === 'AXIS_INVALID' && validateVariantAxes([COR, VOLT], buildAxisPayload([matrix[0], { ...matrix[0], id: 'm3' }], { secondColumn: 'size', secondJson: 'voltagem', extraAxes: [], extraValues: {} }) as any[]).errors.some((e) => e.code === 'DUPLICATE_COMBINATION'));
const loaded = payload.map((v, i) => ({ ...v, id: `L${i}`, isActive: true }));
report('G7 EDICAO: variantes carregadas (voltagem em attributes_json) voltam para a coluna da UI; ida e volta sem perda', inferSecondJson(loaded) === 'voltagem' && uiVariantsFromLoaded(loaded, 'voltagem').map((v: any) => v.size).join() === '110V,220V' && effectiveSecondJson([], loaded) === 'voltagem' && effectiveSecondJson([COR, VOLT], []) === 'voltagem');
report('G8 sem eixo de Voltagem e com tamanho/capacidade nas variantes carregadas, nada muda (inferSecondJson indefinido)', inferSecondJson([{ size: 'P' }]) === undefined && inferSecondJson([{ capacity: '64 GB', attributesJson: { voltagem: '110V' } }]) === undefined && uiVariantsFromLoaded([{ capacity: '64 GB' }])[0].size === '64 GB');
report('G9 eixos obrigatorios que um produto simples nao consegue informar: lista os nomes e a mensagem orienta "uma so opcao"', requiredAxesBlockingSimple([COR, VOLT, TAM]).join() === 'Cor,Tamanho' && requiredAxesBlockingSimple([VOLT]).length === 0 && /Produto com variações/.test(simpleModeAxesMessage(['Cor'])) && /pode ser uma só/.test(simpleModeAxesMessage(['Cor'])));

// ---------- H. travas no codigo das telas
const pdv = fs.readFileSync('src/components/ProductDetailView.tsx', 'utf8');
report('H1 detalhe do produto: rotulo da 2a dimensao vem do eixo real (buyerAxes.secondLabel) e nao ha mais "Tamanho" fixo no seletor', /\{buyerAxes\.secondLabel \|\| 'Tamanho'\}/.test(pdv) && !/Tamanho\{selectedColor/.test(pdv));
report('H2 "Guia de tamanhos" so aparece quando a 2a dimensao e Tamanho', /buyerAxes\.secondIsSize && <span[^>]*>Guia de tamanhos<\/span>/.test(pdv));
report('H3 a linha da variacao usa o valor da 2a dimensao (inclui attributes_json) e exige a escolha dos eixos adicionais antes de oferecer a variacao', /secondaryAxisValue\(v, buyerAxes\.secondJsonKey\) === s/.test(pdv) && /buyerAxes\.extras\.every\(\(e\) => e\.values\.length <= 1 \|\| jsonAxisValue\(v, e\.key\) === selectedExtras\[e\.key\]\)/.test(pdv));
report('H4 eixos adicionais com varias opcoes ganham seletor proprio (radiogroup com o nome real)', /data-testid=\{`axis-extra-\$\{e\.key\}`\}/.test(pdv) && /role="radiogroup" aria-label=\{e\.label\}/.test(pdv));
report('H5 o carrinho recebe o retrato dos eixos em TODOS os caminhos (comprar agora multi, comprar agora, adicionar, lote)', (pdv.match(/cartSelectionFor\(/g) || []).length >= 3 && /axes: cartSelectionFor\(activeVariant, buyerAxes\)\.axes/.test(pdv));
report('H6 a ficha usa os eixos reais (buildAxisSpecRows) e nao mais os rotulos fixos "Cor / Variação" / "Tamanho / Especificação"', /buildAxisSpecRows\(product\.variants, buyerAxes/.test(pdv) && !/Cor \/ Variação|Tamanho \/ Especificação/.test(pdv));
report('H7 modo multi-variante depende da 2a dimensao real (inclui Voltagem), nao so de tamanho/capacidade', /const hasSecondaryAxisOverall = buyerAxes\.hasSecond;/.test(pdv));
report('H8 nomes reais vem do endpoint publico que ja existe (sem contrato novo) e a selecao NAO depende dele (retry:false, rotulos de fallback)', /CategoriesApi\.getCategoryAttributes\(String\(product\?\.categoryId\)\)/.test(pdv) && /retry: false/.test(pdv));
const cartSvc = fs.readFileSync('src/services/cartService.ts', 'utf8');
report('H9 servico do carrinho: envia o retrato ao servidor, le de volta e usa o id da variacao como identidade local', /selectedAxes: readStoredAxes\(item\.selectedAttributes\)/.test(cartSvc) && /\.\.\.\(options\?\.axes\?\.length \? \{ axes: options\.axes \} : \{\}\)/.test(cartSvc) && /options\?\.variantId \?\? options\?\.selectedVariantSku/.test(cartSvc));
const cv = fs.readFileSync('src/components/CartView.tsx', 'utf8');
report('H10 CartView usa o componente de opcoes (nome real do eixo)', /<CartItemOptionChips item=\{item\} \/>/.test(cv));
const wiz = fs.readFileSync('src/components/seller/SellerProductWizard.tsx', 'utf8');
report('H11 assistente do vendedor: 2a dimensao com o nome real (sem "Tamanhos / Capacidades" fixo quando ha eixo), sem grades de Tamanho para Voltagem e payload com secondJson', /2\. \{secondHeading\}/.test(wiz) && /\{!secondJson && \(/.test(wiz) && (wiz.match(/secondJson, extraAxes: axisUi\.extraAxes/g) || []).length === 2);
report('H12 assistente: produto simples bloqueado quando a categoria tem eixo obrigatorio (so em criacao ou ao remover variacoes), com aviso na tela', /requiredAxesBlockingSimple\(axes\)/.test(wiz) && /\(!isEditing \|\| hadRealVariantsOnLoadRef\.current\)/.test(wiz) && /data-testid="simple-mode-axes-note"/.test(wiz));
const mgr = fs.readFileSync('src/components/seller/SellerOrdersManager.tsx', 'utf8');
report('H13 pedidos do vendedor mostram a variacao comprada (titulo da variacao, que inclui a voltagem)', /data-testid="order-variant-title"/.test(mgr) && /ord\.variantTitle/.test(mgr));
const vs = fs.readFileSync('src/server/modules/catalog/variantService.ts', 'utf8');
report('H14 servidor: titulo padrao da variacao inclui os eixos de attributes_json', /jsonAxisParts/.test(vs) && /\[colorClean, sizeClean, capacityClean, \.\.\.jsonAxisParts\]/.test(vs));
const pcs = fs.readFileSync('src/server/modules/catalog/productCreationService.ts', 'utf8');
report('H15 servidor: criacao sem variacoes em categoria com eixo obrigatorio e recusada (VariantAxisValidationError / AXIS_REQUIRED)', /activeAxes\(effectiveAttributes\)\.filter\(\(a: any\) => a\.isRequired\)/.test(pcs) && /code: 'AXIS_REQUIRED'/.test(pcs));

console.log(`\nRESULTADO: ${pass} PASS, ${fail} FAIL`);
process.exit(fail === 0 ? 0 : 1);
