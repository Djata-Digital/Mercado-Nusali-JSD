/**
 * P1 (pos-matriz v2) — SEGURANCA DO FORMULARIO DE ATRIBUTOS: falha de carregamento != categoria sem atributos, nova tentativa,
 * publicacao bloqueada ate carregar e valores preservados. Modelo puro + SSR do componente real + travas de codigo do assistente.
 * Sem banco, sem rede.
 */
import React from 'react';
import fs from 'fs';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  ATTRIBUTE_LOAD_MESSAGES, attributeLoadBlock, loadCategoryAttributes, reconcileValues, selectFormAttributes, validateFormFields, type FormAttribute,
} from '../src/utils/attributeFormModel.js';
import { ProductAttributeFields } from '../src/components/seller/ProductAttributeFields.js';

let pass = 0, fail = 0;
const report = (n: string, ok: boolean, d?: unknown) => { ok ? pass++ : fail++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}${ok ? '' : '  => ' + JSON.stringify(d ?? null).slice(0, 400)}`); };

const def = (o: Partial<FormAttribute> & { code: string; type: string }): FormAttribute => ({ id: `id_${o.code}`, name: o.code, role: 'spec', isRequired: false, isActive: true, optionsJson: null, ...o } as FormAttribute);
const FIELDS: FormAttribute[] = [
  def({ code: 'tipo', name: 'Tipo', type: 'select', isRequired: true, optionsJson: ['A', 'B'] }),
  def({ code: 'potencia', name: 'Potência', type: 'number', unit: 'W' }),
];

async function main() {
  // ---------- modelo: o que e "falha" e o que e "sem atributos"
  const ok = (data: unknown) => async () => ({ success: true, data });
  const r1 = await loadCategoryAttributes(ok([]), 'cat');
  report('A1 lista VAZIA com sucesso = categoria sem atributos (ok, 0 itens), nao e falha', r1.ok === true && (r1 as any).data.length === 0);
  const r2 = await loadCategoryAttributes(ok(FIELDS), 'cat');
  report('A2 lista com itens = ok', r2.ok === true && (r2 as any).data.length === 2);
  const bad: Array<[string, () => Promise<any>]> = [
    ['success:false (erro do servidor)', async () => ({ success: false, error: { message: 'x' } })],
    ['resposta nula', async () => null],
    ['data nao e lista', async () => ({ success: true, data: { a: 1 } })],
    ['sem data', async () => ({ success: true })],
    ['excecao de rede', async () => { throw new Error('Failed to fetch'); }],
  ];
  for (const [i, [label, fn]] of bad.entries()) {
    const r = await loadCategoryAttributes(fn, 'cat');
    report(`A${3 + i} ${label} = FALHA (ok:false), nunca "categoria sem atributos"`, r.ok === false && 'error' in r);
  }
  let seen = ''; await loadCategoryAttributes(async (c) => { seen = c; return { success: true, data: [] }; }, 'celulares');
  report('A8 repassa a categoria ao buscador', seen === 'celulares');

  // ---------- bloqueio da publicacao
  const b = (o: Partial<Parameters<typeof attributeLoadBlock>[0]>) => attributeLoadBlock({ category: 'cat', loadedFor: 'cat', loading: false, failed: false, ...o });
  report('B1 carregado para a categoria atual => liberado (null)', b({}) === null);
  report('B2 falhou => "failed"', b({ failed: true, loadedFor: null }) === 'failed');
  report('B3 ainda carregando => "loading"', b({ loading: true }) === 'loading');
  report('B4 os campos carregados sao de OUTRA categoria (troca em andamento) => "loading"', b({ loadedFor: 'outra' }) === 'loading');
  report('B5 nunca carregou (primeiro render) => "loading"', b({ loadedFor: null }) === 'loading');
  report('B6 falha vence "loading" (mostra o erro e a nova tentativa)', b({ failed: true, loading: true }) === 'failed');
  report('B7 sem categoria escolhida nao ha o que carregar (null; a categoria obrigatoria e validada a parte)', b({ category: '', loadedFor: null }) === null && b({ category: null, loadedFor: null }) === null);
  report('B8 mensagens ao vendedor: falha menciona "Tentar novamente", carregando pede para aguardar; sem jargao', /Tentar novamente/.test(ATTRIBUTE_LOAD_MESSAGES.failed) && /Aguarde/.test(ATTRIBUTE_LOAD_MESSAGES.loading) && !/undefined|null|Error|HTTP/.test(ATTRIBUTE_LOAD_MESSAGES.failed));

  // ---------- por que NAO se pode zerar os atributos numa falha (o defeito original)
  const filled = { tipo: 'A', potencia: '50' };
  const wiped = reconcileValues([], filled);
  const kept = reconcileValues(selectFormAttributes(FIELDS).fields, filled);
  report('C1 DEFEITO ORIGINAL provado: zerar os campos (setDbAttributes([])) descarta TODOS os valores preenchidos; manter os campos preserva', Object.keys(wiped.values).length === 0 && wiped.dropped.length === 2 && kept.values.tipo === 'A' && kept.values.potencia === '50' && kept.dropped.length === 0, { wiped, kept });
  report('C2 depois da nova tentativa com sucesso os valores preservados voltam a valer na validacao (obrigatorio preenchido => 0 erros)', Object.keys(validateFormFields(selectFormAttributes(FIELDS).fields, kept.values)).length === 0);

  // ---------- componente real (SSR)
  const base = { values: {}, errors: {}, onChange: () => {} };
  const err = renderToStaticMarkup(<ProductAttributeFields fields={[]} {...base} loadError onRetry={() => {}} />);
  report('D1 falha: alerta de erro + botao "Tentar novamente" (role=alert, data-testid)', /role="alert"/.test(err) && /data-testid="attributes-load-error"/.test(err) && /data-testid="attributes-load-retry"/.test(err) && /Tentar novamente/.test(err) && /Os campos preenchidos foram mantidos/.test(err), err.slice(0, 300));
  report('D2 falha NUNCA mostra "Esta categoria nao possui caracteristicas"', !/não possui características específicas/.test(err));
  const empty = renderToStaticMarkup(<ProductAttributeFields fields={[]} {...base} />);
  report('D3 categoria realmente sem atributos (sem falha) continua mostrando a mensagem de vazio e nenhum erro', /não possui características específicas/.test(empty) && !/attributes-load-error/.test(empty));
  const loading = renderToStaticMarkup(<ProductAttributeFields fields={[]} {...base} isLoading loadError />);
  report('D4 durante a nova tentativa (carregando) mostra "Carregando", sem o painel de erro', /Carregando características/.test(loading) && !/attributes-load-error/.test(loading));
  const leaf = renderToStaticMarkup(<ProductAttributeFields fields={[]} {...base} loadError needsLeafCategory />);
  report('D5 categoria nao final tem prioridade (pede a subcategoria), sem painel de erro', /Escolha a subcategoria final/.test(leaf) && !/attributes-load-error/.test(leaf));
  const noRetry = renderToStaticMarkup(<ProductAttributeFields fields={[]} {...base} loadError />);
  report('D6 sem manipulador de nova tentativa o erro aparece sem botao (nao quebra)', /attributes-load-error/.test(noRetry) && !/attributes-load-retry/.test(noRetry));
  const normal = renderToStaticMarkup(<ProductAttributeFields fields={FIELDS} {...base} values={{ tipo: 'B' }} />);
  report('D7 caso normal inalterado: campos renderizados, sem painel de erro, obrigatorio com asterisco e valor selecionado', /attr-field-tipo/.test(normal) && /<option value="B" selected/.test(normal) && !/attributes-load-error/.test(normal));
  report('D8 o painel tem id para o assistente rolar ate ele', /id="product-attribute-fields"/.test(normal));

  // ---------- travas no assistente (codigo real)
  const wiz = fs.readFileSync('src/components/seller/SellerProductWizard.tsx', 'utf8');
  const eff = wiz.slice(wiz.indexOf('loadCategoryAttributes((c)'), wiz.indexOf('}, [category, attrReloadToken]);'));
  report('E1 o efeito de carga usa loadCategoryAttributes e depende do token de nova tentativa', eff.length > 100 && /attrReloadToken/.test(wiz));
  report('E2 na FALHA o efeito nao zera os atributos (nenhum setDbAttributes([]) no caminho de erro; so marca o erro)', !/setDbAttributes\(\[\]\)/.test(eff) && /setAttrLoadError\(true\)/.test(eff));
  report('E3 a falha limpa ao recarregar e o sucesso registra a categoria carregada', /setAttrLoadError\(false\)/.test(wiz) && /setAttrLoadedFor\(category\)/.test(eff));
  const pub = wiz.slice(wiz.indexOf('const handlePublish'));
  const iBlock = pub.indexOf('if (attrBlock)');
  report('E4 handlePublish bloqueia ANTES de qualquer validacao/montagem de atributos (criacao e edicao)', iBlock > 0 && iBlock < pub.indexOf('validateFormFields(formFields') && iBlock < pub.indexOf('buildAttributePatch(formFields') && /showToast\(ATTRIBUTE_LOAD_MESSAGES\[attrBlock\]\)/.test(pub));
  report('E5 o componente recebe loadError e onRetry (retryAttributes incrementa o token)', /loadError=\{attrLoadError\}/.test(wiz) && /onRetry=\{retryAttributes\}/.test(wiz) && /setAttrReloadToken\(\(n\) => n \+ 1\)/.test(wiz));
  report('E6 o bloqueio usa o estado real (categoria, categoria carregada, carregando, falha)', /attributeLoadBlock\(\{ category, loadedFor: attrLoadedFor, loading: isLoadingDbAttributes, failed: attrLoadError \}\)/.test(wiz));

  // ---------- edicao: detalhe do produto que nao carrega
  const hub = fs.readFileSync('src/components/SellerHubView.tsx', 'utf8');
  const onEdit = hub.slice(hub.indexOf('onEditProduct={async (p)'), hub.indexOf('onDeleteProduct={handleDeleteProduct}'));
  report('F1 edicao: se o detalhe do vendedor nao carregar, NAO abre o editor com dados parciais (avisa e mantem a lista)', /detailLoaded = true/.test(onEdit) && onEdit.indexOf('if (!detailLoaded)') > 0 && onEdit.indexOf('if (!detailLoaded)') < onEdit.indexOf('setEditingProduct(editable)') && /nada foi alterado/.test(onEdit));
  report('F2 o editor so abre com as variacoes e valores tipados reais (editable vem do detalhe)', /attributeValues: detail\.data\.attributeValues/.test(onEdit));

  console.log(`\nRESULTADO: ${pass} PASS, ${fail} FAIL`);
  process.exit(fail === 0 ? 0 : 1);
}
main().catch((e) => { console.error('ERRO FATAL', e); process.exit(2); });
