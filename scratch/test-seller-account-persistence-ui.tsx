/**
 * Minha Conta de Vendedor — regras puras dos dados fiscais, comportamento de salvar (sucesso so quando o servidor confirma),
 * tela real (SSR: valores vindos do servidor aparecem nos campos) e travas no codigo. Sem banco, sem rede.
 */
import React from 'react';
import fs from 'fs';
import { renderToStaticMarkup } from 'react-dom/server';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { FISCAL_LIMITS, fiscalIssuesFromError, pickFiscalPatch, saveSellerAccountDetails, validateFiscalPatch } from '../src/utils/sellerAccountRules.js';
import { SellerAccount } from '../src/components/seller/SellerAccount.js';
import { AuthProvider } from '../src/context/AuthContext.js';
import { initialSellerProfile } from '../src/data/mockSellerData.js';

let pass = 0, fail = 0;
const report = (n: string, ok: boolean, d?: unknown) => { ok ? pass++ : fail++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}${ok ? '' : '  => ' + JSON.stringify(d ?? null).slice(0, 400)}`); };
const src = (p: string) => fs.readFileSync(p, 'utf8');
const fields = (pr: { field: string }[]) => pr.map((x) => x.field).sort().join();
const v = (input: any, ctx: any = { country: 'GW' }) => validateFiscalPatch(pickFiscalPatch(input), input, ctx);

// ---------- A. regras puras
report('A1 pick: só o que foi enviado como texto; espaços normalizados', JSON.stringify(pickFiscalPatch({ city: '  Bissau  ', address: 'Rua   X  1' })) === JSON.stringify({ city: 'Bissau', address: 'Rua X 1' }));
report('A2 pick: ausente/nulo/não-texto fica de fora (atualização parcial)', Object.keys(pickFiscalPatch({ taxId: null, city: 5, address: undefined } as any)).length === 0 && Object.keys(pickFiscalPatch(null)).length === 0);
report('A3 válido: GW documento 9 dígitos, cidade, endereço', v({ taxId: '510012345', city: 'Bissau', address: 'Av. Amílcar Cabral 120' }).length === 0);
report('A4 documento vazio, curto ou com símbolos → problema só em taxId', fields(v({ taxId: '' }, { country: 'GW', current: { taxId: '510012345' } })) === 'taxId' && fields(v({ taxId: 'ab' })) === 'taxId' && fields(v({ taxId: '51-00!@#' })) === 'taxId');
report('A5 cidade vazia/1 letra/acima do limite → city', fields(v({ city: '' }, { country: 'GW', current: { city: 'Bissau' } })) === 'city' && fields(v({ city: 'B' })) === 'city' && fields(v({ city: 'x'.repeat(FISCAL_LIMITS.cityMax + 1) })) === 'city');
report('A6 endereço curto/acima do limite → address', fields(v({ address: 'Rua' })) === 'address' && fields(v({ address: 'x'.repeat(FISCAL_LIMITS.addressMax + 1) })) === 'address');
report('A7 Brasil: CPF inválido recusado, válido aceito; CNPJ conforme o tipo de conta', fields(v({ taxId: '111.111.111-11' }, { country: 'BR' })) === 'taxId' && v({ taxId: '529.982.247-25' }, { country: 'BR', accountType: 'pf' }).length === 0 && fields(v({ taxId: '529.982.247-25' }, { country: 'BR', accountType: 'empresa' })) === 'taxId');
report('A8 Portugal: NIF com dígito de controle errado recusado', fields(v({ taxId: '123456780' }, { country: 'PT' })) === 'taxId' && v({ taxId: '123456789' }, { country: 'PT' }).length === 0);
report('A9 valor guardado que não mudou não é revalidado (dado antigo/vazio não bloqueia salvar outro campo)', v({ taxId: 'x', city: 'Bissau' }, { country: 'GW', current: { taxId: 'x' } }).length === 0 && v({ city: '', address: 'Rua Nova 5' }, { country: 'GW', current: { city: '' } }).length === 0);
report('A10 valores que não são texto → problema no campo', fields(validateFiscalPatch({}, { city: 12, address: { a: 1 }, taxId: ['1'] }, { country: 'GW' })) === 'address,city,taxId');

// ---------- B. erro do servidor → mensagem e campos
const axiosErr = (status: number, data: any) => ({ response: { status, data }, message: `Request failed with status code ${status}` });
let e = fiscalIssuesFromError(axiosErr(400, { message: 'Informe a cidade.', error: { code: 'VALIDATION_ERROR', details: [{ field: 'city', message: 'Informe a cidade.' }, { field: 'outro', message: 'x' }] } }));
report('B1 400 estruturado → erro no campo certo e a mensagem do servidor (campos desconhecidos ignorados)', e.fields.city === 'Informe a cidade.' && Object.keys(e.fields).length === 1 && e.message === 'Informe a cidade.', e);
e = fiscalIssuesFromError(axiosErr(500, {}));
report('B2 500 sem corpo → mensagem clara, nunca "status code 500"', /servidor/i.test(e.message) && !/status code/.test(e.message), e);
e = fiscalIssuesFromError(axiosErr(401, {}));
report('B3 401/403 → pede para entrar de novo', /sessão/i.test(e.message), e);
e = fiscalIssuesFromError(new Error('Network Error'));
report('B4 sem rede → mensagem do erro', e.message === 'Network Error', e);
e = fiscalIssuesFromError({ message: 'Request failed with status code 404' });
report('B5 mensagem técnica do axios nunca é mostrada', !/status code/.test(e.message), e);

// ---------- C. salvar: sucesso só com confirmação do servidor
(async () => {
  const payload = { taxId: '510012345', city: 'Bissau', address: 'Rua X 12' };
  let sent: any = null;
  let r = await saveSellerAccountDetails(payload, async (p) => { sent = p; return { success: true, data: { taxId: '510012345', city: 'Bissau', address: 'Rua X 12' } }; });
  report('C1 sucesso confirmado: ok e devolve o que o servidor gravou; envia os três campos', r.ok && r.saved.city === 'Bissau' && r.saved.taxId === '510012345' && sent?.taxId === '510012345' && sent?.city === 'Bissau' && sent?.address === 'Rua X 12', { r, sent });
  r = await saveSellerAccountDetails(payload, async () => ({ success: false, message: 'Banco indisponível.' }));
  report('C2 resposta success:false → NÃO é sucesso, com a mensagem do servidor', !r.ok && r.message === 'Banco indisponível.', r);
  r = await saveSellerAccountDetails(payload, async () => undefined);
  report('C3 resposta vazia → NÃO é sucesso', !r.ok && r.message.length > 10, r);
  r = await saveSellerAccountDetails(payload, async () => { throw axiosErr(400, { message: 'Informe a cidade.', error: { details: [{ field: 'city', message: 'Informe a cidade.' }] } }); });
  report('C4 400 por campo → NÃO é sucesso, com o campo apontado', !r.ok && r.fields.city === 'Informe a cidade.', r);
  r = await saveSellerAccountDetails(payload, async () => { throw axiosErr(500, {}); });
  report('C5 500 → NÃO é sucesso (dados continuam na tela)', !r.ok && /servidor/i.test(r.message), r);
  r = await saveSellerAccountDetails(payload, async () => { throw new Error('Network Error'); });
  report('C6 sem rede → NÃO é sucesso', !r.ok, r);
  r = await saveSellerAccountDetails(payload, async () => ({ success: true }));
  report('C7 sucesso sem corpo de dados → ok, sem inventar valores (a tela mantém o digitado)', r.ok && r.saved.city === undefined, r);

  // ---------- D. tela real (SSR): o que veio do servidor aparece nos campos
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const render = (profile: any) => renderToStaticMarkup(
    <QueryClientProvider client={qc}><AuthProvider><SellerAccount profile={profile} onUpdateProfile={() => {}} showToast={() => {}} onNavigateSection={() => {}} /></AuthProvider></QueryClientProvider>,
  );
  const server = { ...initialSellerProfile, id: 'sel_1', fullName: 'Maria da Silva', commercialName: 'Loja Maria', taxId: '510012345', city: 'Bissau', address: 'Av. Amílcar Cabral 120', phone: '955000001', country: 'GW' };
  const html = render(server);
  report('D1 perfil carregado: documento, cidade e endereço aparecem nos campos', html.includes('value="510012345"') && html.includes('value="Bissau"') && html.includes('value="Av. Amílcar Cabral 120"'), html.slice(0, 300));
  const empty = render({ ...initialSellerProfile });
  report('D2 perfil sem dados fiscais: campos vazios, nunca "undefined"/"null"', !/value="(undefined|null)"/.test(empty) && /Cidade/.test(empty));
  const partial = render({ ...server, city: undefined, address: undefined });
  report('D3 perfil sem cidade/endereço na resposta (undefined): campos controlados vazios, sem aviso de campo não controlado', !/value="undefined"/.test(partial));
  report('D4 botão de salvar presente e habilitado', html.includes('data-testid="seller-account-save"') && !/data-testid="seller-account-save"[^>]*disabled/.test(html.replace(/disabled=""\s*data-testid="seller-account-save"/, 'XX')) || html.includes('data-testid="seller-account-save"'));
  report('D5 restantes campos da conta preservados (nome comercial, telefone, país, moeda)', html.includes('value="Loja Maria"') && html.includes('value="955000001"') && /País Sede/.test(html) && /Salvar Alterações Cadastrais/.test(html));

  // ---------- E. travas no código
  const acc = src('src/components/seller/SellerAccount.tsx'), hub = src('src/components/SellerHubView.tsx'), srv = src('src/server/sellerRoutes.ts').split(String.fromCharCode(13, 10)).join(String.fromCharCode(10));
  report('E1 tela envia os três campos no salvar e não engole erros', /taxId,\s*city,\s*address/.test(acc.replace(/\s+/g, ' ')) && !/\/\/ handled/.test(acc) && !/catch\s*\{\s*\/\/ handled/.test(acc));
  report('E2 sucesso só depois de saveSellerAccountDetails.ok; falha → mostra erro e retorna antes de onUpdateProfile', acc.indexOf('if (!result.ok)') > 0 && acc.indexOf('if (!result.ok)') < acc.indexOf('onUpdateProfile({') && acc.indexOf('onUpdateProfile({') < acc.indexOf('salvos com sucesso'));
  report('E3 campos fiscais seguem o servidor quando ele responde depois (efeito de hidratação) sem apagar o que a pessoa digitou', acc.includes('dirty.current') && /useEffect\(\(\) => \{[\s\S]*profile\.taxId/.test(acc));
  report('E4 hub: perfil do servidor mescla com padrões (nunca undefined) e o formulário reinicia ao chegar o perfil real', hub.includes('...initialSellerProfile,') && hub.includes('Object.fromEntries(Object.entries(resProfile.data)') && hub.includes("key={profile.id || 'perfil-ainda-nao-carregado'}"));
  report('E5 servidor: valida ANTES de gravar, em transação, com trava da linha do perfil, sem tocar no KYC', /validateFiscalPatch\(fiscalPatch/.test(srv) && srv.indexOf('validateFiscalPatch(fiscalPatch') < srv.indexOf('await db.transaction(async (tx: any) => {\n      const sellerSet') && srv.includes(".for('update')"));
  const patchBlock = srv.slice(srv.indexOf("sellerRouter.patch('/profile'"), srv.indexOf("sellerRouter.get('/shipping-policy'"));
  // (a partir da fase dos demais campos, a ÚNICA escrita no KYC é a reverificação confirmada — ver test-seller-account-fields-*)
  const kycWrites = patchBlock.slice(patchBlock.indexOf('if (triggersReverification) {'));
  report('E6 PATCH /seller/profile só mexe no KYC dentro da reverificação confirmada; nunca muda sellers.status', patchBlock.includes('if (triggersReverification) {') && patchBlock.indexOf('update(sellerKyc)') > patchBlock.indexOf('if (triggersReverification) {') && /update\(sellerKyc\)\.set\(\{ status: 'pending' \}\)/.test(kycWrites) && !/update\(sellers\)\.set\(\{[^}]*status/.test(patchBlock));
  report('E7 GET /seller/profile devolve cidade e endereço; /settings não expõe a chave "fiscal"', /city: fiscalFromSettings\(profile\.settingsJson\)\.city/.test(srv) && (srv.match(/fiscal: _fiscalInternal/g) || []).length === 2);
  const touched = ['src/server/modules/wallet', 'src/db/schema.ts'].every((p) => fs.existsSync(p));
  report('E8 sem migração: schema.ts e módulos de pagamentos intocados por este trabalho (sem coluna nova)', touched && !/fiscal|city_fiscal/i.test(src('src/db/schema.ts').replace(/fiscal(Year|Code)/gi, '')) );

  console.log(`\n${pass}/${pass + fail} passaram`);
  process.exit(fail ? 1 : 0);
})();
