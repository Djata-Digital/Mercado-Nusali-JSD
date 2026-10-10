/**
 * Minha Conta de Vendedor — regras puras dos demais campos (titular, tipo, pais, e-mail comercial, moeda), reverificacao de identidade,
 * comportamento de salvar (confirmacao explicita, erros por campo, sucesso so com gravacao real), tela real (SSR) e travas no codigo.
 * Sem banco, sem rede.
 */
import React from 'react';
import fs from 'fs';
import { execSync } from 'child_process';
import { renderToStaticMarkup } from 'react-dom/server';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  defaultSellerTypeFor, detectIdentityChanges, documentsNeededAfter, fiscalIssuesFromError, pickAccountPatch, saveSellerAccountDetails,
  sellerTypeToAccountType, validateAccountPatch, SELLER_TYPES,
} from '../src/utils/sellerAccountRules.js';
import { SellerAccount } from '../src/components/seller/SellerAccount.js';
import { AuthProvider } from '../src/context/AuthContext.js';
import { initialSellerProfile } from '../src/data/mockSellerData.js';

let pass = 0, fail = 0;
const report = (n: string, ok: boolean, d?: unknown) => { ok ? pass++ : fail++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}${ok ? '' : '  => ' + JSON.stringify(d ?? null).slice(0, 400)}`); };
const src = (p: string) => fs.readFileSync(p, 'utf8').split(String.fromCharCode(13, 10)).join(String.fromCharCode(10));
const fields = (pr: { field: string }[]) => pr.map((x) => x.field).sort().join();
const ctx = { current: { fullName: 'Maria da Silva', sellerType: 'sociedade', country: 'GW', email: 'a@b.com', preferredCurrency: 'XOF' }, activeCountries: ['GW', 'BR', 'PT'], supportedCurrencies: ['XOF', 'BRL', 'EUR'] };
const v = (input: any, c: any = ctx) => validateAccountPatch(pickAccountPatch(input), input, c);

// ---------- A. regras puras
report('A1 pick: só texto enviado; país/moeda em maiúsculas, e-mail em minúsculas, espaços do nome normalizados', JSON.stringify(pickAccountPatch({ fullName: '  Maria   Silva ', country: 'br', email: ' A@B.COM ', preferredCurrency: 'eur', sellerType: ' sociedade ' })) === JSON.stringify({ fullName: 'Maria Silva', sellerType: 'sociedade', country: 'BR', email: 'a@b.com', preferredCurrency: 'EUR' }));
report('A2 pick: ausente/nulo/não-texto fica de fora', Object.keys(pickAccountPatch({ fullName: null, country: 5, email: undefined } as any)).length === 0);
report('A3 tudo válido: nenhum problema', v({ fullName: 'João Djata', sellerType: 'empresa_individual', country: 'BR', email: 'contato@loja.com', preferredCurrency: 'BRL' }).length === 0);
report('A4 titular: vazio, sem letras e acima do limite → fullName', fields(v({ fullName: ' ' })) === 'fullName' && fields(v({ fullName: '12345' })) === 'fullName' && fields(v({ fullName: 'x'.repeat(121) })) === 'fullName');
report('A5 tipo de vendedor fora da lista → sellerType; os cinco tipos válidos passam', fields(v({ sellerType: 'inventado' })) === 'sellerType' && SELLER_TYPES.every((t) => v({ sellerType: t }, { ...ctx, current: { ...ctx.current, sellerType: null } }).length === 0));
report('A6 país: formato inválido e país inativo → country', fields(v({ country: 'brasil' })) === 'country' && fields(v({ country: 'ZZ' })) === 'country');
report('A7 e-mail: sem @, sem domínio, vazio → email', ['sem-arroba', 'a@b', '', 'a b@c.com'].every((e) => fields(v({ email: e })) === 'email'));
report('A8 moeda: formato inválido ou que nenhum país ativo usa (regra dos saques) → preferredCurrency', fields(v({ preferredCurrency: 'XX' })) === 'preferredCurrency' && fields(v({ preferredCurrency: 'USD' })) === 'preferredCurrency' && v({ preferredCurrency: 'EUR' }).length === 0);
report('A9 valor guardado que não mudou não é revalidado (país/moeda antigos não bloqueiam)', v({ country: 'GW', preferredCurrency: 'XOF', email: 'a@b.com' }, { ...ctx, activeCountries: ['BR'], supportedCurrencies: ['BRL'] }).length === 0);
report('A10 valores que não são texto → problema no campo', fields(validateAccountPatch({}, { fullName: 1, sellerType: [], country: {}, email: 2, preferredCurrency: true }, ctx)) === 'country,email,fullName,preferredCurrency,sellerType');
report('A11 classe do tipo: só pessoa_fisica é "pf"; os outros quatro são "empresa"; inválido → null', sellerTypeToAccountType('pessoa_fisica') === 'pf' && ['empresa_individual', 'sociedade', 'marca_oficial', 'vendedor_internacional'].every((t) => sellerTypeToAccountType(t) === 'empresa') && sellerTypeToAccountType('x') === null);
report('A12 tipo padrão por classe do KYC', defaultSellerTypeFor('pf') === 'pessoa_fisica' && defaultSellerTypeFor('empresa') === 'empresa_individual' && defaultSellerTypeFor(null) === null);

// ---------- B. mudanças de identidade
const before = { taxId: '510012345', fullName: 'Maria da Silva', country: 'GW', accountType: 'pf' as const };
report('B1 só formato (pontuação do documento, caixa/espaços do nome) NÃO é mudança', detectIdentityChanges(before, { taxId: '510.012.345', fullName: '  MARIA  da silva ' }).length === 0);
report('B2 documento novo → taxId', JSON.stringify(detectIdentityChanges(before, { taxId: '510099999' }).map((c) => c.field)) === '["taxId"]');
report('B3 titular novo → fullName; país novo → country; classe nova → accountType', fields(detectIdentityChanges(before, { fullName: 'Outra Pessoa' })) === 'fullName' && fields(detectIdentityChanges(before, { country: 'BR' })) === 'country' && fields(detectIdentityChanges(before, { accountType: 'empresa' })) === 'accountType');
report('B4 campos não enviados (undefined) nunca contam; mesma classe não conta', detectIdentityChanges(before, {}).length === 0 && detectIdentityChanges(before, { accountType: 'pf' }).length === 0);
report('B5 vários ao mesmo tempo aparecem todos, com rótulos para a pessoa', detectIdentityChanges(before, { taxId: '1', fullName: 'X Y', country: 'BR', accountType: 'empresa' }).length === 4 && detectIdentityChanges(before, { country: 'BR' })[0].label === 'País sede');
report('B6 documentos exigidos de novo: sempre identidade; país novo acrescenta comprovante de residência', JSON.stringify(documentsNeededAfter(detectIdentityChanges(before, { taxId: '1' }))) === '["identityDocument"]' && documentsNeededAfter(detectIdentityChanges(before, { country: 'BR' })).includes('proofOfAddress'));

// ---------- C. salvar: confirmação explícita, erros por campo, sucesso só com gravação
const axiosErr = (status: number, data: any) => ({ response: { status, data }, message: `Request failed with status code ${status}` });
(async () => {
  const e409 = axiosErr(409, { message: 'Alterar Documento fiscal exige uma nova verificação (KYC).', error: { code: 'KYC_REVERIFICATION_REQUIRED', changes: [{ field: 'taxId', label: 'Documento fiscal', from: '1', to: '2' }], details: [] } });
  let r = await saveSellerAccountDetails({ taxId: '2' }, async () => { throw e409; });
  report('C1 409 de reverificação → NÃO é sucesso e devolve o aviso com o que muda (a tela pede confirmação)', !r.ok && r.reverification?.changes[0]?.label === 'Documento fiscal' && r.code === 'KYC_REVERIFICATION_REQUIRED' && /verificação/.test(r.message), r);
  let sent: any = null;
  r = await saveSellerAccountDetails({ taxId: '2', confirmReverification: true }, async (p) => { sent = p; return { success: true, data: { taxId: '2', fullName: 'Maria', kycReverification: { required: true, changes: [{ field: 'taxId', label: 'Documento fiscal' }] } } }; });
  report('C2 confirmação enviada ao servidor; resposta traz KYC em reverificação', r.ok && sent.confirmReverification === true && r.kycReverification?.required === true && r.kycReverification.changes[0].label === 'Documento fiscal', { r, sent });
  r = await saveSellerAccountDetails({}, async () => { throw axiosErr(409, { message: 'Não é possível trocar o país sede.', error: { code: 'COUNTRY_CHANGE_BLOCKED', details: [{ field: 'country', message: 'Não é possível trocar o país sede.' }] } }); });
  report('C3 país bloqueado → erro no campo country, sem prompt de reverificação', !r.ok && r.fields.country === 'Não é possível trocar o país sede.' && r.reverification === null && r.code === 'COUNTRY_CHANGE_BLOCKED', r);
  r = await saveSellerAccountDetails({}, async () => { throw axiosErr(400, { message: 'x', error: { code: 'VALIDATION_ERROR', details: [{ field: 'fullName', message: 'Informe o nome completo do titular da conta.' }, { field: 'email', message: 'Informe um e-mail comercial válido (ex.: contato@loja.com).' }, { field: 'preferredCurrency', message: 'm' }, { field: 'sellerType', message: 's' }] } }); });
  report('C4 400 com vários campos → cada um no seu lugar', !r.ok && !!r.fields.fullName && !!r.fields.email && !!r.fields.preferredCurrency && !!r.fields.sellerType, r.fields);
  r = await saveSellerAccountDetails({}, async () => ({ success: true, data: { fullName: 'João Djata', sellerType: 'sociedade', country: 'BR', email: 'a@b.com', preferredCurrency: 'BRL', kycReverification: null } }));
  report('C5 sucesso devolve o que o servidor gravou nos cinco campos; sem reverificação', r.ok && r.saved.fullName === 'João Djata' && r.saved.sellerType === 'sociedade' && r.saved.country === 'BR' && r.saved.email === 'a@b.com' && r.saved.preferredCurrency === 'BRL' && r.kycReverification === null, r);
  report('C6 mensagens técnicas nunca aparecem', !/status code/.test(fiscalIssuesFromError({ message: 'Request failed with status code 409' }).message));

  // ---------- D. tela real (SSR)
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const render = (profile: any) => renderToStaticMarkup(
    <QueryClientProvider client={qc}><AuthProvider><SellerAccount profile={profile} onUpdateProfile={() => {}} showToast={() => {}} onNavigateSection={() => {}} /></AuthProvider></QueryClientProvider>,
  );
  const server = { ...initialSellerProfile, id: 'sel_1', fullName: 'Maria Pereira da Silva', commercialName: 'Loja Maria', sellerType: 'sociedade', taxId: '510012345', city: 'Bissau', address: 'Av. Amílcar Cabral 120', phone: '955000001', country: 'BR', email: 'contato@lojamaria.com', preferredCurrency: 'EUR', kycStatus: 'verified', verificationDate: '01/01/2026' };
  const html = render(server);
  report('D1 titular, nome comercial, e-mail comercial, documento, cidade e endereço aparecem nos campos', ['Maria Pereira da Silva', 'Loja Maria', 'contato@lojamaria.com', '510012345', 'Bissau', 'Av. Amílcar Cabral 120'].every((x) => html.includes(`value="${x}"`)), html.slice(0, 200));
  report('D2 tipo de vendedor, país e moeda preferida vêm selecionados', /<option value="sociedade" selected/.test(html) && /<option value="BR" selected|<option value="BR">/.test(html) && /<option value="EUR" selected/.test(html), html.match(/<select[\s\S]*?<\/select>/g)?.map((s) => s.slice(0, 160)));
  report('D3 titular e nome comercial são campos distintos (rótulos próprios)', /Nome Completo do Titular/.test(html) && /Nome Comercial da Loja/.test(html) && !/Nome Comercial \/ Razão Social/.test(html));
  report('D4 e-mail comercial separado do login (aviso na tela) e moeda sem mexer em saques (aviso na tela)', /e-mail de login da conta não muda/.test(html) && /Carteiras e saques continuam por moeda/.test(html));
  report('D5 KYC verificado: selo "VERIFICADO"; sem aviso de reverificação', /VERIFICADO/.test(html) && !/REVERIFICAÇÃO/.test(html) && !html.includes('seller-account-reverification-notice'));
  const pending = render({ ...server, kycStatus: 'pending', kycReverification: { required: true, changes: [{ field: 'taxId', label: 'Documento fiscal' }] } });
  report('D6 reverificação pendente: selo "REVERIFICAÇÃO PENDENTE" (não "VERIFICADO"), aviso com o que mudou e botão para o KYC', /REVERIFICAÇÃO PENDENTE/.test(pending) && !/>\s*VERIFICADO/.test(pending) && pending.includes('seller-account-reverification-notice') && /Documento fiscal/.test(pending) && /Ir para o KYC/.test(pending) && !/Aprovado em/.test(pending), pending.slice(0, 100));
  const nulls = render({ ...initialSellerProfile, id: 'sel_2', sellerType: undefined, email: undefined, preferredCurrency: undefined });
  report('D7 perfil sem tipo/e-mail/moeda: telas sem "undefined"/"null" nos campos', !/value="(undefined|null)"/.test(nulls));

  // ---------- E. travas no código
  const acc = src('src/components/seller/SellerAccount.tsx'), srv = src('src/server/sellerRoutes.ts'), kyc = src('src/server/modules/seller/kycService.ts');
  report('E1 tela envia os cinco campos + os três fiscais e NÃO envia companyName (razão social) com o nome do titular', /fullName, tradingName: commercialName, phone, sellerType, country, email, preferredCurrency, taxId, city, address/.test(acc) && !/companyName: fullName/.test(acc));
  report('E2 tela pede confirmação explícita antes da reverificação e só reenvia com confirmReverification', acc.includes('seller-account-reverify-confirm') && acc.includes('confirmReverification: true') && acc.includes('submitAccount(true)'));
  report('E3 sucesso só depois do servidor confirmar (retorno antecipado em falha) e nome atualizado no cabeçalho', acc.indexOf('if (!result.ok)') > 0 && acc.indexOf('if (!result.ok)') < acc.indexOf('updateUser({ name: saved.fullName })') && acc.indexOf('updateUser({ name: saved.fullName })') < acc.indexOf('onUpdateProfile({'));
  report('E4 hidratação de todos os campos respeitando o que a pessoa já digitou', ['fullName', 'commercialName', 'sellerType', 'taxId', 'country', 'city', 'address', 'phone', 'email', 'preferredCurrency'].every((k) => acc.includes(`if (!d.${k})`)));
  const patch = srv.slice(srv.indexOf("sellerRouter.patch('/profile'"), srv.indexOf("sellerRouter.get('/shipping-policy'"));
  report('E5 PATCH: nunca escreve em users.email, carteiras, saques, contas de saque nem escrow', !/update\(users\)\.set\(\{[^}]*email/i.test(patch) &&!/update\(wallets\)|update\(sellerPayouts\)|update\(sellerBankAccounts\)|update\(escrowAccounts\)|insert\(wallets\)/.test(patch));
  report('E6 PATCH: valida tudo, guarda de país e confirmação ANTES da transação', patch.indexOf('validateAccountPatch(') < patch.indexOf('COUNTRY_CHANGE_BLOCKED') && patch.indexOf('COUNTRY_CHANGE_BLOCKED') < patch.indexOf('KYC_REVERIFICATION_REQUIRED') && patch.indexOf('KYC_REVERIFICATION_REQUIRED') < patch.indexOf('await db.transaction('));
  report('E7 reverificação: status vira pending, auditoria gravada, KYC só reaprovado manualmente (guarda na aprovação e no envio)', /status: 'pending'/.test(patch) && patch.includes("action: 'seller.kyc.reverification_required'") && kyc.includes('ctx.reverification?.required') && srv.includes("rvNeeds.includes('identityDocument')"));
  report('E8 KYC reenviado sincroniza o tipo de vendedor com a classe do KYC (sem divergência)', kyc.includes('sellerTypeToAccountType(acc.sellerType)') && kyc.includes('defaultSellerTypeFor(meta.accountType)'));
  report('E9 /settings não expõe chaves internas', (srv.match(/account: _accountInternal, kycReverification: _rvInternal/g) || []).length === 2);
  let schemaChanged = '';
  try { schemaChanged = execSync('git diff --name-only bb72c30 -- src/db drizzle', { encoding: 'utf8' }).trim(); } catch { schemaChanged = 'erro-git'; }
  report('E10 sem migração e sem mudança de schema (src/db e drizzle iguais ao último commit publicado)', schemaChanged === '', schemaChanged);

  console.log(`\n${pass}/${pass + fail} passaram`);
  process.exit(fail ? 1 : 0);
})();
