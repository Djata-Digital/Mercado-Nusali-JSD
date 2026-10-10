/**
 * Contorno de KYC pelo nome do titular: PUT /buyer/profile passa pela MESMA reverificacao da conta do vendedor (PATCH /seller/profile).
 * Postgres 17 DESCARTAVEL, API real por HTTP. Compradores comuns continuam livres. Nunca producao.
 */
process.env.REDIS_URL = '';
import { assertLedgerTestDatabaseGuard } from './ledgerTestDbGuard.js';
const testDbUrl = assertLedgerTestDatabaseGuard();
process.env.DATABASE_URL = testDbUrl;
process.env.NODE_ENV = 'test';
process.env.SKIP_RUNTIME_ALIGN = 'true';
process.env.STORAGE_PUBLIC_URL = 'https://pub-test.example.invalid';
process.env.JWT_ACCESS_SECRET = process.env.JWT_ACCESS_SECRET || 'test_fixture_jwt_secret_never_real_0123456789';
import 'dotenv/config';
import fs from 'fs';
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
process.env.STORAGE_PUBLIC_URL = 'https://pub-test.example.invalid';
let passed = 0, total = 0;
const report = (l: string, ok: boolean, d?: any) => { total++; if (ok) passed++; console.log(`[${ok ? 'PASS' : 'FAIL'}] ${l}${ok ? '' : ' -> ' + JSON.stringify(d ?? null).slice(0, 700)}`); };
let seq = 0;
const uid = (p: string) => `${p}_ig_${Date.now()}_${++seq}_${Math.random().toString(36).slice(2, 5)}`;
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
  await db.insert(countries).values([{ id: 'GW', code: 'GW', name: 'Guiné-Bissau', flag: 'x', currency: 'XOF', currencySymbol: 'CFA', phonePrefix: '+245', isActive: true, createdAt: new Date() }] as any).onConflictDoNothing();

  const mkSeller = async (status: string | null, name = 'Maria da Silva', kycOnUserOnly = false) => {
    const userId = uid('usr'), sellerId = uid('sel'), kycId = uid('kyc');
    const approved = status === 'verified' || status === 'approved';
    await db.insert(users).values({ id: userId, email: `${userId}@t.test`, passwordHash: 'x', fullName: name, phone: '955000001', role: 'SELLER', countryCode: 'GW', kycStatus: status ?? 'unverified', isActive: true, isEmailVerified: true, isPhoneVerified: false, createdAt: new Date(), updatedAt: new Date() } as any);
    await db.insert(sellers).values({ id: sellerId, userId, companyName: 'Razão Social Lda', tradingName: 'Loja Maria', taxId: '510012345', phone: '955000001', countryCode: 'GW', status: approved ? 'active' : 'pending', createdAt: new Date(), updatedAt: new Date() } as any);
    await db.insert(sellerProfiles).values({ id: uid('prof'), sellerId, settingsJson: { kyc: { accountType: 'pf', birthDate: '1990-05-17' } } } as any);
    if (status && !kycOnUserOnly) {
      await db.insert(sellerKyc).values({ id: kycId, sellerId, legalName: name, documentType: 'bi', documentNumber: 'BI1', documentFrontUrl: 'https://r2.example.invalid/kyc/old-id.jpg', selfieUrl: 'https://r2.example.invalid/kyc/old-selfie.jpg', proofOfAddressUrl: 'https://r2.example.invalid/kyc/old-addr.jpg', status: status === 'approved' ? 'approved' : status, reviewedAt: approved ? new Date('2026-01-01T00:00:00Z') : null, submittedAt: new Date('2025-12-01T00:00:00Z') } as any);
      for (const [t, f] of [['identity_document', 'old-id'], ['proof_of_address', 'old-addr'], ['selfie', 'old-selfie']]) {
        await db.insert(sellerDocuments).values({ id: uid('doc'), sellerId, documentType: t, fileUrl: `https://r2.example.invalid/kyc/${f}.jpg`, objectKey: `kyc/${f}.jpg`, status: 'verified', createdAt: new Date() } as any);
      }
    }
    return { userId, sellerId, kycId, token: tokenFor(userId) };
  };
  const mkBuyer = async (name = 'João Comprador') => {
    const userId = uid('buy');
    await db.insert(users).values({ id: userId, email: `${userId}@t.test`, passwordHash: 'x', fullName: name, phone: '955111000', role: 'BUYER', countryCode: 'GW', kycStatus: 'unverified', isActive: true, isEmailVerified: true, isPhoneVerified: false, createdAt: new Date(), updatedAt: new Date() } as any);
    return { userId, token: tokenFor(userId, 'BUYER') };
  };
  const nameOf = async (userId: string) => (await q('SELECT full_name FROM users WHERE id=$1', [userId]))[0].full_name;
  const kycStatusOf = async (s: { userId: string; sellerId: string }) => ({ k: (await q('SELECT status FROM seller_kyc WHERE seller_id=$1', [s.sellerId]))[0]?.status ?? null, u: (await q('SELECT kyc_status FROM users WHERE id=$1', [s.userId]))[0].kyc_status });
  const settingsOf = async (sellerId: string) => (await q('SELECT settings_json FROM seller_profiles WHERE seller_id=$1', [sellerId]))[0]?.settings_json ?? null;
  const state = async (s: { userId: string; sellerId: string }) => JSON.stringify({ u: (await q('SELECT full_name, phone, avatar_url, kyc_status FROM users WHERE id=$1', [s.userId]))[0], k: await kycStatusOf(s), st: await settingsOf(s.sellerId), a: (await q(`SELECT count(*)::int AS n FROM audit_logs WHERE action='seller.kyc.reverification_required' AND details_json->>'sellerId'=$1`, [s.sellerId]))[0].n });
  const adminUser = uid('adm');
  await db.insert(users).values({ id: adminUser, email: `${adminUser}@t.test`, passwordHash: 'x', fullName: 'Admin', phone: '1', role: 'GLOBAL_ADMIN', countryCode: 'GW', kycStatus: 'verified', isActive: true, isEmailVerified: true, isPhoneVerified: false, createdAt: new Date(), updatedAt: new Date() } as any);
  const adminToken = tokenFor(adminUser, 'GLOBAL_ADMIN');

  // ---------- A. o contorno fechado: PUT /buyer/profile com KYC aprovado
  const v = await mkSeller('verified');
  const before = await state(v);
  let r = await call('PUT', '/buyer/profile', v.token, { fullName: 'Outra Pessoa Totalmente' });
  report('A1 vendedor com KYC aprovado muda o nome pelo perfil de comprador → 409 KYC_REVERIFICATION_REQUIRED (com a lista do que muda)', r.status === 409 && r.json?.error?.code === 'KYC_REVERIFICATION_REQUIRED' && r.json?.error?.changes?.[0]?.field === 'fullName', r);
  report('A2 sem confirmação NADA é gravado (nome, KYC, auditoria, JSONB)', (await state(v)) === before);
  r = await call('PUT', '/buyer/profile', v.token, { fullName: 'Outra Pessoa Totalmente', phone: '955999888', avatar: '' });
  report('A3 alteração PARCIAL junto de outros campos (telefone, foto): o pedido inteiro é recusado, nenhum campo é gravado', r.status === 409 && (await state(v)) === before, r);
  r = await call('PUT', '/buyer/profile', v.token, { fullName: 'Maria da Silva Junior' });
  report('A4 mudança pequena de conteúdo (acrescentar uma palavra) também é material → 409', r.status === 409 && (await state(v)) === before, r);
  r = await call('PUT', '/buyer/profile', v.token, { fullName: 'Maria da Silv' });
  report('A5 cortar uma letra também → 409 (não dá para ir mudando o nome aos poucos)', r.status === 409 && (await state(v)) === before, r);
  r = await call('PUT', '/buyer/profile', v.token, { fullName: '' });
  report('A6 apagar o nome → 409 (nunca grava nome vazio de vendedor verificado)', r.status === 409 && (await state(v)) === before, r);
  r = await call('PUT', '/buyer/profile', v.token, { fullName: 'Outra Pessoa', confirmReverification: 'true' });
  report('A7 confirmação que não é exatamente true (texto) não vale → 409', r.status === 409 && (await state(v)) === before, r);

  // ---------- B. o que continua livre
  r = await call('PUT', '/buyer/profile', v.token, { fullName: 'Maria da Silva', phone: '955123123' });
  report('B1 enviar o MESMO nome (a tela sempre envia) com outro campo salva normalmente, sem reverificação', r.status === 200 && (await kycStatusOf(v)).k === 'verified', r);
  r = await call('PUT', '/buyer/profile', v.token, { fullName: '  MARIA   DA  silva ' });
  report('B2 só caixa/espaços do nome não é mudança de identidade → 200, KYC aprovado intacto', r.status === 200 && (await kycStatusOf(v)).k === 'verified' && (await kycStatusOf(v)).u === 'verified', r);
  r = await call('PUT', '/buyer/profile', v.token, { phone: '955321321' });
  report('B3 pedido sem fullName (só telefone) → 200 e KYC aprovado intacto', r.status === 200 && (await kycStatusOf(v)).k === 'verified', r);
  const nameBeforeB4 = await nameOf(v.userId);
  r = await call('PUT', '/buyer/profile', v.token, { fullName: 12345 });
  report('B4 fullName que não é texto é ignorado como sempre (nome não muda, sem erro, sem reverificação)', r.status === 200 && (await nameOf(v.userId)) === nameBeforeB4 && (await kycStatusOf(v)).k === 'verified', { r: r.status, n: await nameOf(v.userId) });

  // ---------- C. confirmado: mesma reverificação da conta do vendedor
  const c = await mkSeller('verified', 'Ana Souza');
  r = await call('PUT', '/buyer/profile', c.token, { fullName: 'Ana Souza Pereira', confirmReverification: true });
  const st = await settingsOf(c.sellerId);
  report('C1 confirmado: nome gravado, KYC e utilizador voltam a "pending"', r.status === 200 && (await nameOf(c.userId)) === 'Ana Souza Pereira' && (await kycStatusOf(c)).k === 'pending' && (await kycStatusOf(c)).u === 'pending', { r: r.json, k: await kycStatusOf(c) });
  report('C2 registro da reverificação: exige identidade nova; revisão anterior e mudanças preservadas', st?.kycReverification?.required === true && st?.kycReverification?.needs?.length === 1 && st?.kycReverification?.needs[0] === 'identityDocument' && st?.kycReverification?.previousReviewedAt === '2026-01-01T00:00:00.000Z' && st?.kycReverification?.changes?.[0]?.from === 'Ana Souza' && st?.kycReverification?.changes?.[0]?.to === 'Ana Souza Pereira' && st?.kyc?.accountType === 'pf', st);
  const audit = await q(`SELECT details_json, actor_user_id FROM audit_logs WHERE action='seller.kyc.reverification_required' AND details_json->>'sellerId'=$1`, [c.sellerId]);
  report('C3 auditoria: uma entrada, origem "buyer_profile", autor = o próprio utilizador, com documentos anteriores', audit.length === 1 && audit[0].details_json?.source === 'buyer_profile' && audit[0].actor_user_id === c.userId && audit[0].details_json?.previousDocuments?.length === 3, audit);
  const ap = await call('POST', `/admin/kyc/${c.kycId}/approve`, adminToken, {});
  report('C4 o administrador NÃO consegue aprovar o novo nome sem o reenvio do KYC (400 KYC_APPROVAL_BLOCKED)', ap.status === 400 && ap.json?.error?.code === 'KYC_APPROVAL_BLOCKED' && (await kycStatusOf(c)).k === 'pending', ap);
  const file = (n: string) => ({ url: `https://r2.example.invalid/kyc/${n}.jpg`, objectKey: `kyc/${n}.jpg`, mimeType: 'image/jpeg', size: 1234 });
  const body = (extra: any = {}) => ({ accountType: 'pf', legalName: 'Ana Souza Pereira', birthDate: '1990-05-17', taxId: '510012345', phone: '+245 955000001', documentType: 'bi', documentNumber: 'BI123456', selfieUrl: file('c-selfie').url, selfieMetadata: file('c-selfie'), proofOfAddressUrl: file('c-addr').url, addressMetadata: file('c-addr'), ...extra });
  const s1 = await call('POST', '/seller/kyc/submit', c.token, body());
  report('C5 reenvio do KYC sem documento de identidade novo → 400', s1.status === 400, s1);
  const s2 = await call('POST', '/seller/kyc/submit', c.token, body({ documentFrontUrl: file('c-id').url, identityMetadata: file('c-id') }));
  const ap2 = await call('POST', `/admin/kyc/${c.kycId}/approve`, adminToken, {});
  report('C6 com identidade nova o reenvio é aceito e só então a aprovação manual é possível', s2.status === 200 && ap2.status === 200 && (await kycStatusOf(c)).k === 'verified', { s2, ap2 });

  // ---------- D. mesma proteção, mesma resposta, nos dois caminhos
  const d1 = await mkSeller('verified', 'Rui Lopes'), d2 = await mkSeller('verified', 'Rui Lopes');
  const viaBuyer = await call('PUT', '/buyer/profile', d1.token, { fullName: 'Rui Lopes Filho' });
  const viaSeller = await call('PATCH', '/seller/profile', d2.token, { fullName: 'Rui Lopes Filho' });
  report('D1 PUT /buyer/profile e PATCH /seller/profile devolvem a MESMA resposta 409 (mesma regra e mesma mensagem)', viaBuyer.status === 409 && viaSeller.status === 409 && JSON.stringify(viaBuyer.json) === JSON.stringify(viaSeller.json), { viaBuyer: viaBuyer.json, viaSeller: viaSeller.json });
  const cb = await call('PUT', '/buyer/profile', d1.token, { fullName: 'Rui Lopes Filho', confirmReverification: true });
  const cs = await call('PATCH', '/seller/profile', d2.token, { fullName: 'Rui Lopes Filho', confirmReverification: true });
  const s1k = await settingsOf(d1.sellerId), s2k = await settingsOf(d2.sellerId);
  const strip = (x: any) => JSON.stringify({ ...x.kycReverification, at: undefined });
  report('D2 confirmado nos dois caminhos: mesmo efeito (KYC pending, mesmos needs/mudanças/estado anterior)', cb.status === 200 && cs.status === 200 && strip(s1k) === strip(s2k) && JSON.stringify(await kycStatusOf(d1)) === JSON.stringify(await kycStatusOf(d2)), { s1k, s2k });

  // ---------- E. quem não está aprovado, e compradores comuns
  const buyer = await mkBuyer();
  r = await call('PUT', '/buyer/profile', buyer.token, { fullName: 'João Comprador Novo Nome' });
  report('E1 comprador comum altera o próprio nome livremente (200) e nada de KYC acontece', r.status === 200 && (await nameOf(buyer.userId)) === 'João Comprador Novo Nome' && (await q(`SELECT count(*)::int AS n FROM audit_logs WHERE action='seller.kyc.reverification_required' AND actor_user_id=$1`, [buyer.userId]))[0].n === 0, r);
  const pend = await mkSeller('pending', 'Vendedor Pendente');
  r = await call('PUT', '/buyer/profile', pend.token, { fullName: 'Vendedor Pendente Novo' });
  report('E2 vendedor com KYC pendente (ainda não aprovado) muda o nome livremente — não há verificação a proteger', r.status === 200 && (await nameOf(pend.userId)) === 'Vendedor Pendente Novo' && (await kycStatusOf(pend)).k === 'pending', r);
  const rej = await mkSeller('rejected', 'Vendedor Rejeitado');
  r = await call('PUT', '/buyer/profile', rej.token, { fullName: 'Vendedor Rejeitado Novo' });
  report('E3 vendedor com KYC rejeitado muda o nome livremente (continua rejeitado)', r.status === 200 && (await kycStatusOf(rej)).k === 'rejected', r);
  const alias = await mkSeller('approved', 'Vendedor Alias');
  r = await call('PUT', '/buyer/profile', alias.token, { fullName: 'Vendedor Alias Outro' });
  report('E4 o estado "approved" (sinônimo de verified) também é protegido', r.status === 409 && (await nameOf(alias.userId)) === 'Vendedor Alias', r);
  const legacy = await mkSeller('verified', 'Vendedor Legado', true);
  r = await call('PUT', '/buyer/profile', legacy.token, { fullName: 'Legado Mudado' });
  report('E5 aprovação só registrada em users.kyc_status (sem linha em seller_kyc) também é protegida', r.status === 409 && (await nameOf(legacy.userId)) === 'Vendedor Legado', r);
  r = await call('PUT', '/buyer/profile', null, { fullName: 'Sem Sessão' });
  report('E6 sem sessão → 401', r.status === 401, r);

  // ---------- F. dados preservados e idempotência
  const f = await mkSeller('verified', 'Paula Reis');
  await call('PATCH', '/seller/profile', f.token, { city: 'Bissau', address: 'Rua da Sede 12', email: 'p@loja.com', preferredCurrency: 'XOF', sellerType: 'pessoa_fisica' });
  const dup = await Promise.all([
    call('PUT', '/buyer/profile', f.token, { fullName: 'Paula Reis Costa', confirmReverification: true }),
    call('PUT', '/buyer/profile', f.token, { fullName: 'Paula Reis Costa', confirmReverification: true }),
    call('PATCH', '/seller/profile', f.token, { fullName: 'Paula Reis Costa', confirmReverification: true }),
  ]);
  const fs2 = await settingsOf(f.sellerId);
  const audits = (await q(`SELECT count(*)::int AS n FROM audit_logs WHERE action='seller.kyc.reverification_required' AND details_json->>'sellerId'=$1`, [f.sellerId]))[0].n;
  report('F1 confirmações simultâneas nos dois caminhos: uma só reverificação e uma só auditoria (sem repetir)', dup.every((x) => x.status === 200 || x.status === 409) && audits === 1 && (await kycStatusOf(f)).k === 'pending' && (await nameOf(f.userId)) === 'Paula Reis Costa', { dup: dup.map((x) => x.status), audits });
  report('F2 dados já aprovados preservados: cidade, endereço, e-mail comercial, moeda, tipo de vendedor e KYC no JSONB', fs2?.fiscal?.city === 'Bissau' && fs2?.fiscal?.address === 'Rua da Sede 12' && fs2?.account?.commercialEmail === 'p@loja.com' && fs2?.account?.preferredCurrency === 'XOF' && fs2?.account?.sellerType === 'pessoa_fisica' && fs2?.kyc?.accountType === 'pf' && fs2?.kycReverification?.required === true, fs2);
  const a2 = await assessKycForApproval(db, f.sellerId);
  report('F3 a aprovação continua bloqueada pela reverificação pendente', a2.issues.some((i) => i.label === 'Reverificação de identidade'), a2.issues.map((i) => i.label));

  // ---------- G. nenhum outro caminho escreve o nome do titular
  const walk = (dir: string): string[] => fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(`${dir}/${e.name}`) : e.name.endsWith('.ts') ? [`${dir}/${e.name}`] : []));
  const writers = walk('src/server').filter((p) => {
    const code = fs.readFileSync(p, 'utf8').split(String.fromCharCode(13, 10)).join(String.fromCharCode(10));
    return /update\(users\)\s*\.set\(\{[^}]*fullName/.test(code) || /userUpdates\.fullName\s*=/.test(code) || /\.set\(\s*userUpdates\s*\)/.test(code);
  }).sort();
  report('G1 só dois arquivos gravam o nome do titular (buyerRoutes e sellerRoutes) e ambos usam a regra única', JSON.stringify(writers) === JSON.stringify(['src/server/buyerRoutes.ts', 'src/server/sellerRoutes.ts']) && ['src/server/buyerRoutes.ts', 'src/server/sellerRoutes.ts'].every((p) => fs.readFileSync(p, 'utf8').includes('applyKycReverification(') && fs.readFileSync(p, 'utf8').includes('reverificationRequiredPayload(')), writers);

  const pv = fs.readFileSync('src/components/ProfileView.tsx', 'utf8').split(String.fromCharCode(13, 10)).join(String.fromCharCode(10));
  report('G2 tela do perfil: o 409 vira confirmação explícita (window.confirm) e só reenvia com confirmReverification; cancelar mantém o KYC', pv.includes("'KYC_REVERIFICATION_REQUIRED'") && pv.includes('window.confirm(') && pv.includes('confirmReverification: true') && pv.includes('Alteração do nome cancelada'));
  const kycSrc = fs.readFileSync('src/server/modules/seller/kycService.ts', 'utf8');
  report('G3 a regra é uma só: a rotina de reverificação existe uma única vez (kycService) e os dois caminhos só a chamam', (kycSrc.match(/export async function applyKycReverification/g) || []).length === 1 && !/reverification_required/.test(fs.readFileSync('src/server/sellerRoutes.ts', 'utf8')) && !/reverification_required/.test(fs.readFileSync('src/server/buyerRoutes.ts', 'utf8')));

  console.log(`\n${passed}/${total} passaram`);
  server.close(); await pool.end();
  process.exit(passed === total ? 0 : 1);
}
main().catch((e) => { console.error('ERRO FATAL', e); process.exit(2); });
