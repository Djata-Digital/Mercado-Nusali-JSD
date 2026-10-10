/**
 * Minha Conta de Vendedor — persistencia do titular, pais sede, tipo de vendedor, e-mail comercial e moeda preferida, e REVERIFICACAO
 * do KYC quando dados de identidade verificados mudam. Postgres 17 DESCARTAVEL, API real por HTTP. Nunca producao.
 */
process.env.REDIS_URL = '';
import { assertLedgerTestDatabaseGuard } from './ledgerTestDbGuard.js';
const testDbUrl = assertLedgerTestDatabaseGuard();
process.env.DATABASE_URL = testDbUrl;
process.env.NODE_ENV = 'test';
process.env.SKIP_RUNTIME_ALIGN = 'true';
process.env.JWT_ACCESS_SECRET = process.env.JWT_ACCESS_SECRET || 'test_fixture_jwt_secret_never_real_0123456789';
import 'dotenv/config';
import http from 'http';
import express from 'express';
import jwt from 'jsonwebtoken';
import pg from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import * as schema from '../src/db/schema.js';
import { users, sellers, sellerKyc, sellerProfiles, sellerDocuments, countries } from '../src/db/schema.js';
import { apiRouter } from '../src/server/api.js';
import { assessKycForApproval } from '../src/server/modules/seller/kycService.js';

if (!['localhost', '127.0.0.1'].includes(new URL(testDbUrl).hostname)) throw new Error('Somente banco local descartavel.');
let passed = 0, total = 0;
const report = (l: string, ok: boolean, d?: any) => { total++; if (ok) passed++; console.log(`[${ok ? 'PASS' : 'FAIL'}] ${l}${ok ? '' : ' -> ' + JSON.stringify(d ?? null).slice(0, 700)}`); };
let seq = 0;
const uid = (p: string) => `${p}_sf_${Date.now()}_${++seq}_${Math.random().toString(36).slice(2, 5)}`;
const tokenFor = (userId: string, role = 'SELLER') => jwt.sign({ userId, email: `${userId}@t.test`, role, fullName: `T ${userId}`, countryCode: 'GW', kycStatus: 'pending', isEmailVerified: true }, process.env.JWT_ACCESS_SECRET!);

async function main() {
  const pool = new pg.Pool({ connectionString: testDbUrl, ssl: { rejectUnauthorized: false }, max: 8 });
  const db = drizzle(pool, { schema });
  const q = async (s: string, p?: any[]) => (await pool.query(s, p)).rows;
  const app = express(); app.use(express.json()); app.use('/api/v1', apiRouter);
  const server = http.createServer(app); await new Promise<void>((r) => server.listen(0, r));
  const base = `http://localhost:${(server.address() as any).port}/api/v1`;
  const call = async (method: string, path: string, token: string | null, body?: any) => {
    const res = await fetch(`${base}${path}`, { method, headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), 'Content-Type': 'application/json' }, body: body !== undefined ? JSON.stringify(body) : undefined });
    let json: any = null; try { json = await res.json(); } catch { /* */ }
    return { status: res.status, json };
  };
  await db.insert(countries).values([
    { id: 'GW', code: 'GW', name: 'Guiné-Bissau', flag: 'x', currency: 'XOF', currencySymbol: 'CFA', phonePrefix: '+245', isActive: true, createdAt: new Date() },
    { id: 'BR', code: 'BR', name: 'Brasil', flag: 'x', currency: 'BRL', currencySymbol: 'R$', phonePrefix: '+55', isActive: true, createdAt: new Date() },
    { id: 'PT', code: 'PT', name: 'Portugal', flag: 'x', currency: 'EUR', currencySymbol: '€', phonePrefix: '+351', isActive: true, createdAt: new Date() },
    { id: 'ZZ', code: 'ZZ', name: 'Inativo', flag: 'x', currency: 'ZZD', currencySymbol: 'z', phonePrefix: '+999', isActive: false, createdAt: new Date() },
  ] as any).onConflictDoNothing();
  await q(`UPDATE countries SET is_active = true WHERE code IN ('GW','BR','PT')`);

  // insere uma linha MINIMA em qualquer tabela (FKs desligadas só nesta conexão) — usada para criar "movimento" do vendedor
  const insertMinimal = async (table: string, over: Record<string, any>) => {
    const c = await pool.connect();
    try {
      await c.query('SET session_replication_role = replica');
      const cols = (await c.query(`SELECT column_name, data_type FROM information_schema.columns WHERE table_schema='public' AND table_name=$1 AND is_nullable='NO' AND column_default IS NULL`, [table])).rows;
      const values: Record<string, any> = { ...over };
      for (const col of cols) {
        if (col.column_name in values) continue;
        const t = col.data_type;
        values[col.column_name] = /char|text/.test(t) ? `x_${Math.random().toString(36).slice(2, 8)}` : /numeric|integer|double|real/.test(t) ? 0 : t === 'boolean' ? false : /json/.test(t) ? '{}' : /timestamp/.test(t) ? new Date() : 'x';
      }
      const keys = Object.keys(values);
      await c.query(`INSERT INTO ${table} (${keys.join(',')}) VALUES (${keys.map((_, i) => `$${i + 1}`).join(',')})`, keys.map((k) => values[k]));
    } finally { await c.query('SET session_replication_role = DEFAULT').catch(() => {}); c.release(); }
  };

  const mk = async (opts: { country?: string; taxId?: string; approved?: boolean; settings?: any; name?: string; phone?: string } = {}) => {
    const { country = 'GW', taxId = '510012345', approved = false, settings = null, name = 'Maria da Silva', phone = '955000001' } = opts;
    const userId = uid('usr'), sellerId = uid('sel'), kycId = uid('kyc');
    await db.insert(users).values({ id: userId, email: `${userId}@t.test`, passwordHash: 'x', fullName: name, phone, role: 'SELLER', countryCode: country, kycStatus: approved ? 'verified' : 'unverified', isActive: true, isEmailVerified: true, isPhoneVerified: false, createdAt: new Date(), updatedAt: new Date() } as any);
    await db.insert(sellers).values({ id: sellerId, userId, companyName: 'Razão Social Lda', tradingName: 'Loja Maria', taxId, phone, countryCode: country, status: approved ? 'active' : 'pending', createdAt: new Date(), updatedAt: new Date() } as any);
    await db.insert(sellerProfiles).values({ id: uid('prof'), sellerId, settingsJson: settings } as any);
    if (approved) {
      await db.insert(sellerKyc).values({ id: kycId, sellerId, legalName: name, documentType: 'bi', documentNumber: 'BI1', documentFrontUrl: 'https://r2.example.invalid/kyc/old-id.jpg', selfieUrl: 'https://r2.example.invalid/kyc/old-selfie.jpg', proofOfAddressUrl: 'https://r2.example.invalid/kyc/old-addr.jpg', status: 'verified', reviewedAt: new Date('2026-01-01T00:00:00Z'), reviewerId: null, submittedAt: new Date('2025-12-01T00:00:00Z') } as any);
      for (const [t, f] of [['identity_document', 'old-id'], ['proof_of_address', 'old-addr'], ['selfie', 'old-selfie']]) {
        await db.insert(sellerDocuments).values({ id: uid('doc'), sellerId, documentType: t, fileUrl: `https://r2.example.invalid/kyc/${f}.jpg`, objectKey: `kyc/${f}.jpg`, status: 'verified', createdAt: new Date() } as any);
      }
    }
    return { userId, sellerId, kycId, token: tokenFor(userId), fresh: () => tokenFor(userId) };
  };
  const prof = async (t: string) => (await call('GET', '/seller/profile', t)).json?.data;
  const settingsOf = async (sellerId: string) => (await q('SELECT settings_json FROM seller_profiles WHERE seller_id=$1', [sellerId]))[0]?.settings_json ?? null;
  const rowOf = async (table: string, id: string) => (await q(`SELECT * FROM ${table} WHERE id=$1`, [id]))[0];
  const fields = (r: any) => (r.json?.error?.details ?? []).map((d: any) => d.field).sort().join();
  const adminUser = uid('adm');
  await db.insert(users).values({ id: adminUser, email: `${adminUser}@t.test`, passwordHash: 'x', fullName: 'Admin', phone: '1', role: 'GLOBAL_ADMIN', countryCode: 'GW', kycStatus: 'verified', isActive: true, isEmailVerified: true, isPhoneVerified: false, createdAt: new Date(), updatedAt: new Date() } as any);
  const adminToken = tokenFor(adminUser, 'GLOBAL_ADMIN');

  // ---------- A. persistência dos cinco campos (vendedor ainda não verificado)
  const a = await mk({ taxId: '510012345' });
  await call('PATCH', '/seller/profile', a.token, { city: 'Bissau', address: 'Av. Amílcar Cabral 120' });
  let r = await call('PATCH', '/seller/profile', a.token, { fullName: 'Maria Pereira da Silva', sellerType: 'sociedade', country: 'GW', email: 'Contato@LojaMaria.com', preferredCurrency: 'EUR' });
  report('A1 PATCH com os cinco campos → 200 e devolve o que ficou gravado', r.status === 200 && r.json?.data?.fullName === 'Maria Pereira da Silva' && r.json?.data?.sellerType === 'sociedade' && r.json?.data?.email === 'contato@lojamaria.com' && r.json?.data?.preferredCurrency === 'EUR' && r.json?.data?.country === 'GW', r);
  let p = await prof(a.token);
  report('A2 GET devolve os cinco campos', p?.fullName === 'Maria Pereira da Silva' && p?.sellerType === 'sociedade' && p?.email === 'contato@lojamaria.com' && p?.preferredCurrency === 'EUR' && p?.country === 'GW', p);
  p = await prof(a.fresh());
  report('A3 nova sessão (novo token) lê os mesmos valores', p?.fullName === 'Maria Pereira da Silva' && p?.sellerType === 'sociedade' && p?.email === 'contato@lojamaria.com' && p?.preferredCurrency === 'EUR', p);
  report('A4 os três campos fiscais e os demais dados continuam intactos', p?.taxId === '510012345' && p?.city === 'Bissau' && p?.address === 'Av. Amílcar Cabral 120' && p?.commercialName === 'Loja Maria' && p?.phone === '955000001', p);
  r = await call('PATCH', '/seller/profile', a.token, { preferredCurrency: 'BRL' });
  p = await prof(a.token);
  report('A5 parcial: só a moeda muda; titular, tipo e e-mail intactos', r.status === 200 && p.preferredCurrency === 'BRL' && p.fullName === 'Maria Pereira da Silva' && p.sellerType === 'sociedade' && p.email === 'contato@lojamaria.com', p);
  r = await call('PATCH', '/seller/profile', a.token, { email: 'vendas@lojamaria.com' });
  p = await prof(a.token);
  report('A6 parcial: só o e-mail muda', r.status === 200 && p.email === 'vendas@lojamaria.com' && p.preferredCurrency === 'BRL' && p.sellerType === 'sociedade', p);
  r = await call('PATCH', '/seller/profile', a.token, { phone: '955777888' });
  p = await prof(a.token);
  report('A7 salvar só o telefone não apaga nenhum dos campos', r.status === 200 && p.email === 'vendas@lojamaria.com' && p.sellerType === 'sociedade' && p.fullName === 'Maria Pereira da Silva' && p.city === 'Bissau', p);

  // ---------- B. titular não é nome comercial nem razão social; e-mail comercial não é o de login
  const row = await q('SELECT s.company_name, s.trading_name, u.full_name, u.email FROM sellers s JOIN users u ON u.id=s.user_id WHERE s.id=$1', [a.sellerId]);
  report('B1 mudar o titular altera users.full_name e NÃO a razão social nem o nome comercial', row[0].full_name === 'Maria Pereira da Silva' && row[0].company_name === 'Razão Social Lda' && row[0].trading_name === 'Loja Maria', row[0]);
  r = await call('PATCH', '/seller/profile', a.token, { tradingName: 'Nova Loja Comercial' });
  const row2 = await q('SELECT s.company_name, s.trading_name, u.full_name FROM sellers s JOIN users u ON u.id=s.user_id WHERE s.id=$1', [a.sellerId]);
  report('B2 mudar o nome comercial não altera o titular nem a razão social', r.status === 200 && row2[0].trading_name === 'Nova Loja Comercial' && row2[0].full_name === 'Maria Pereira da Silva' && row2[0].company_name === 'Razão Social Lda', row2[0]);
  report('B3 o e-mail de LOGIN não muda ao salvar o e-mail comercial (e vem separado no perfil)', row[0].email === `${a.userId}@t.test` && (await prof(a.token)).loginEmail === `${a.userId}@t.test`);
  const st = await call('GET', '/seller/settings', a.token);
  report('B4 /seller/settings não expõe chaves internas (account, fiscal, kyc, kycReverification)', !['account', 'fiscal', 'kyc', 'kycReverification'].some((k) => k in (st.json?.data ?? {})), st.json);

  // ---------- C. validação por campo (nada é gravado quando algo falha)
  const snap = async () => JSON.stringify({ s: await settingsOf(a.sellerId), u: (await q('SELECT full_name FROM users WHERE id=$1', [a.userId]))[0], t: (await q('SELECT trading_name, country_code, tax_id FROM sellers WHERE id=$1', [a.sellerId]))[0] });
  const before = await snap();
  r = await call('PATCH', '/seller/profile', a.token, { fullName: ' ', tradingName: 'Outro', email: 'sem-arroba', sellerType: 'inventado', preferredCurrency: 'ZZD', country: 'ZZ' });
  report('C1 todos inválidos → 400 com cada campo apontado e NADA gravado (nem o nome comercial)', r.status === 400 && fields(r) === 'country,email,fullName,preferredCurrency,sellerType' && (await snap()) === before, { f: fields(r), r: r.json });
  r = await call('PATCH', '/seller/profile', a.token, { fullName: 'x'.repeat(121) });
  report('C2 titular acima do limite → 400', r.status === 400 && fields(r) === 'fullName', r);
  r = await call('PATCH', '/seller/profile', a.token, { fullName: '12345' });
  report('C3 titular sem letras → 400', r.status === 400 && fields(r) === 'fullName', r);
  r = await call('PATCH', '/seller/profile', a.token, { email: '' });
  report('C4 e-mail comercial vazio → 400', r.status === 400 && fields(r) === 'email', r);
  r = await call('PATCH', '/seller/profile', a.token, { fullName: 123, sellerType: ['x'], country: {}, email: 5, preferredCurrency: true });
  report('C5 valores que não são texto → 400 (sem gravar)', r.status === 400 && (await snap()) === before, r);
  r = await call('PATCH', '/seller/profile', a.token, { country: 'ZZ' });
  report('C6 país inativo/inexistente → 400 no campo country', r.status === 400 && fields(r) === 'country', r);
  r = await call('PATCH', '/seller/profile', a.token, { preferredCurrency: 'xxx' });
  report('C7 moeda que nenhum país ativo usa (mesma regra dos saques) → 400', r.status === 400 && fields(r) === 'preferredCurrency', r);

  // ---------- D. moeda preferida não toca em carteira, saques nem contas
  const w = uid('wal'), bank = uid('bank');
  await insertMinimal('wallets', { id: w, user_id: a.userId, currency: 'XOF', balance: '1500.00' });
  await insertMinimal('seller_bank_accounts', { id: bank, seller_id: a.sellerId, currency: 'XOF', account_holder: 'Maria' });
  const money = async () => JSON.stringify({ w: await q('SELECT currency, balance FROM wallets WHERE user_id=$1 ORDER BY currency', [a.userId]), b: await q('SELECT id, currency FROM seller_bank_accounts WHERE seller_id=$1', [a.sellerId]), p: await q('SELECT count(*)::int AS n FROM seller_payouts WHERE seller_id=$1', [a.sellerId]) });
  const moneyBefore = await money();
  r = await call('PATCH', '/seller/profile', a.token, { preferredCurrency: 'XOF' });
  const r2 = await call('PATCH', '/seller/profile', a.token, { preferredCurrency: 'EUR' });
  report('D1 mudar a moeda preferida: carteira, saldo, contas de saque e saques ficam exatamente como estavam', r.status === 200 && r2.status === 200 && (await money()) === moneyBefore && (await prof(a.token)).preferredCurrency === 'EUR', { moneyBefore, after: await money() });

  // ---------- E. país sede
  const noFoot = await mk({ taxId: '510012345' });
  r = await call('PATCH', '/seller/profile', noFoot.token, { country: 'BR' });
  report('E1 trocar para o Brasil mantendo um NIF da Guiné (inválido como CPF/CNPJ) → 400 no documento, sem gravar', r.status === 400 && fields(r) === 'taxId' && (await prof(noFoot.token)).country === 'GW', r);
  r = await call('PATCH', '/seller/profile', noFoot.token, { country: 'BR', taxId: '529.982.247-25' });
  p = await prof(noFoot.token);
  report('E2 trocar para o Brasil informando CPF válido (sem loja/pedidos) → 200 e persiste', r.status === 200 && p.country === 'BR' && p.taxId === '529.982.247-25', r);
  report('E3 nova sessão lê o novo país', (await prof(noFoot.fresh())).country === 'BR');
  const footprints: Array<{ label: string; make: (s: { userId: string; sellerId: string }) => Promise<void> }> = [
    { label: 'loja', make: async (s) => insertMinimal('stores', { id: uid('sto'), seller_id: s.sellerId, slug: uid('slug') }) },
    { label: 'produto', make: async (s) => insertMinimal('products', { id: uid('prd'), seller_id: s.sellerId, slug: uid('slug') }) },
    { label: 'pedido', make: async (s) => insertMinimal('orders', { id: uid('ord'), seller_id: s.sellerId, order_number: uid('N') }) },
    { label: 'escrow', make: async (s) => insertMinimal('escrow_accounts', { id: uid('esc'), seller_id: s.sellerId, order_id: uid('ord') }) },
    { label: 'saque', make: async (s) => insertMinimal('seller_payouts', { id: uid('pay'), seller_id: s.sellerId }) },
  ];
  for (const f of footprints) {
    const s = await mk({ taxId: '529.982.247-25' });
    await f.make(s);
    const rr = await call('PATCH', '/seller/profile', s.token, { country: 'BR', taxId: '529.982.247-25' });
    report(`E4 com ${f.label} no histórico: trocar o país é bloqueado (409 COUNTRY_CHANGE_BLOCKED) e nada muda`, rr.status === 409 && rr.json?.error?.code === 'COUNTRY_CHANGE_BLOCKED' && fields(rr) === 'country' && (await prof(s.token)).country === 'GW', rr);
  }
  const keepCountry = await mk();
  await insertMinimal('stores', { id: uid('sto'), seller_id: keepCountry.sellerId, slug: uid('slug') });
  r = await call('PATCH', '/seller/profile', keepCountry.token, { country: 'GW', fullName: 'Nome Novo Titular' });
  report('E5 reenviar o MESMO país não é troca: com loja existente salva normalmente', r.status === 200 && (await prof(keepCountry.token)).fullName === 'Nome Novo Titular', r);

  // ---------- F. tipo de vendedor x KYC (vendedor não verificado)
  const t = await mk({ settings: { kyc: { accountType: 'pf', birthDate: '1990-05-17' } } });
  await insertMinimal('seller_kyc', { id: uid('kyc'), seller_id: t.sellerId, legal_name: 'Maria', document_type: 'bi', document_number: 'BI1', status: 'pending' });
  r = await call('PATCH', '/seller/profile', t.token, { sellerType: 'sociedade' });
  let ts = await settingsOf(t.sellerId);
  report('F1 KYC como pessoa física + tipo "sociedade": o tipo de conta do KYC passa a "empresa" (classe igual), sem mudar o status', r.status === 200 && ts?.kyc?.accountType === 'empresa' && ts?.kyc?.birthDate === '1990-05-17' && ts?.account?.sellerType === 'sociedade', ts);
  const assess = await assessKycForApproval(db, t.sellerId);
  report('F2 a aprovação passa a exigir o registro empresarial (o tipo de vendedor não contorna o KYC)', assess.issues.some((i) => i.field === 'businessLicense'), assess.issues.map((i) => i.field));
  r = await call('PATCH', '/seller/profile', t.token, { sellerType: 'marca_oficial' });
  report('F3 trocar entre tipos da mesma classe (empresa) não mexe no KYC', r.status === 200 && (await settingsOf(t.sellerId))?.kyc?.accountType === 'empresa' && (await prof(t.token)).sellerType === 'marca_oficial', r);
  r = await call('PATCH', '/seller/profile', t.token, { sellerType: 'pessoa_fisica' });
  report('F4 voltar para pessoa física volta o KYC para "pf" (não exige mais documentos de empresa)', r.status === 200 && (await settingsOf(t.sellerId))?.kyc?.accountType === 'pf', await settingsOf(t.sellerId));
  const legacy = await mk({ settings: { kyc: { accountType: 'empresa' } } });
  p = await prof(legacy.token);
  report('F5 sem tipo escolhido na conta, o tipo vem do KYC (empresa → empresa_individual)', p.sellerType === 'empresa_individual', p.sellerType);
  const none = await mk();
  report('F6 sem tipo na conta nem no KYC: sellerType nulo (a tela usa o padrão)', (await prof(none.token)).sellerType === null);

  // ---------- G. dados de identidade verificados → reverificação
  const v = await mk({ approved: true, taxId: '510012345', settings: { kyc: { accountType: 'pf', birthDate: '1990-05-17' }, account: { sellerType: 'pessoa_fisica' }, fiscal: { city: 'Bissau', address: 'Rua Verificada 1' } } });
  const kycSnap = async () => JSON.stringify({ k: await rowOf('seller_kyc', v.kycId), u: (await q('SELECT kyc_status, full_name FROM users WHERE id=$1', [v.userId]))[0], s: (await q('SELECT tax_id, country_code, status FROM sellers WHERE id=$1', [v.sellerId]))[0], st: await settingsOf(v.sellerId) });
  let vs = await kycSnap();
  r = await call('PATCH', '/seller/profile', v.token, { city: 'Gabú', address: 'Rua Nova da Sede 9', email: 'novo@loja.com', preferredCurrency: 'EUR', tradingName: 'Loja Renomeada', phone: '955000009' });
  report('G1 dados NÃO de identidade (cidade, endereço, e-mail, moeda, nome comercial, telefone) salvam sem mexer na verificação', r.status === 200 && (await rowOf('seller_kyc', v.kycId)).status === 'verified' && (await settingsOf(v.sellerId))?.kycReverification === undefined, r);
  vs = await kycSnap();
  r = await call('PATCH', '/seller/profile', v.token, { taxId: '510.012.345', fullName: 'MARIA DA SILVA' });
  report('G2 só formato (pontuação do documento, caixa do nome) NÃO é mudança de identidade', r.status === 200 && (await rowOf('seller_kyc', v.kycId)).status === 'verified', r);
  vs = await kycSnap();
  r = await call('PATCH', '/seller/profile', v.token, { taxId: '510099999' });
  report('G3 documento fiscal novo com KYC aprovado → 409 KYC_REVERIFICATION_REQUIRED, com a lista do que muda', r.status === 409 && r.json?.error?.code === 'KYC_REVERIFICATION_REQUIRED' && r.json?.error?.changes?.[0]?.field === 'taxId', r);
  report('G4 sem confirmação, NADA é gravado (documento, KYC, status do utilizador)', (await kycSnap()) === vs);
  r = await call('PATCH', '/seller/profile', v.token, { taxId: '510099999', confirmReverification: true });
  const kyc2 = await rowOf('seller_kyc', v.kycId);
  const st2 = await settingsOf(v.sellerId);
  report('G5 confirmado: documento gravado e KYC volta para "pending" (users.kyc_status também)', r.status === 200 && r.json?.data?.kycReverification?.required === true && kyc2.status === 'pending' && (await q('SELECT kyc_status FROM users WHERE id=$1', [v.userId]))[0].kyc_status === 'pending' && (await prof(v.token)).taxId === '510099999', { r: r.json, kyc2 });
  report('G6 histórico preservado: revisão anterior (data), documentos antigos e lista de mudanças ficam guardados', !!kyc2.reviewed_at && st2?.kycReverification?.previousReviewedAt === '2026-01-01T00:00:00.000Z' && st2?.kycReverification?.required === true && st2?.kycReverification?.previousStatus === 'verified' && String(st2?.kycReverification?.changes?.[0]?.from).replace(/[^0-9]/g, '') === '510012345' && st2?.kycReverification?.changes?.[0]?.to === '510099999' && (await q(`SELECT count(*)::int AS n FROM seller_documents WHERE seller_id=$1`, [v.sellerId]))[0].n === 3, { st2, kyc2 });
  const audit = await q(`SELECT details_json FROM audit_logs WHERE action='seller.kyc.reverification_required' AND resource_id=$1`, [v.kycId]);
  report('G7 trilha de auditoria: ação registrada com mudanças, status anterior e documentos anteriores', audit.length === 1 && audit[0].details_json?.changes?.[0]?.field === 'taxId' && audit[0].details_json?.previousStatus === 'verified' && audit[0].details_json?.previousDocuments?.length === 3, audit);
  report('G8 convivência: KYC, preferências e dados fiscais anteriores no JSONB permanecem', st2?.kyc?.accountType === 'pf' && st2?.fiscal?.city === 'Gabú' && st2?.account?.commercialEmail === 'novo@loja.com' && st2?.account?.preferredCurrency === 'EUR', st2);
  const ap1 = await call('POST', `/admin/kyc/${v.kycId}/approve`, adminToken, {});
  report('G9 o administrador NÃO consegue aprovar os novos dados enquanto o vendedor não reenviar (400 KYC_APPROVAL_BLOCKED)', ap1.status === 400 && ap1.json?.error?.code === 'KYC_APPROVAL_BLOCKED' && /Reverificação|reverifica|Dados de identidade/i.test(JSON.stringify(ap1.json)) && (await rowOf('seller_kyc', v.kycId)).status === 'pending', ap1);
  const file = (n: string) => ({ url: `https://r2.example.invalid/kyc/${n}.jpg`, objectKey: `kyc/${n}.jpg`, mimeType: 'image/jpeg', size: 1234 });
  const submitBody = (extra: any = {}) => ({ accountType: 'pf', legalName: 'Maria da Silva', birthDate: '1990-05-17', taxId: '510099999', phone: '+245 955000009', documentType: 'bi', documentNumber: 'BI777', selfieUrl: file('n-selfie').url, selfieMetadata: file('n-selfie'), proofOfAddressUrl: file('n-addr').url, addressMetadata: file('n-addr'), ...extra });
  const sub1 = await call('POST', '/seller/kyc/submit', v.token, submitBody());
  report('G10 reenviar o KYC SEM documento de identidade novo → 400 (o guardado não vale mais)', sub1.status === 400 && fields(sub1).includes('identityDocument'), sub1);
  const sub2 = await call('POST', '/seller/kyc/submit', v.token, submitBody({ documentFrontUrl: file('n-id').url, identityMetadata: file('n-id') }));
  const st3 = await settingsOf(v.sellerId);
  report('G11 reenviar com o documento novo → 200; a reverificação passa a "reenviada" (registro mantido) e o KYC fica pendente', sub2.status === 200 && st3?.kycReverification?.required === false && !!st3?.kycReverification?.resubmittedAt && st3?.kycReverification?.changes?.length === 1 && (await rowOf('seller_kyc', v.kycId)).status === 'pending', { sub2: sub2.json, st3 });
  const ap2 = await call('POST', `/admin/kyc/${v.kycId}/approve`, adminToken, {});
  report('G12 só depois do reenvio o administrador pode aprovar (decisão manual) → verified', ap2.status === 200 && (await rowOf('seller_kyc', v.kycId)).status === 'verified', ap2);

  // titular / país / classe com KYC aprovado
  const v2 = await mk({ approved: true, taxId: '510012345', settings: { kyc: { accountType: 'pf', birthDate: '1990-05-17' }, account: { sellerType: 'pessoa_fisica' } } });
  r = await call('PATCH', '/seller/profile', v2.token, { fullName: 'Outra Pessoa Totalmente' });
  report('G13 mudar o titular com KYC aprovado → 409 (identidade) e nada gravado', r.status === 409 && r.json?.error?.changes?.[0]?.field === 'fullName' && (await q('SELECT full_name FROM users WHERE id=$1', [v2.userId]))[0].full_name === 'Maria da Silva', r);
  r = await call('PATCH', '/seller/profile', v2.token, { sellerType: 'sociedade' });
  report('G14 pessoa física → sociedade com KYC aprovado → 409 (a classe do KYC muda)', r.status === 409 && r.json?.error?.changes?.[0]?.field === 'accountType', r);
  r = await call('PATCH', '/seller/profile', v2.token, { sellerType: 'sociedade', fullName: 'Maria da Silva', confirmReverification: true });
  const s5 = await settingsOf(v2.sellerId);
  report('G15 confirmado: tipo e KYC viram "empresa", status pendente, e a aprovação passa a exigir o registro empresarial', r.status === 200 && s5?.kyc?.accountType === 'empresa' && s5?.kycReverification?.required === true && (await rowOf('seller_kyc', v2.kycId)).status === 'pending' && (await assessKycForApproval(db, v2.sellerId)).issues.some((i) => i.field === 'businessLicense'), { s5 });
  const v3 = await mk({ approved: true, taxId: '510012345', settings: { kyc: { accountType: 'empresa' }, account: { sellerType: 'sociedade' } } });
  r = await call('PATCH', '/seller/profile', v3.token, { sellerType: 'marca_oficial' });
  report('G16 entre tipos da mesma classe com KYC aprovado: salva sem reverificação', r.status === 200 && (await rowOf('seller_kyc', v3.kycId)).status === 'verified', r);
  const v4 = await mk({ approved: true, taxId: '529.982.247-25', country: 'GW', settings: { kyc: { accountType: 'pf' } } });
  r = await call('PATCH', '/seller/profile', v4.token, { country: 'BR', taxId: '529.982.247-25', confirmReverification: true });
  const s6 = await settingsOf(v4.sellerId);
  report('G17 país sede com KYC aprovado (sem movimento): exige reverificação, e passa a exigir também novo comprovante de residência', r.status === 200 && s6?.kycReverification?.needs?.includes('proofOfAddress') && s6?.kycReverification?.needs?.includes('identityDocument') && (await rowOf('seller_kyc', v4.kycId)).status === 'pending', s6);
  const noConfirm = await mk({ approved: true, taxId: '529.982.247-25', country: 'GW', settings: { kyc: { accountType: 'pf' } } });
  r = await call('PATCH', '/seller/profile', noConfirm.token, { country: 'BR', taxId: '529.982.247-25' });
  report('G18 país sede com KYC aprovado sem confirmação → 409 e o país não muda', r.status === 409 && r.json?.error?.code === 'KYC_REVERIFICATION_REQUIRED' && (await prof(noConfirm.token)).country === 'GW', r);

  // ---------- H. KYC enviado depois da conta: tipo de vendedor acompanha a classe do KYC
  const h = await mk({ settings: { account: { sellerType: 'sociedade', commercialEmail: 'c@loja.com', preferredCurrency: 'EUR' }, fiscal: { city: 'Bissau', address: 'Rua Principal 1' } } });
  const sub = await call('POST', '/seller/kyc/submit', h.token, {
    accountType: 'pf', legalName: 'Maria da Silva', birthDate: '1990-05-17', taxId: '510012345', phone: '+245 955000001', documentType: 'bi', documentNumber: 'BI123456',
    documentFrontUrl: file('h-id').url, identityMetadata: file('h-id'), proofOfAddressUrl: file('h-addr').url, addressMetadata: file('h-addr'), selfieUrl: file('h-selfie').url, selfieMetadata: file('h-selfie'),
  });
  const hs = await settingsOf(h.sellerId);
  report('H1 KYC enviado como pessoa física: o tipo de vendedor "sociedade" passa a "pessoa_fisica"; e-mail, moeda e dados fiscais permanecem', sub.status === 200 && hs?.account?.sellerType === 'pessoa_fisica' && hs?.account?.commercialEmail === 'c@loja.com' && hs?.account?.preferredCurrency === 'EUR' && hs?.fiscal?.city === 'Bissau' && hs?.kyc?.accountType === 'pf', { sub: sub.json, hs });
  p = await prof(h.token);
  report('H2 leitura depois do KYC: tipo coerente com o KYC e demais campos preservados', p.sellerType === 'pessoa_fisica' && p.email === 'c@loja.com' && p.preferredCurrency === 'EUR' && p.city === 'Bissau', p);

  // ---------- I. isolamento e concorrência
  const o1 = await mk(), o2 = await mk();
  await Promise.all([
    call('PATCH', '/seller/profile', o1.token, { fullName: 'Primeiro Titular' }),
    call('PATCH', '/seller/profile', o1.token, { email: 'a@b.com' }),
    call('PATCH', '/seller/profile', o1.token, { sellerType: 'sociedade' }),
    call('PATCH', '/seller/profile', o1.token, { preferredCurrency: 'BRL' }),
    call('PATCH', '/seller/profile', o1.token, { city: 'Cidade Paralela', address: 'Endereço Paralelo 55' }),
    call('PATCH', '/seller/profile', o2.token, { fullName: 'Segundo Titular', email: 'z@y.com' }),
  ]);
  p = await prof(o1.token);
  report('I1 gravações simultâneas: todos os campos de cada vendedor permanecem, sem misturar vendedores', p.fullName === 'Primeiro Titular' && p.email === 'a@b.com' && p.sellerType === 'sociedade' && p.preferredCurrency === 'BRL' && p.city === 'Cidade Paralela' && (await prof(o2.token)).fullName === 'Segundo Titular' && (await prof(o2.token)).email === 'z@y.com', { p });
  r = await call('PATCH', '/seller/profile', null, { fullName: 'Sem Sessão' });
  report('I2 sem sessão → 401', r.status === 401, r);

  console.log(`\n${passed}/${total} passaram`);
  server.close(); await pool.end();
  process.exit(passed === total ? 0 : 1);
}
main().catch((e) => { console.error('ERRO FATAL', e); process.exit(2); });
