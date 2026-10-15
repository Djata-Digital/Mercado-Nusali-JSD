/**
 * EDITAR TARIFA (interface) — regras puras do formulário (datas, validação, mensagens do backend, texto de sucesso), formulário
 * compartilhado criar/editar (SSR) e travas de código do drawer: botão de edição por tarifa, formulário preenchido, só campos
 * editáveis no PATCH, layout responsivo e alvos de toque. Sem rede/banco.
 */
import React from 'react';
import fs from 'fs';
import { renderToStaticMarkup } from 'react-dom/server';
import { ShippingRateForm } from '../src/components/admin/ShippingRateForm.js';
import {
  toDatetimeLocal, fromDatetimeLocal, rateToForm, emptyRateForm, validateRateForm, buildRatePayload, rateErrorMessage, describeValidity, describeRateEdit,
} from '../src/utils/shippingRateForm.js';

let pass = 0, fail = 0;
const report = (n: string, ok: boolean, d?: unknown) => { ok ? pass++ : fail++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}${ok ? '' : '  => ' + JSON.stringify(d ?? null).slice(0, 300)}`); };
const src = (p: string) => fs.readFileSync(p, 'utf8').split(String.fromCharCode(13, 10)).join(String.fromCharCode(10));

// ---- regras puras
const iso = '2026-11-03T14:30:00.000Z';
report('U1 datas: ISO → datetime-local → ISO é ida e volta exata (minutos); vazio ↔ null; inválido detectado', fromDatetimeLocal(toDatetimeLocal(iso)) === iso && toDatetimeLocal(null) === '' && fromDatetimeLocal('') === null && fromDatetimeLocal('xx') === undefined && toDatetimeLocal('lixo') === '');
const rate = { minWeightKg: '0.500', maxWeightKg: '1.000', amount: '1500.00', validFrom: iso, validUntil: null };
const form = rateToForm(rate);
report('U2 rateToForm pré-preenche com os dados atuais (números limpos, validade em hora local)', form.min === '0.5' && form.max === '1' && form.amount === '1500' && form.validFrom === toDatetimeLocal(iso) && form.validUntil === '', form);
report('U3 validação local: presença, números, mín<máx, valor>=0 e validade coerente', validateRateForm(emptyRateForm()) !== null && validateRateForm({ ...form, max: '0.5' }) !== null && validateRateForm({ ...form, min: '-1' }) !== null && validateRateForm({ ...form, amount: '-5' }) !== null && validateRateForm({ ...form, amount: 'abc' }) !== null && validateRateForm({ ...form, validFrom: '2026-12-01T10:00', validUntil: '2026-11-01T10:00' }) !== null && validateRateForm(form) === null);
const payload = buildRatePayload({ ...form, amount: '1800', validUntil: '' });
report('U4 payload da edição: SÓ preço, faixa e vigência (nunca rota/serviço/moeda/id); vigência vazia = null (sem limite)', JSON.stringify(Object.keys(payload).sort()) === JSON.stringify(['amount', 'maxWeightKg', 'minWeightKg', 'validFrom', 'validUntil']) && payload.amount === 1800 && payload.validUntil === null && payload.minWeightKg === 0.5, payload);
const ov = rateErrorMessage('RATE_OVERLAP: já existe uma tarifa ativa para esta rota+serviço com faixa de peso sobreposta (1.000-5.000kg) no mesmo período de vigência.');
report('U5 erros do backend viram texto claro, sem código técnico: sobreposição indica a faixa em conflito', /sobreposta/.test(ov) && /1\.000-5\.000kg/.test(ov) && !/RATE_OVERLAP/.test(ov) && !/^[A-Z_]{5,}:/.test(ov), ov);
report('U6 demais erros: peso, valor, vigência, identidade e desconhecido (sem prefixo de código)', [
  rateErrorMessage('MIN_WEIGHT_INVALID: minWeightKg deve ser…'), rateErrorMessage('MAX_WEIGHT_INVALID: x'), rateErrorMessage('AMOUNT_INVALID: x'), rateErrorMessage('VALIDITY_INVALID: x'), rateErrorMessage('RATE_IDENTITY_IMMUTABLE: x'), rateErrorMessage('ALGO_NOVO: texto livre'), rateErrorMessage(''),
].every((m) => m.length > 10 && !/^[A-Z_]{5,}:/.test(m)) && rateErrorMessage('ALGO_NOVO: texto livre') === 'texto livre');
report('U7 vigência na lista: só início, só fim, ambos, nenhum', describeValidity({ validFrom: iso, validUntil: null })!.startsWith('Válida a partir de') && describeValidity({ validFrom: null, validUntil: iso })!.startsWith('Válida até') && /Válida de .* até /.test(describeValidity({ validFrom: iso, validUntil: '2026-12-01T00:00:00.000Z' })!) && describeValidity({ validFrom: null, validUntil: null }) === null);
const okMsg = describeRateEdit({ ...rate, amount: '1500' }, { ...rate, amount: '1800' }, 'XOF');
report('U8 mensagem de sucesso: mostra valor antes → depois e que pedidos já feitos não mudam', /1500\.00 → 1800\.00 XOF/.test(okMsg) && /pedidos já feitos não mudam/.test(okMsg) && !/→/.test(describeRateEdit(rate, rate, 'XOF')), okMsg);

// ---- formulário (SSR)
const html = (p: Partial<React.ComponentProps<typeof ShippingRateForm>>) => renderToStaticMarkup(<ShippingRateForm mode="edit" currency="XOF" initial={form} isSaving={false} onSubmit={async () => null} onCancel={() => {}} {...p} />);
const edit = html({});
report('U9 edição: formulário preenchido com os dados atuais (mín 0.5, máx 1, valor 1500) e a validade inicial', /id="rate-min"[^>]*value="0.5"/.test(edit) && /id="rate-max"[^>]*value="1"/.test(edit) && /id="rate-amount"[^>]*value="1500"/.test(edit) && new RegExp(`id="rate-from"[^>]*value="${toDatetimeLocal(iso)}"`).test(edit), edit.slice(0, 300));
report('U10 edição: título "Editar tarifa", botão "Salvar alterações", aviso de que pedidos feitos não mudam e compras em andamento pedirão nova confirmação', /Editar tarifa/.test(edit) && /Salvar alterações/.test(edit) && /Pedidos já feitos não mudam/.test(edit) && /nova confirmação/.test(edit));
const create = html({ mode: 'create', initial: emptyRateForm() });
report('U11 criação: "Nova faixa de tarifa", campos vazios, sem o aviso de edição, e MESMOS campos (inclui validade)', /Nova faixa de tarifa/.test(create) && !/shipping-rate-edit-note/.test(create) && /id="rate-from"/.test(create) && /id="rate-until"/.test(create) && /id="rate-amount"[^>]*value=""/.test(create));
report('U12 acessível: cada campo com <label for>, moeda no rótulo do valor', ['rate-min', 'rate-max', 'rate-amount', 'rate-from', 'rate-until'].every((id) => new RegExp(`<label for="${id}"`).test(edit)) && /Valor \(XOF\)/.test(edit));
report('U13 telemóvel: colunas empilhadas (grid-cols-1) e só vira 3/2 colunas em ≥sm; campos 16px (text-base) e 44px de altura; botões em coluna invertida', /grid-cols-1 sm:grid-cols-3/.test(edit) && /grid-cols-1 sm:grid-cols-2/.test(edit) && /min-h-\[44px\]/.test(edit) && /text-base sm:text-sm/.test(edit) && /flex-col-reverse sm:flex-row/.test(edit));
report('U14 a validade exclusiva e a faixa [mín, máx) estão explicadas ao administrador', /exclusivo/.test(edit) && /inclui o mínimo e exclui o máximo/.test(edit));

// ---- drawer (código)
const dr = src('src/components/admin/AdminShippingGeographyManager.tsx');
report('U15 cada tarifa tem botão de editar (ícone, título e aria-label) que abre o formulário no lugar da linha', dr.includes('data-testid={`shipping-rate-edit-${r.id}`}') && dr.includes('title="Editar tarifa"') && dr.includes('aria-label={`Editar tarifa ') && /editingRateId === r\.id \? \(\s*<ShippingRateForm[\s\S]{0,120}mode="edit"/.test(dr) && dr.includes('initial={rateToForm(r)}'));
report('U16 a edição chama o PATCH do MESMO id com buildRatePayload (nunca envia rota/serviço/moeda) e recarrega a lista', /AdminApi\.updateShippingRouteRate\(rate\.id, buildRatePayload\(values\)\)/.test(dr) && /await loadDetail\(\);\s*onChanged\(\);/.test(dr));
report('U17 sucesso e erro com mensagens claras: toast de sucesso descreve a mudança; erro do backend volta traduzido para o formulário (nunca some)', dr.includes('describeRateEdit(rate') && (dr.match(/rateErrorMessage\(/g) || []).length >= 4);
report('U18 telemóvel (drawer): linha da tarifa empilha em <sm; botões de ação com alvo de toque 44px; sem scroll horizontal', dr.includes('flex flex-col sm:flex-row sm:items-center') && (dr.match(/min-w-\[44px\] min-h-\[44px\]/g) || []).length >= 2 && /w-full max-w-xl/.test(dr) && /overflow-y-auto/.test(dr));
report('U19 a criação passa a usar o MESMO formulário (com validade) e o antigo formulário duplicado foi removido', dr.includes('mode="create"') && !dr.includes('setFormMin') && !dr.includes('formAmount'));
const api = src('src/api/clients/AdminApi.ts');
report('U20 reutiliza a API existente PATCH /admin/shipping/rates/:id (nenhum endpoint novo)', api.includes("apiClient.patch(`/admin/shipping/rates/${id}`, data)"));

console.log(`\nRESULTADO: ${pass} PASS, ${fail} FAIL`);
process.exit(fail ? 1 : 0);
