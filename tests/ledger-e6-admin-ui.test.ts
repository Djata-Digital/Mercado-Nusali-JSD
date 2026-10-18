/**
 * E6 — INTERFACE DO LEDGER SOMBRA: regras puras (perfis, mensagens, validações) + travas de código da tela e do cliente de API. Sem rede/banco.
 * A autorização REAL é do servidor (tests/ledger-e6-admin-api.test.ts); aqui se garante que a tela não oferece o que o perfil não pode usar
 * e que ela não tem nenhum caminho para editar/apagar lançamentos nem para mexer em dinheiro real.
 */
import fs from 'fs';
import { canAdminLedger, canReadLedger, ledgerErrorMessage, minLen, parseMoney, newIdempotencyKey, fmtDate, fmtMoney } from '../src/utils/ledgerAdminView.js';

let pass = 0, fail = 0;
const report = (n: string, ok: boolean, d?: unknown) => { ok ? pass++ : fail++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}${ok ? '' : '  => ' + JSON.stringify(d ?? null).slice(0, 300)}`); };
const src = (p: string) => fs.readFileSync(p, 'utf8').split(String.fromCharCode(13, 10)).join(String.fromCharCode(10));

// ---- perfis (só UX; o servidor decide)
report('U1 leitura: GLOBAL_ADMIN, FINANCE e RISK_ANALYST; os demais perfis (SUPPORT, ADMIN, COUNTRY_REPRESENTATIVE, LOGISTICS, vendedor, cliente, vazio) não',
  ['GLOBAL_ADMIN', 'FINANCE', 'RISK_ANALYST', 'global_admin'].every((r) => canReadLedger(r)) && ['SUPPORT', 'ADMIN', 'COUNTRY_REPRESENTATIVE', 'LOGISTICS', 'SELLER', 'CUSTOMER', '', null, undefined].every((r) => !canReadLedger(r as any)));
report('U2 ações sensíveis: só GLOBAL_ADMIN (FINANCE e RISK_ANALYST consultam e propõem, mas não aprovam/reparam/descartam/revertem)', canAdminLedger('GLOBAL_ADMIN') && !canAdminLedger('FINANCE') && !canAdminLedger('RISK_ANALYST') && !canAdminLedger('ADMIN') && !canAdminLedger(undefined));

// ---- validações
report('U3 valor monetário: aceita 10, 10.5, 10,50; recusa 0, negativo, 3 casas, texto e vazio', parseMoney('10') === '10' && parseMoney('10.5') === '10.5' && parseMoney('10,50') === '10.50' && !parseMoney('0') && !parseMoney('-1') && !parseMoney('1.234') && !parseMoney('abc') && !parseMoney(''));
report('U4 mínimos de texto (espaços não contam)', minLen('   abcdefghij  ', 10) && !minLen('   abc   ', 10));
report('U5 chaves de idempotência únicas por abertura de formulário, com prefixo', newIdempotencyKey('ship-rev') !== newIdempotencyKey('ship-rev') && newIdempotencyKey('x').startsWith('x:'));
report('U6 mensagens: códigos do servidor viram texto claro (FOUR_EYES, SELLER_CAP_EXCEEDED, CONFIRMATION_REQUIRED, LEDGER_ADMIN_REQUIRED); 403/401 sem código têm texto; erro desconhecido tem texto padrão',
  /outro Administrador Geral/.test(ledgerErrorMessage({ response: { data: { error: { code: 'FOUR_EYES' } } } })) && /líquido \(N\)/.test(ledgerErrorMessage({ response: { data: { error: { code: 'SELLER_CAP_EXCEEDED' } } } })) &&
  /Confirme/.test(ledgerErrorMessage({ error: { code: 'CONFIRMATION_REQUIRED' } })) && /Administrador Geral/.test(ledgerErrorMessage({ code: 'LEDGER_ADMIN_REQUIRED' })) && /Sessão expirada/.test(ledgerErrorMessage({ response: { status: 401 } })) && /Não foi possível/.test(ledgerErrorMessage({})));
report('U7 formatação: data sem fuso tratada como UTC; valor inválido vira "—"', fmtDate('2026-10-17 00:00:00') === fmtDate('2026-10-17T00:00:00Z') && fmtDate(null) === '—' && fmtMoney('abc') === '—' && /10[.,]00/.test(fmtMoney(10)));

// ---- cliente de API
const api = src('src/api/clients/LedgerAdminApi.ts');
const verbs = [...api.matchAll(/apiClient\.(get|post|put|patch|delete)\(/g)].map((m) => m[1]);
report('A1 o cliente só usa GET e POST (nenhum PUT/PATCH/DELETE: não há como editar ou apagar lançamentos)', verbs.length >= 18 && verbs.every((v) => v === 'get' || v === 'post'), verbs);
report('A2 todas as chamadas vão para /admin/ledger e não existe rota de lançamento que escreva (POST só em outbox, repair-missing, findings/acknowledge, chargebacks, decisões, settlements, shipping-reversals)',
  api.includes("const base = '/admin/ledger'") && !/apiClient\.post\(`\$\{base\}\/transactions/.test(api) && [...api.matchAll(/apiClient\.post\(`\$\{base\}\/([a-z-]+)/g)].every((m) => ['outbox', 'repair-missing', 'findings', 'chargebacks', 'chargeback-decisions', 'chargeback-allocations', 'shipping-reversals'].includes(m[1])));
report('A3 o reparo manual repassa apply+confirm (o servidor recusa sem confirm) e as liquidações/reversões levam idempotencyKey', api.includes('static repairMissing(opts: { apply?: boolean; confirm?: boolean') && /static settle\([\s\S]{0,260}idempotencyKey: string/.test(api) && /static recordShippingReversal\([\s\S]{0,200}idempotencyKey: string/.test(api));

// ---- tela
const ui = src('src/components/admin/AdminLedgerManager.tsx');
const dash = src('src/components/AdminDashboardView.tsx');
report('I1 registrada no painel existente: item "Ledger Sombra" no grupo Transacional & Financeiro e renderização da aba (mesmo padrão showToast das demais)', dash.includes("import { AdminLedgerManager } from './admin/AdminLedgerManager'") && dash.includes("{ id: 'ledger', label: 'Ledger Sombra', icon: Scale }") && dash.includes("{activeTab === 'ledger' && <AdminLedgerManager showToast={showToast} />}") && /Transacional & Financeiro[\s\S]{0,1400}id: 'ledger'[\s\S]{0,400}Logística & Cadeia CPLP/.test(dash));
report('I2 perfis sem leitura veem "Acesso restrito" e NENHUMA chamada de API é feita (a trava vem antes de montar a parte que carrega dados)', /if \(!canReadLedger\(user\?\.role\)\) \{[\s\S]{0,400}Acesso restrito[\s\S]{0,400}return <LedgerInner/.test(ui));
report('I3 ações GLOBAL_ADMIN-only só aparecem para isAdmin: recolocar/descartar, reparo, reconhecer, aprovar/rejeitar, recuperação/baixa e reversão de frete', ui.includes('{isAdmin ? (\n            <div className="flex gap-2">') && ui.includes('{isAdmin && (\n        <div className={`${card} p-4 space-y-2`}>\n          <h3 className="font-black text-xs text-gray-800">Reparo manual') && ui.includes("isAdmin && detail.finding.status === 'OPEN'") && ui.includes("d.status === 'PROPOSED' && isAdmin") && ui.includes('{isAdmin ? (<><button className={btnGhost} onClick={() => setForm(form === \'settle\'') && /\{isAdmin \? \(\n\s+<div className=\{`\$\{card\} p-4 space-y-2`\}>\n\s+<h3[^>]*>Registrar reversão de custo de frete/.test(ui));
report('I4 quatro olhos na tela: o botão Aprovar fica desabilitado para quem propôs (o servidor também recusa)', ui.includes('disabled={d.proposed_by === userId}') && ui.includes('Quem propõe não pode aprovar'));
report('I5 reparo manual: simula primeiro, só habilita "Aplicar" após marcar a confirmação explícita, e envia apply+confirm', ui.includes('runRepair(false)') && ui.includes('disabled={repairBusy || !confirmApply}') && ui.includes('{ apply: true, confirm: true }') && ui.includes('Simular reparo'));
report('I6 motivos/notas obrigatórios antes de enviar (recolocar/descartar/reconhecer/rejeitar: ≥10; evidência ≥10; fundamentação ≥30; partes ouvidas ≥10; evidência da reversão ≥5)', ui.includes('disabled={busy || !minLen(text, min)}') && ui.includes('minLen(rationale, 30)') && ui.includes('minLen(heard, 10)') && ui.includes('minLen(description, 10)') && ui.includes('minLen(evidenceRef, 5)') && (ui.match(/min=\{10\}/g) || []).length >= 3);
report('I7 decisão de chargeback: exige evidência selecionada, soma das linhas = valor alocado por pedido, teto N do vendedor sinalizado, terceiro com referência contratual; só oferece propor sobre perda efetivamente debitada, depois da liberação e sem sobreposição com reembolso',
  ui.includes('evidenceIds.length > 0') && ui.includes('Math.abs(s - Number(a.allocated_value)) < 0.005') && ui.includes('a.seller_net_amount') && ui.includes("l.partyType !== 'THIRD_PARTY' || (l.partyRef.trim() && minLen(l.contractReference, 5))") && ui.includes("detail.chargeback.local_status === 'lost'") && ui.includes("a.release_stage === 'AFTER_RELEASE' && !a.overlap_refund"));
report('I8 sem atribuição automática: a proposta começa SEM parte e SEM valor em cada linha (nem vendedor nem Nusali pré-selecionados); o responsável é sempre escolhido explicitamente e o botão só habilita com parte escolhida', ui.includes("partyType: '' as const, partyRef: '', amount: ''") && !/partyType: 'SELLER' as const/.test(ui) && !/partyType: 'NUSALI' as const/.test(ui) && ui.includes("l.partyType !== '' && parseMoney(l.amount)"));
report('I9 avisos de segurança visíveis: sem dinheiro real / sem débito de carteira / lançamentos imutáveis / reconhecer não resolve', /Nenhuma carteira é debitada/.test(ui) && /não podem ser editados nem apagados/.test(ui) && /Isto não movimenta dinheiro real/.test(ui) && /NÃO resolve a divergência/.test(ui));
report('I10 a tela não exibe segredos: nenhuma referência a provider_raw_response, tokens, secrets ou ids de webhook; e não há botões/chamadas de edição ou exclusão de lançamentos', !/provider_raw_response|webhook_event|access_token|secret|password/i.test(ui) && !/LedgerAdminApi\.(update|delete|edit|remove|patch)/.test(ui) && !/>\s*(Editar|Excluir|Apagar)\s*</.test(ui));
report('I11 liquidação e reversão de frete usam chave de idempotência gerada na abertura do formulário (reenvio nunca duplica) e a reversão de frete só renova a chave após sucesso', ui.includes("useState(() => newIdempotencyKey('cb-settle'))") && ui.includes("useState(() => newIdempotencyKey('ship-rev'))") && ui.includes("setKey(newIdempotencyKey('ship-rev'))") && !/catch[^}]{0,200}setKey\(/.test(ui));

// ---- servidor: a tela só aponta rotas que existem
const routes = src('src/server/modules/ledger/admin/ledgerAdminRoutes.ts');
const apiPaths = [...api.matchAll(/`\$\{base\}\/([a-z-]+)/g)].map((m) => m[1]);
report('R1 todo caminho que o cliente chama existe no roteador do servidor', [...new Set(apiPaths)].every((p) => routes.includes(`'/${p}`) || routes.includes(`"/${p}`)), [...new Set(apiPaths)].filter((p) => !routes.includes(`'/${p}`)));
report('R2 o roteador é montado sob /admin (que já exige login e equipe interna) em /ledger', src('src/server/adminRoutes.ts').includes("adminRouter.use('/ledger', ledgerAdminRouter);"));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
