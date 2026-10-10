/**
 * Minha Conta de Vendedor — persistencia de ponta a ponta do Documento Fiscal, Cidade e Endereco Fiscal, em Postgres 17 DESCARTAVEL
 * (API real por HTTP): gravacao e leitura, atualizacao parcial, nova sessao, validacao por pais (sem escrita parcial), convivio com o
 * KYC e com as preferencias (o JSONB nunca e sobrescrito), KYC aprovado nunca alterado, isolamento entre vendedores. Nunca producao.
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
import { users, sellers, sellerKyc, sellerProfiles, countries } from '../src/db/schema.js';
import { apiRouter } from '../src/server/api.js';

if (!['localhost', '127.0.0.1'].includes(new URL(testDbUrl).hostname)) throw new Error('Somente banco local descartavel.');
let passed = 0, total = 0;
const report = (l: string, ok: boolean, d?: any) => { total++; if (ok) passed++; console.log(`[${ok ? 'PASS' : 'FAIL'}] ${l}${ok ? '' : ' -> ' + JSON.stringify(d ?? null).slice(0, 700)}`); };
let seq = 0;
const uid = (p: string) => `${p}_sa_${Date.now()}_${++seq}_${Math.random().toString(36).slice(2, 5)}`;
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
  ] as any).onConflictDoNothing();

  const mk = async (opts: { country?: string; taxId?: string; phone?: string; approved?: boolean; withProfile?: boolean; settings?: any } = {}) => {
    const { country = 'GW', taxId = '', phone = '955000001', approved = false, withProfile = true, settings = null } = opts;
    const userId = uid('usr'), sellerId = uid('sel');
    await db.insert(users).values({ id: userId, email: `${userId}@t.test`, passwordHash: 'x', fullName: 'Vend Teste', phone, role: 'SELLER', countryCode: country, kycStatus: approved ? 'verified' : 'unverified', isActive: true, isEmailVerified: true, isPhoneVerified: false, createdAt: new Date(), updatedAt: new Date() } as any);
    await db.insert(sellers).values({ id: sellerId, userId, companyName: 'Vend Teste', tradingName: 'Loja Teste', taxId, phone, countryCode: country, status: approved ? 'active' : 'pending', createdAt: new Date(), updatedAt: new Date() } as any);
    if (withProfile) await db.insert(sellerProfiles).values({ id: uid('prof'), sellerId, settingsJson: settings } as any);
    if (approved) await db.insert(sellerKyc).values({ id: uid('kyc'), sellerId, legalName: 'Vend Teste', documentType: 'bi', documentNumber: 'BI1', status: 'verified', reviewedAt: new Date('2026-01-01T00:00:00Z'), submittedAt: new Date('2025-12-01T00:00:00Z') } as any);
    return { userId, sellerId, token: tokenFor(userId), fresh: () => tokenFor(userId) };
  };
  const settingsOf = async (sellerId: string) => (await q('SELECT settings_json FROM seller_profiles WHERE seller_id=$1', [sellerId]))[0]?.settings_json ?? null;
  const taxOf = async (sellerId: string) => (await q('SELECT tax_id FROM sellers WHERE id=$1', [sellerId]))[0]?.tax_id;
  const prof = async (t: string) => (await call('GET', '/seller/profile', t)).json?.data;
  const fields = (r: any) => (r.json?.error?.details ?? []).map((d: any) => d.field).sort().join();

  // ---------- A. leitura inicial
  const a = await mk();
  let p = await prof(a.token);
  report('A1 conta nova: os três campos vêm vazios (sem undefined/mock)', p?.taxId === '' && p?.city === '' && p?.address === '', p);

  // ---------- B. gravar os três e ler de novo (mesma sessão, outra rota, nova sessão)
  const body = { companyName: 'Vend Teste', tradingName: 'Loja Teste', phone: '955000001', taxId: '510012345', city: 'Bissau', address: 'Av. Amílcar Cabral 120, Bairro Militar' };
  const put = await call('PATCH', '/seller/profile', a.token, body);
  report('B1 PATCH com os três campos → 200 e devolve o que ficou gravado', put.status === 200 && put.json?.success === true && put.json.data?.taxId === '510012345' && put.json.data?.city === 'Bissau' && put.json.data?.address === body.address, put);
  report('B2 gravado no banco: sellers.tax_id e settings_json.fiscal', (await taxOf(a.sellerId)) === '510012345' && (await settingsOf(a.sellerId))?.fiscal?.city === 'Bissau' && (await settingsOf(a.sellerId))?.fiscal?.address === body.address, await settingsOf(a.sellerId));
  p = await prof(a.token);
  report('B3 GET /seller/profile devolve os três campos (sair e voltar à página)', p?.taxId === '510012345' && p?.city === 'Bissau' && p?.address === body.address, p);
  p = await prof(a.fresh());
  report('B4 nova sessão (novo token) lê os mesmos valores (F5 / novo login)', p?.taxId === '510012345' && p?.city === 'Bissau' && p?.address === body.address, p);
  report('B5 restantes campos preservados (nome comercial, telefone)', p?.commercialName === 'Loja Teste' && p?.phone === '955000001', p);

  // ---------- C. atualização parcial
  let r = await call('PATCH', '/seller/profile', a.token, { city: 'Gabú' });
  p = await prof(a.token);
  report('C1 só a cidade: cidade muda, documento e endereço intactos', r.status === 200 && p.city === 'Gabú' && p.taxId === '510012345' && p.address === body.address, p);
  r = await call('PATCH', '/seller/profile', a.token, { address: 'Rua Nova 5, Gabú' });
  p = await prof(a.token);
  report('C2 só o endereço: endereço muda, cidade e documento intactos', r.status === 200 && p.address === 'Rua Nova 5, Gabú' && p.city === 'Gabú' && p.taxId === '510012345', p);
  r = await call('PATCH', '/seller/profile', a.token, { taxId: '510099999' });
  p = await prof(a.token);
  report('C3 só o documento: documento muda, cidade e endereço intactos', r.status === 200 && p.taxId === '510099999' && p.city === 'Gabú' && p.address === 'Rua Nova 5, Gabú', p);
  r = await call('PATCH', '/seller/profile', a.token, { phone: '955111222' });
  p = await prof(a.token);
  report('C4 salvar só o telefone não apaga os campos fiscais', r.status === 200 && p.phone === '955111222' && p.taxId === '510099999' && p.city === 'Gabú' && p.address === 'Rua Nova 5, Gabú', p);
  r = await call('PATCH', '/seller/profile', a.token, { city: '   Bafatá   ', address: '  Rua   do   Mercado  22 ' });
  p = await prof(a.token);
  report('C5 espaços das pontas/repetidos são normalizados', p.city === 'Bafatá' && p.address === 'Rua do Mercado 22', p);

  // ---------- D. validação (nada é gravado quando algum campo é inválido)
  const before = JSON.stringify({ t: await taxOf(a.sellerId), s: await settingsOf(a.sellerId) });
  r = await call('PATCH', '/seller/profile', a.token, { companyName: 'Nome Mudado', city: '', taxId: '510000000', address: 'Rua Valida 1' });
  report('D1 cidade vazia → 400 por campo e NADA é gravado (nem o nome nem o documento)', r.status === 400 && r.json?.error?.code === 'VALIDATION_ERROR' && fields(r) === 'city' && JSON.stringify({ t: await taxOf(a.sellerId), s: await settingsOf(a.sellerId) }) === before && (await q('SELECT company_name FROM sellers WHERE id=$1', [a.sellerId]))[0].company_name === 'Vend Teste', r);
  r = await call('PATCH', '/seller/profile', a.token, { taxId: '' });
  report('D2 apagar o documento fiscal já guardado → 400', r.status === 400 && fields(r) === 'taxId' && (await taxOf(a.sellerId)) === '510099999', r);
  r = await call('PATCH', '/seller/profile', a.token, { taxId: 'ab', address: 'x' });
  report('D3 documento curto e endereço curto → 400 com os dois campos', r.status === 400 && fields(r) === 'address,taxId', r);
  r = await call('PATCH', '/seller/profile', a.token, { city: 12345, address: { x: 1 }, taxId: ['1'] });
  report('D4 valores que não são texto → 400 (sem gravar)', r.status === 400 && JSON.stringify({ t: await taxOf(a.sellerId), s: await settingsOf(a.sellerId) }) === before, r);
  r = await call('PATCH', '/seller/profile', a.token, { city: 'x'.repeat(121) });
  report('D5 cidade acima do limite → 400', r.status === 400 && fields(r) === 'city', r);
  const br = await mk({ country: 'BR', taxId: '' });
  r = await call('PATCH', '/seller/profile', br.token, { taxId: '111.111.111-11', city: 'São Paulo', address: 'Rua das Flores 10' });
  report('D6 Brasil: CPF/CNPJ inválido → 400 (mesma regra do KYC) e a cidade enviada junto não é gravada', r.status === 400 && fields(r) === 'taxId' && (await settingsOf(br.sellerId))?.fiscal === undefined, r);
  r = await call('PATCH', '/seller/profile', br.token, { taxId: '529.982.247-25', city: 'São Paulo', address: 'Rua das Flores 10' });
  report('D7 Brasil: CPF válido é aceito', r.status === 200 && (await prof(br.token)).taxId === '529.982.247-25', r);

  // ---------- E. dados antigos nunca impedem salvar outro campo
  const legacy = await mk({ taxId: 'x', phone: '955000009' });
  r = await call('PATCH', '/seller/profile', legacy.token, { taxId: 'x', city: 'Bissau', address: 'Rua Antiga 1' });
  report('E1 documento antigo inválido (inalterado) não bloqueia gravar cidade e endereço', r.status === 200 && (await prof(legacy.token)).city === 'Bissau', r);
  const asPhone = await mk({ taxId: '955000010', phone: '955000010' });
  p = await prof(asPhone.token);
  report('E2 NIF que era só o telefone do pré-cadastro não aparece como documento fiscal', p?.taxId === '', p);
  r = await call('PATCH', '/seller/profile', asPhone.token, { taxId: '510077777', city: 'Bissau', address: 'Rua Real 3' });
  report('E3 e pode ser substituído pelo documento real', r.status === 200 && (await prof(asPhone.token)).taxId === '510077777', r);
  const noProfile = await mk({ withProfile: false });
  r = await call('PATCH', '/seller/profile', noProfile.token, { city: 'Bissau', address: 'Rua Sem Perfil 8' });
  report('E4 vendedor sem linha em seller_profiles: a linha é criada e os dados persistem', r.status === 200 && (await prof(noProfile.token)).city === 'Bissau', r);

  // ---------- F. convivência com KYC e preferências (JSONB compartilhado)
  const k = await mk({ settings: { kyc: { accountType: 'pf', birthDate: '1990-05-17' }, vacationMode: true, emailAlerts: false } });
  r = await call('PATCH', '/seller/profile', k.token, { taxId: '510055555', city: 'Bissau', address: 'Rua do KYC 9' });
  let st = await settingsOf(k.sellerId);
  report('F1 gravar dados fiscais preserva settings_json.kyc e as preferências', r.status === 200 && st?.kyc?.accountType === 'pf' && st?.kyc?.birthDate === '1990-05-17' && st?.vacationMode === true && st?.emailAlerts === false && st?.fiscal?.city === 'Bissau', st);
  const file = (n: string) => ({ url: `https://r2.example.invalid/kyc/${n}.jpg`, objectKey: `kyc/${n}.jpg`, mimeType: 'image/jpeg', size: 1234 });
  const kyc = await call('POST', '/seller/kyc/submit', k.token, {
    accountType: 'pf', legalName: 'Maria da Silva', birthDate: '1990-05-17', taxId: '510066666', phone: '+245 955000001', documentType: 'bi', documentNumber: 'BI123456',
    documentFrontUrl: file('id').url, identityMetadata: file('id'), proofOfAddressUrl: file('addr').url, addressMetadata: file('addr'), selfieUrl: file('selfie').url, selfieMetadata: file('selfie'),
  });
  st = await settingsOf(k.sellerId);
  p = await prof(k.token);
  report('F2 enviar o KYC depois: cidade/endereço fiscais permanecem; o documento passa a ser o do KYC (mesma coluna)', kyc.status === 200 && st?.fiscal?.city === 'Bissau' && st?.fiscal?.address === 'Rua do KYC 9' && p.taxId === '510066666' && st?.kyc?.accountType === 'pf', { kyc: kyc.json, st, p });
  r = await call('PATCH', '/seller/profile', k.token, { city: 'Cacheu' });
  st = await settingsOf(k.sellerId);
  report('F3 e alterar a cidade depois do KYC mantém o tipo de conta e o nascimento do KYC', r.status === 200 && st?.kyc?.accountType === 'pf' && st?.kyc?.birthDate === '1990-05-17' && st?.fiscal?.city === 'Cacheu', st);
  const kycGet = await call('GET', '/seller/kyc', k.token);
  report('F4 a tela de KYC continua a mostrar o documento (sem cidade/endereço misturados)', kycGet.json?.data?.taxId === '510066666' && kycGet.json?.data?.legalName === 'Maria da Silva', kycGet.json?.data);
  const sg = await call('PATCH', '/seller/settings', k.token, { vacationMode: false });
  const sget = await call('GET', '/seller/settings', k.token);
  st = await settingsOf(k.sellerId);
  report('F5 salvar preferências preserva os dados fiscais e o KYC; /settings não expõe chaves internas', sg.status === 200 && st?.fiscal?.city === 'Cacheu' && st?.kyc?.accountType === 'pf' && !('fiscal' in (sget.json?.data ?? {})) && !('kyc' in (sget.json?.data ?? {})), { st, sget: sget.json });

  // ---------- G. KYC aprovado nunca é alterado
  const ap = await mk({ approved: true, taxId: '510088888' });
  const snap = async () => JSON.stringify({
    kyc: (await q('SELECT status, reviewed_at, submitted_at, legal_name, document_number, rejection_reason FROM seller_kyc WHERE seller_id=$1', [ap.sellerId]))[0],
    u: (await q('SELECT kyc_status FROM users WHERE id=$1', [ap.userId]))[0], s: (await q('SELECT status FROM sellers WHERE id=$1', [ap.sellerId]))[0],
  });
  const kycBefore = await snap();
  r = await call('PATCH', '/seller/profile', ap.token, { city: 'Bolama', address: 'Rua Nova da Sede 1' });
  report('G1 vendedor com KYC aprovado altera cidade/endereço (não são dados de identidade): salva (200)', r.status === 200 && (await prof(ap.token)).city === 'Bolama', r);
  report('G2 e o KYC aprovado NÃO muda (status, datas, revisão, utilizador, vendedor, documento fiscal)', (await snap()) === kycBefore, { before: kycBefore, after: await snap() });
  p = await prof(ap.token);
  report('G3 o estado do KYC continua "verified" na leitura do perfil', p?.kycStatus === 'verified' || p?.kycStatus === 'approved', p?.kycStatus);

  // ---------- H. isolamento e concorrência
  const other = await mk({ taxId: '510011111' });
  await call('PATCH', '/seller/profile', other.token, { city: 'Outra Cidade', address: 'Outra Rua 7' });
  p = await prof(a.token);
  report('H1 o vendedor B não altera nem lê os dados do vendedor A', p.city === 'Bafatá' && (await prof(other.token)).city === 'Outra Cidade' && (await taxOf(a.sellerId)) === '510099999');
  r = await call('PATCH', '/seller/profile', null, { city: 'X Y' });
  report('H2 sem sessão → 401 e nada gravado', r.status === 401, r);
  const cc = await mk({ settings: { kyc: { accountType: 'pf', birthDate: '1990-05-17' } } });
  const par = await Promise.all([
    call('PATCH', '/seller/profile', cc.token, { city: 'Cidade Paralela' }),
    call('PATCH', '/seller/profile', cc.token, { address: 'Endereço Paralelo 99' }),
    call('PATCH', '/seller/profile', cc.token, { phone: '955333444' }),
  ]);
  st = await settingsOf(cc.sellerId);
  report('H3 três gravações simultâneas: nenhuma sobrescreve a outra (cidade, endereço e KYC permanecem)', par.every((x) => x.status === 200) && st?.fiscal?.city === 'Cidade Paralela' && st?.fiscal?.address === 'Endereço Paralelo 99' && st?.kyc?.accountType === 'pf', st);

  console.log(`\n${passed}/${total} passaram`);
  server.close(); await pool.end();
  process.exit(passed === total ? 0 : 1);
}
main().catch((e) => { console.error('ERRO FATAL', e); process.exit(2); });
