/**
 * Onboarding/KYC do vendedor — regras (puras), erros do servidor no cliente, checklist de requisitos (SSR), tela real (SSR) e travas no
 * codigo da tela. Sem banco, sem rede.
 */
import React from 'react';
import fs from 'fs';
import { renderToStaticMarkup } from 'react-dom/server';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  kycCountryRules, kycRequirements, kycStepsFor, normalizeKycAccountType, summarizeKycIssues, validateKycForApproval, validateKycSubmission, type KycSubmissionInput,
} from '../src/utils/sellerKycRules.js';
import { classifyKycLoad, classifyKycLoadError, firstStepWithIssue, issuesByField, kycIssuesFromError, resolveStepTarget, validateKycForm, type KycFormSnapshot } from '../src/utils/kycClient.js';
import { KycFieldError, KycRequirementsChecklist } from '../src/components/seller/KycRequirementsChecklist.js';
import { SellerKyc } from '../src/components/seller/SellerKyc.js';

let pass = 0, fail = 0;
const report = (n: string, ok: boolean, d?: unknown) => { ok ? pass++ : fail++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}${ok ? '' : '  => ' + JSON.stringify(d ?? null).slice(0, 500)}`); };
const NOW = new Date('2026-10-10T12:00:00Z');
const base = (o: Partial<KycSubmissionInput> = {}): KycSubmissionInput => ({
  accountType: 'pf', legalName: 'Maria da Silva', birthDate: '1990-05-17', taxId: '123456789', phone: '+245 955000001', documentType: 'bi', documentNumber: 'BI123456',
  hasIdentityDocument: true, hasProofOfAddress: true, hasSelfie: true, hasBusinessLicense: false, ...o,
});
const fieldsOf = (i: { field: string }[]) => i.map((x) => x.field).sort().join();

// ---------- A. tipo de conta e etapas
report('A1 normaliza o tipo: "pf"/"pessoa_fisica"/"Pessoa Física" => pf; "empresa"/"Pessoa Jurídica" => empresa; vazio/desconhecido => null (nunca assume)', normalizeKycAccountType('pf') === 'pf' && normalizeKycAccountType('Pessoa Física') === 'pf' && normalizeKycAccountType('pessoa_fisica') === 'pf' && normalizeKycAccountType('empresa') === 'empresa' && normalizeKycAccountType('Pessoa Jurídica') === 'empresa' && normalizeKycAccountType('') === null && normalizeKycAccountType(undefined) === null && normalizeKycAccountType('x') === null);
const stepsPf = kycStepsFor('pf').map((s) => s.key), stepsEmp = kycStepsFor('empresa').map((s) => s.key);
report('A2 PESSOA FISICA nao tem a etapa "business" (registro empresarial); EMPRESA tem, depois do comprovante de residencia', !stepsPf.includes('business') && stepsEmp.join() === 'account_type,person,identity,address,business,payout,countries,selfie' && stepsPf.join() === 'account_type,person,identity,address,payout,countries,selfie');
report('A3 sem tipo escolhido tambem nao mostra a etapa de empresa', !kycStepsFor(null).some((s) => s.key === 'business'));
report('A4 requisitos: PF nao lista registro empresarial; empresa lista; sem tipo so pede o tipo', !kycRequirements('pf', 'GW').some((r) => r.key === 'businessLicense') && kycRequirements('empresa', 'GW').some((r) => r.key === 'businessLicense' && r.kind === 'document') && kycRequirements(null, 'GW').map((r) => r.key).join() === 'accountType');
report('A5 rotulos do NIF por pais e tipo (GW, BR, PT, outro)', kycRequirements('pf', 'BR').find((r) => r.key === 'taxId')?.label === 'CPF Pessoal' && kycRequirements('empresa', 'BR').find((r) => r.key === 'taxId')?.label === 'CNPJ Comercial' && kycRequirements('pf', 'GW').find((r) => r.key === 'taxId')?.label === 'NIF / BI Pessoal' && kycRequirements('empresa', 'PT').find((r) => r.key === 'taxId')?.label === 'NIPC / NIF Comercial' && kycRequirements('pf', 'AO').find((r) => r.key === 'taxId')?.label === 'NIF Pessoal / Tax ID');

// ---------- B. validacao do envio
report('B1 PF completa: sem problemas (e sem exigir documento de empresa)', validateKycSubmission(base(), 'GW', NOW).length === 0);
report('B2 PF com TUDO vazio: problemas em cada campo/documento obrigatorio, nenhum de empresa', fieldsOf(validateKycSubmission({ accountType: 'pf' }, 'GW', NOW)) === 'birthDate,documentNumber,documentType,identityDocument,legalName,phone,proofOfAddress,selfie,taxId');
report('B3 EMPRESA sem registro empresarial: problema em "businessLicense" (com mensagem e etapa "business")', (() => { const i = validateKycSubmission(base({ accountType: 'empresa' }), 'GW', NOW); return fieldsOf(i) === 'businessLicense' && i[0].step === 'business' && /registro empresarial/i.test(i[0].message); })());
report('B4 EMPRESA com registro: sem problemas', validateKycSubmission(base({ accountType: 'empresa', hasBusinessLicense: true }), 'GW', NOW).length === 0);
report('B5 sem tipo de conta => so o problema do tipo (accountType) — nada mais e avaliado', (() => { const i = validateKycSubmission(base({ accountType: undefined }), 'GW', NOW); return i.length === 1 && i[0].field === 'accountType' && i[0].step === 'account_type'; })());
report('B6 cada falta de documento tem mensagem propria (identidade, comprovante, selfie)', (() => { const i = validateKycSubmission(base({ hasIdentityDocument: false, hasProofOfAddress: false, hasSelfie: false }), 'GW', NOW); const m = Object.fromEntries(i.map((x) => [x.field, x.message])); return /identidade/i.test(m.identityDocument) && /comprovante de residência/i.test(m.proofOfAddress) && /selfie/i.test(m.selfie); })());
report('B7 nascimento: futuro, menor de 18, formato invalido, 30/02 invalido, exatamente 18 hoje ok', (() => {
  const f = (d: string) => validateKycSubmission(base({ birthDate: d }), 'GW', NOW).find((x) => x.field === 'birthDate')?.message;
  return /futuro/.test(f('2027-01-01') || '') && /18 anos/.test(f('2010-01-01') || '') && /Informe/.test(f('17/05/1990') || '') && /inválida/.test(f('1990-02-30') || '') && f('2008-10-10') === undefined && /18 anos/.test(f('2008-10-11') || '');
})());
report('B8 telefone: aceita +245 955 000 001 e (21) 99999-9999; recusa letras e numero curto', (() => { const f = (p: string) => validateKycSubmission(base({ phone: p }), 'GW', NOW).some((x) => x.field === 'phone'); return !f('+245 955 000 001') && !f('(21) 99999-9999') && f('abc') && f('123') && f('') ; })());
report('B9 nome: vazio, so simbolos e curto demais recusados; acentos e apostrofos aceitos', (() => { const f = (n: string) => validateKycSubmission(base({ legalName: n }), 'GW', NOW).some((x) => x.field === 'legalName'); return f('') && f('  ') && f('12') && f('ab') === true && !f('João D\'Ávila Sanhá'); })());
report('B10 numero do documento: curto/simbolos recusados', (() => { const f = (n: string) => validateKycSubmission(base({ documentNumber: n }), 'GW', NOW).some((x) => x.field === 'documentNumber'); return f('1') && f('@@@@@') && !f('P1234567') && !f('1234 5678-9'); })());
// por pais
const tax = (type: 'pf' | 'empresa', country: string, v: string) => kycCountryRules(country).validateTaxId(v, type);
report('B11 Brasil: CPF valido (529.982.247-25) passa; invalido e sequencia repetida recusados; CNPJ valido (11.222.333/0001-81) passa, CPF no lugar do CNPJ recusado', tax('pf', 'BR', '529.982.247-25') === null && !!tax('pf', 'BR', '123.456.789-00') && !!tax('pf', 'BR', '111.111.111-11') && tax('empresa', 'BR', '11.222.333/0001-81') === null && !!tax('empresa', 'BR', '529.982.247-25'));
report('B12 Portugal: NIF 123456789 e 999999990 validos; 123456780 e 12345678 recusados', tax('pf', 'PT', '123456789') === null && tax('empresa', 'PT', '999999990') === null && !!tax('pf', 'PT', '123456780') && !!tax('pf', 'PT', '12345678'));
report('B13 Guine-Bissau e demais: 5 a 20 caracteres com ao menos um digito; "ab" e "abcdef" (sem digito) recusados', tax('pf', 'GW', '1234567') === null && tax('pf', 'GW', 'BI-123456') === null && !!tax('pf', 'GW', 'ab') && !!tax('pf', 'GW', 'abcdef') && tax('pf', 'AO', '5417000123') === null);
report('B14 documento de identidade por pais: Brasil nao aceita "bi"; GW e PT aceitam passaporte/bi/cni', (() => { const f = (c: string, t: string) => validateKycSubmission(base({ documentType: t }), c, NOW).some((x) => x.field === 'documentType'); return f('BR', 'bi') && !f('BR', 'cni') && !f('GW', 'bi') && !f('PT', 'passport') && f('GW', 'carteira'); })());
report('B15 resumo textual lista os rotulos sem repetir', (() => { const s = summarizeKycIssues(validateKycSubmission({ accountType: 'pf' }, 'GW', NOW)); return /^Faltam ou estão inválidos: /.test(s) && s.includes('Selfie') && s.split(';').length === 9; })());

// ---------- C. aprovacao (admin)
const ap = (o: any = {}) => validateKycForApproval({ accountType: 'pf', legalName: 'Maria', documentNumber: 'BI1', taxId: '', phone: '955', hasIdentityDocument: true, hasProofOfAddress: true, hasSelfie: true, hasBusinessLicense: false, ...o }, 'GW');
report('C1 PF completa pode ser aprovada (sem exigir NIF nem registro empresarial)', ap().length === 0);
report('C2 PF sem selfie / sem comprovante / sem identidade: bloqueada com o campo certo', fieldsOf(ap({ hasSelfie: false, hasProofOfAddress: false, hasIdentityDocument: false })) === 'identityDocument,proofOfAddress,selfie');
report('C3 empresa sem registro, ou com NIF igual ao telefone (preenchimento inicial), ou NIF invalido: bloqueada', fieldsOf(ap({ accountType: 'empresa' })) === 'businessLicense,taxId' && fieldsOf(ap({ accountType: 'empresa', hasBusinessLicense: true, taxId: '955' })) === 'taxId' && ap({ accountType: 'empresa', hasBusinessLicense: true, taxId: '987654321' }).length === 0);
report('C4 cadastro antigo sem tipo: com registro empresarial anexado e tratado como empresa; sem ele, so o conjunto comum', ap({ accountType: undefined, hasBusinessLicense: true }).some((i) => i.field === 'taxId') && ap({ accountType: undefined }).length === 0);
report('C5 sem nome ou sem numero do documento: bloqueada', fieldsOf(ap({ legalName: '', documentNumber: '' })) === 'documentNumber,legalName');

// ---------- D. cliente: erros do servidor, navegacao e estado
const snap = (o: Partial<KycFormSnapshot> = {}): KycFormSnapshot => ({ accountType: 'pf', fullName: 'Maria da Silva', birthDate: '1990-05-17', taxId: '123456789', phone: '+245 955000001', docType: 'bi', docNumber: 'BI123456', hasIdentityDocument: true, hasProofOfAddress: true, hasSelfie: true, hasBusinessLicense: false, ...o });
report('D1 validateKycForm segue as mesmas regras do servidor (valido => vazio; sem selfie => selfie)', validateKycForm(snap(), 'GW', NOW).length === 0 && fieldsOf(validateKycForm(snap({ hasSelfie: false }), 'GW', NOW)) === 'selfie');
const serverErr = { message: 'Request failed with status code 400', response: { status: 400, data: { success: false, message: 'Faltam ou estão inválidos: Registro empresarial', error: { code: 'KYC_VALIDATION_FAILED', details: [{ field: 'businessLicense', label: 'Registro empresarial / NIF comercial (arquivo)', message: 'Envie o registro empresarial.', step: 'business' }, { field: 'x', message: 5 }, null] } } } };
const ie = kycIssuesFromError(serverErr);
report('D2 erro 400 estruturado do servidor vira problemas por campo (ignora itens malformados) e a mensagem legivel — nunca "status code 400"', ie.structured && ie.issues.length === 1 && ie.issues[0].field === 'businessLicense' && ie.issues[0].step === 'business' && !/status code/.test(ie.message) && /Registro empresarial/.test(ie.message), ie);
report('D3 400 sem detalhes mas com mensagem: usa a mensagem do servidor', kycIssuesFromError({ message: 'Request failed with status code 400', response: { status: 400, data: { success: false, error: { code: 'X', message: 'Documentos obrigatórios ausentes: Selfie' } } } }).message === 'Documentos obrigatórios ausentes: Selfie');
report('D4 sem corpo: mensagem por status (413 arquivo grande, 401/403 sessao, 500 servidor, 400 generico) e nunca o texto cru do axios', /grande demais/.test(kycIssuesFromError({ response: { status: 413 } }).message) && /sessão/.test(kycIssuesFromError({ response: { status: 401 } }).message) && /dados foram mantidos/.test(kycIssuesFromError({ response: { status: 500 } }).message) && /campos obrigatórios/.test(kycIssuesFromError({ message: 'Request failed with status code 400', response: { status: 400 } }).message) && kycIssuesFromError(new Error('Sem conexão com a internet.')).message === 'Sem conexão com a internet.');
report('D5 resposta {success:false,message} (sem lancar) tambem e interpretada', kycIssuesFromError({ response: { data: { success: false, message: 'Selfie ausente' } } }).message === 'Selfie ausente');
const issuesAll = validateKycForm(snap({ accountType: 'empresa', fullName: '', hasSelfie: false }), 'GW', NOW);
report('D6 primeira etapa com problema (ordem do tipo de conta) e mapa campo->mensagem', firstStepWithIssue(issuesAll, 'empresa') === 'person' && Object.keys(issuesByField(issuesAll)).sort().join() === 'businessLicense,legalName,selfie');
report('D7 NAO avanca com problema antes: de "identity" para "selfie" com a etapa "person" invalida => vai para "person" (blocked); voltar e livre; avancar valido e livre', (() => {
  const bad = validateKycForm(snap({ fullName: '' }), 'GW', NOW);
  const a = resolveStepTarget('identity', 'selfie', bad, 'pf'); const b = resolveStepTarget('identity', 'person', bad, 'pf'); const c = resolveStepTarget('person', 'identity', [], 'pf');
  return a.blocked && a.step === 'person' && !b.blocked && b.step === 'person' && !c.blocked && c.step === 'identity';
})());
report('D8 PF: etapa de empresa nao existe na ordem — de "address" o proximo valido e "payout"', resolveStepTarget('address', 'business', [], 'pf').step === 'address' && resolveStepTarget('address', 'payout', [], 'pf').step === 'payout');

// ---------- E. checklist e erro de campo (SSR)
const ck = (type: any, done: any, issues: any[] = []) => renderToStaticMarkup(<KycRequirementsChecklist accountType={type} country="GW" done={done} issues={issues} />);
const ckPf = ck('pf', { accountType: true, legalName: true });
report('E1 PF: checklist mostra os obrigatorios com asterisco, o aviso "nao sao exigidos documentos de empresa" e nenhum item de registro empresarial', /data-testid="kyc-pf-note"/.test(ckPf) && /não<\/strong> são exigidos documentos de empresa/.test(ckPf) && !/kyc-req-businessLicense/.test(ckPf) && /kyc-req-selfie/.test(ckPf) && /aria-hidden="true">\*</.test(ckPf));
const ckEmp = ck('empresa', {});
report('E2 EMPRESA: o checklist inclui o registro empresarial e nao mostra o aviso de pessoa fisica', /kyc-req-businessLicense/.test(ckEmp) && !/kyc-pf-note/.test(ckEmp));
const ckState = ck('pf', { legalName: true }, [{ field: 'selfie', label: 'Selfie', message: 'x', step: 'selfie' }]);
report('E3 estados visuais: pronto (ok), com problema (bad) e pendente (todo)', /data-testid="kyc-req-legalName" data-state="ok"/.test(ckState) && /data-testid="kyc-req-selfie" data-state="bad"/.test(ckState) && /data-testid="kyc-req-taxId" data-state="todo"/.test(ckState));
report('E4 sem tipo escolhido: orienta a escolher na etapa 1 e lista so o tipo', /Escolha o tipo de conta/.test(ck(null, {})) && !/kyc-req-legalName/.test(ck(null, {})));
const fe = renderToStaticMarkup(<KycFieldError id="kyc-error-selfie" message="Envie a selfie." />);
report('E5 erro junto do campo: role=alert, id para aria-describedby; sem mensagem nao renderiza nada', /role="alert"/.test(fe) && /id="kyc-error-selfie"/.test(fe) && /Envie a selfie\./.test(fe) && renderToStaticMarkup(<KycFieldError id="x" />) === '');

// ---------- F. tela real (SSR do estado inicial)
const qc = new QueryClient();
const screen = renderToStaticMarkup(
  <QueryClientProvider client={qc}><SellerKyc profile={{ fullName: 'Maria', country: 'GW', phone: '955000001', taxId: '', kycStatus: 'pending' } as any} showToast={() => {}} onNavigateSection={() => {}} /></QueryClientProvider>,
);
report('F1 tela inicial: sem tipo pre-selecionado (nenhum "SELECIONADO"), as duas opcoes como radio, checklist de obrigatorios e etapas sem a de empresa', !/SELECIONADO/.test(screen) && (screen.match(/role="radio"/g) || []).length === 2 && (screen.match(/aria-checked="false"/g) || []).length === 2 && /kyc-type-pf/.test(screen) && /kyc-type-empresa/.test(screen), screen.slice(0, 200));
report('F2 tela inicial mostra o checklist e as 7 etapas (sem "Registro Empresarial") enquanto nao ha tipo', /data-testid="kyc-requirements"/.test(screen) && !/kyc-step-business/.test(screen) && (screen.match(/data-testid="kyc-step-/g) || []).length === 7 && /Pessoa Física \/ Autônomo/.test(screen) && /Empresa \/ Sociedade Comercial/.test(screen));
report('F3 tela inicial indica obrigatoriedade (asterisco/sr-only) e que os documentos dependem da escolha', /Os documentos exigidos dependem desta escolha/.test(screen) && /\(obrigatório\)/.test(screen));

// ---------- G. travas no codigo
const src = fs.readFileSync('src/components/seller/SellerKyc.tsx', 'utf8');
report('G1 a tela nao assume mais "empresa" por padrao nem usa etapa numerica fixa (currentStep)', !/useState<'empresa' \| 'pf'>\('empresa'\)/.test(src) && !/currentStep/.test(src) && /useState<KycAccountType \| null>\(null\)/.test(src));
report('G2 a etapa de registro empresarial so aparece quando o tipo e empresa (lista de etapas vem de kycStepsFor)', /kycStepsFor\(accountType\)/.test(src) && /stepKey === 'business'/.test(src));
const iVal = src.indexOf('liveIssues.length > 0'), iUp = src.indexOf('uploadService.uploadKyc');
report('G3 o envio valida ANTES de qualquer upload e nao envia nada com campo/documento faltando', iVal > 0 && iUp > iVal && /firstStepWithIssue\(liveIssues, accountType\)/.test(src));
report('G4 uploads sao guardados e reutilizados (nenhum arquivo e reenviado nem perdido depois de um erro); empresa so envia documento de empresa', /upOnce/.test(src) && /uploaded\[key\] \?\? null/.test(src) && /accountType === 'empresa' \? await upOnce\(companyFile/.test(src) && /businessLicenseUrl: accountType === 'empresa'/.test(src));
report('G5 erros do servidor mapeados para os campos (kycIssuesFromError) e a pessoa e levada a primeira etapa com problema; mensagem mostrada', /kycIssuesFromError\(err\)/.test(src) && /setServerIssues\(failure\.issues\)/.test(src) && /showToast\(failure\.message\)/.test(src));
report('G6 campos obrigatorios com asterisco, aria-invalid e mensagem junto do campo (nome, nascimento, NIF, telefone, tipo, numero, 3 documentos, registro)', ['legalName', 'birthDate', 'taxId', 'phone', 'documentType', 'documentNumber', 'identityDocument', 'proofOfAddress', 'businessLicense', 'selfie'].every((f) => src.includes(`id="kyc-error-${f}"`)) && (src.match(/aria-invalid=/g) || []).length >= 6 && (src.match(/<RequiredMark \/>/g) || []).length >= 8);
report('G7 painel de erros no topo (role=alert) com atalho para a etapa de cada problema; etapas com problema marcadas', /data-testid="kyc-error-summary"/.test(src) && /data-problem=\{hasProblem/.test(src));
report('G8 "Proxima Etapa" so avanca se a etapa atual estiver valida (goNext -> goToStep -> resolveStepTarget) e o botao de enviar fica na ultima etapa', /const goNext = /.test(src) && /resolveStepTarget\(stepKey, target, liveIssues, accountType\)/.test(src) && /data-testid="kyc-submit"/.test(src));
report('G9 passos de saque e paises seguem opcionais (nao entram na validacao) e a conta de saque nao foi alterada', /\(opcional\)/.test(src) && !/payoutAccount[^\n]*liveIssues/.test(src));
report('G10 dados preenchidos nunca sao zerados no erro (nenhum setFullName(\'\')/setDocFile(null) no caminho de falha); so os arquivos ja enviados com sucesso saem do estado', !/catch \(err: any\) \{[\s\S]{0,900}setFullName\(/.test(src.slice(src.indexOf('const handleCompleteKyc'))));
const adm = fs.readFileSync('src/components/admin/AdminKycReview.tsx', 'utf8');
report('G11 admin: mostra o que falta (missingRequirements), desabilita "Aprovar" quando incompleto e exibe a causa do servidor', /data-testid="kyc-missing"/.test(adm) && (adm.match(/disabled=\{\(/g) || []).length >= 2 && /kycIssuesFromError\(err\)\.message/.test(adm));

// ---------- H. sem verificacao biometrica fantasma + aviso de onboarding correto
const kycFiles = ['src/components/admin/AdminKycReview.tsx', 'src/components/seller/SellerKyc.tsx', 'src/components/seller/KycRequirementsChecklist.tsx'].map((f) => fs.readFileSync(f, 'utf8'));
const claim = /Comparação Facial|98,4|% Compatível|reconhecimento facial|verificação biométrica|biometria|face match|liveness/i;
report('H1 nenhuma tela de KYC afirma comparacao facial/biometrica automatica ("Comparação Facial IA", "98,4% Compatível" e similares removidos)', kycFiles.every((s) => !claim.test(s)), kycFiles.map((s) => s.match(claim)?.[0]));
report('H2 admin: a conferencia da selfie e declarada MANUAL e a analise documental e a aprovacao continuam (botoes Aprovar/Rejeitar e visualizador)', /data-testid="kyc-manual-check"/.test(kycFiles[0]) && /Manual — compare a selfie com o documento/.test(kycFiles[0]) && /Análise documental/.test(kycFiles[0]) && /handleApprove\(k\.id\)/.test(kycFiles[0]) && /handleReject\(k\.id\)/.test(kycFiles[0]) && /Visualizador Detalhado/.test(kycFiles[0]) && !/Sparkles/.test(kycFiles[0]));
report('H3 classificacao do aviso: 404 SELLER_PROFILE_NOT_FOUND => no_seller; sucesso com data nula (vendedor sem KYC enviado) => not_submitted; com KYC (pendente/aprovado/rejeitado) => submitted', classifyKycLoad({ success: false, error: { code: 'SELLER_PROFILE_NOT_FOUND' } }) === 'no_seller' && classifyKycLoad({ success: true, data: null, sellerProfileExists: true, kycSubmitted: false }) === 'not_submitted' && classifyKycLoad({ success: true, data: { status: 'pending' } }) === 'submitted' && classifyKycLoad({ success: true, data: { status: 'verified' } }) === 'submitted' && classifyKycLoad({ success: true, data: { status: 'rejected' } }) === 'submitted' && classifyKycLoad({ success: true, data: null, kycSubmitted: true }) === 'submitted');
report('H4 o 404 lancado pelo axios tambem e reconhecido; outro erro nao vira "sem cadastro"', classifyKycLoadError({ response: { status: 404, data: { error: { code: 'SELLER_PROFILE_NOT_FOUND' } } } }) === 'no_seller' && classifyKycLoadError({ response: { status: 500, data: {} } }) === null && classifyKycLoadError(new Error('x')) === null);
const skSrc = fs.readFileSync('src/components/seller/SellerKyc.tsx', 'utf8');
report('H5 a tela so pede onboarding quando NAO existe cadastro de vendedor; data nula nao dispara o aviso e mostra "Nenhum documento enviado"', /classifyKycLoad\(res\)/.test(skSrc) && /loadState === 'no_seller'/.test(skSrc) && !/res\.data === null/.test(skSrc) && /NENHUM DOCUMENTO ENVIADO/.test(skSrc) && /Seu cadastro de vendedor já existe/.test(skSrc));

console.log(`\nRESULTADO: ${pass} PASS, ${fail} FAIL`);
process.exit(fail === 0 ? 0 : 1);
