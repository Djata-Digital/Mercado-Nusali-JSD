/**
 * Onboarding/KYC do vendedor — API real (HTTP) em Postgres 17 DESCARTAVEL: pessoa fisica x empresa, documentos e campos ausentes
 * (400 estruturado por campo), regras por pais, reenvio sem repetir uploads, dados guardados (tipo, NIF, nascimento), e o fluxo de
 * aprovacao/rejeicao do administrador (so aprova com a documentacao exigida). Nunca producao.
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
import { users, sellers, countries } from '../src/db/schema.js';
import { apiRouter } from '../src/server/api.js';

if (!['localhost', '127.0.0.1'].includes(new URL(testDbUrl).hostname)) throw new Error('Somente banco local descartavel.');
let passed = 0, total = 0;
const report = (l: string, ok: boolean, d?: any) => { total++; if (ok) passed++; console.log(`[${ok ? 'PASS' : 'FAIL'}] ${l}${ok ? '' : ' -> ' + JSON.stringify(d ?? null).slice(0, 700)}`); };
let seq = 0;
const uid = (p: string) => `${p}_kyc_${Date.now()}_${++seq}_${Math.random().toString(36).slice(2, 5)}`;
const tokenFor = (userId: string, role: string) => jwt.sign({ userId, email: `${userId}@t.test`, role, fullName: `T ${userId}`, countryCode: 'GW', kycStatus: 'pending', isEmailVerified: true }, process.env.JWT_ACCESS_SECRET!);

async function main() {
  const pool = new pg.Pool({ connectionString: testDbUrl, ssl: { rejectUnauthorized: false }, max: 8 });
  const db = drizzle(pool, { schema });
  const q = async (s: string, p?: any[]) => (await pool.query(s, p)).rows;
  const app = express(); app.use(express.json()); app.use('/api/v1', apiRouter);
  const server = http.createServer(app); await new Promise<void>((r) => server.listen(0, r));
  const base = `http://localhost:${(server.address() as any).port}/api/v1`;
  const call = async (method: string, path: string, token: string, body?: any) => {
    const res = await fetch(`${base}${path}`, { method, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: body !== undefined ? JSON.stringify(body) : undefined });
    let json: any = null; try { json = await res.json(); } catch { /* */ }
    return { status: res.status, json };
  };
  await db.insert(countries).values([{ id: 'GW', code: 'GW', name: 'Guiné-Bissau', flag: 'x', currency: 'XOF', currencySymbol: 'CFA', phonePrefix: '+245', isActive: true, createdAt: new Date() }]).onConflictDoNothing();

  const mkSeller = async (country = 'GW', tag = 's') => {
    const userId = uid('usr'); const sellerId = uid('sel');
    await db.insert(users).values({ id: userId, email: `${userId}@t.test`, passwordHash: 'x', fullName: `Vend ${tag}`, phone: '955000001', role: 'SELLER', countryCode: country, kycStatus: 'unverified', isActive: true, isEmailVerified: true, isPhoneVerified: false, createdAt: new Date(), updatedAt: new Date() } as any);
    await db.insert(sellers).values({ id: sellerId, userId, companyName: `Vend ${tag}`, tradingName: `Vend ${tag}`, taxId: '955000001', phone: '955000001', countryCode: country, status: 'pending', createdAt: new Date(), updatedAt: new Date() } as any);
    return { userId, sellerId, token: tokenFor(userId, 'SELLER') };
  };
  const adminUser = uid('adm');
  await db.insert(users).values({ id: adminUser, email: `${adminUser}@t.test`, passwordHash: 'x', fullName: 'Admin', phone: '1', role: 'GLOBAL_ADMIN', countryCode: 'GW', kycStatus: 'verified', isActive: true, isEmailVerified: true, isPhoneVerified: false, createdAt: new Date(), updatedAt: new Date() } as any);
  const adminToken = tokenFor(adminUser, 'GLOBAL_ADMIN');

  const file = (name: string) => ({ url: `https://r2.example.invalid/kyc/${name}.jpg`, objectKey: `kyc/${name}.jpg`, mimeType: 'image/jpeg', size: 1234 });
  const full = (extra: any = {}) => ({
    accountType: 'pf', legalName: 'Maria da Silva', birthDate: '1990-05-17', taxId: '123456789', phone: '+245 955000001', documentType: 'bi', documentNumber: 'BI123456',
    documentFrontUrl: file('id').url, identityMetadata: file('id'), proofOfAddressUrl: file('addr').url, addressMetadata: file('addr'), selfieUrl: file('selfie').url, selfieMetadata: file('selfie'), ...extra,
  });
  const fields = (r: any) => (r.json?.error?.details ?? []).map((d: any) => d.field).sort().join();

  // ---------------- A. pessoa fisica
  const pf = await mkSeller('GW', 'pf');
  const a1 = await call('POST', '/seller/kyc/submit', pf.token, full());
  report('A1 PESSOA FISICA com os 3 documentos e todos os campos: aceita (200), SEM registro empresarial', a1.status === 200 && a1.json?.success === true, a1.json);
  const docsA = await q('SELECT document_type t FROM seller_documents WHERE seller_id=$1 ORDER BY 1', [pf.sellerId]);
  report('A2 nenhum documento de empresa foi gravado para pessoa fisica (identidade, comprovante, selfie)', docsA.map((d: any) => d.t).join() === 'identity_document,proof_of_address,selfie', docsA);
  const a3 = await call('POST', '/seller/kyc/submit', pf.token, full({ businessLicenseUrl: file('biz').url, companyMetadata: file('biz') }));
  report('A3 pessoa fisica que envia (por engano) um registro empresarial: ele e IGNORADO (nunca gravado)', a3.status === 200 && (await q("SELECT count(*)::int n FROM seller_documents WHERE seller_id=$1 AND document_type='business_license'", [pf.sellerId]))[0].n === 0);
  const meta = (await q('SELECT s.tax_id, s.phone, p.settings_json FROM sellers s LEFT JOIN seller_profiles p ON p.seller_id=s.id WHERE s.id=$1', [pf.sellerId]))[0];
  report('A4 guardados: tipo de conta (pf) e nascimento no perfil; NIF e telefone validados no vendedor (o NIF deixa de ser o telefone)', meta.settings_json?.kyc?.accountType === 'pf' && meta.settings_json?.kyc?.birthDate === '1990-05-17' && meta.tax_id === '123456789' && meta.phone === '+245 955000001', meta);
  const g = await call('GET', '/seller/kyc', pf.token);
  report('A5 GET /seller/kyc devolve o tipo, NIF, telefone, nascimento e pais guardados (a tela volta preenchida)', g.json?.data?.accountType === 'pf' && g.json?.data?.taxId === '123456789' && g.json?.data?.birthDate === '1990-05-17' && g.json?.data?.country === 'GW' && g.json?.data?.documentNumber === 'BI123456', g.json?.data);
  const st = await call('GET', '/seller/settings', pf.token);
  report('A6 /seller/settings NAO expoe a chave interna do KYC', st.json?.data && !('kyc' in st.json.data), st.json?.data);

  // ---------------- B. empresa
  const emp = await mkSeller('GW', 'emp');
  const b1 = await call('POST', '/seller/kyc/submit', emp.token, full({ accountType: 'empresa', taxId: '987654321' }));
  report('B1 EMPRESA sem registro empresarial: 400 estruturado (KYC_VALIDATION_FAILED) com o campo "businessLicense" e mensagem especifica', b1.status === 400 && b1.json?.error?.code === 'KYC_VALIDATION_FAILED' && fields(b1) === 'businessLicense' && /registro empresarial/i.test(b1.json.error.details[0].message) && b1.json.error.details[0].step === 'business', b1.json);
  report('B2 a resposta traz "message" no topo (para qualquer cliente mostrar o motivo) e nada foi gravado', typeof b1.json?.message === 'string' && b1.json.message.length > 10 && (await q('SELECT count(*)::int n FROM seller_kyc WHERE seller_id=$1', [emp.sellerId]))[0].n === 0, b1.json?.message);
  const b3 = await call('POST', '/seller/kyc/submit', emp.token, full({ accountType: 'empresa', taxId: '987654321', businessLicenseUrl: file('biz').url, companyMetadata: file('biz') }));
  report('B3 EMPRESA com tudo + registro empresarial: aceita; 4 documentos gravados e tipo "empresa" guardado', b3.status === 200 && (await q("SELECT count(*)::int n FROM seller_documents WHERE seller_id=$1", [emp.sellerId]))[0].n === 4 && (await q("SELECT settings_json->'kyc'->>'accountType' t FROM seller_profiles WHERE seller_id=$1", [emp.sellerId]))[0].t === 'empresa', b3.json);

  // ---------------- C. campos e documentos ausentes
  const c = await mkSeller('GW', 'c');
  const c1 = await call('POST', '/seller/kyc/submit', c.token, { accountType: 'pf' });
  const expectAll = 'birthDate,documentNumber,documentType,identityDocument,legalName,phone,proofOfAddress,selfie,taxId';
  report('C1 pessoa fisica sem NADA: 400 lista TODOS os campos e documentos que faltam, por campo (e nenhum de empresa)', c1.status === 400 && fields(c1) === expectAll && !fields(c1).includes('businessLicense'), fields(c1));
  report('C2 cada problema traz rotulo, mensagem e etapa onde corrigir', c1.json.error.details.every((d: any) => d.label && d.message && d.step) && c1.json.error.details.find((d: any) => d.field === 'selfie')?.step === 'selfie', c1.json.error.details.slice(0, 2));
  const c3 = await call('POST', '/seller/kyc/submit', c.token, {});
  report('C3 sem tipo de conta: 400 pedindo o tipo (nunca assume pessoa fisica nem empresa)', c3.status === 400 && fields(c3) === 'accountType', c3.json);
  const c4 = await call('POST', '/seller/kyc/submit', c.token, { ...full(), accountType: 'qualquer' });
  report('C4 tipo de conta desconhecido: 400 (accountType)', c4.status === 400 && fields(c4) === 'accountType');
  const c5 = await call('POST', '/seller/kyc/submit', c.token, full({ legalName: '   ', phone: 'abc', birthDate: '2999-01-01', taxId: 'x', documentNumber: '1' }));
  report('C5 valores vazios/invalidos: nome, telefone, nascimento (futuro), NIF e numero do documento, cada um com a sua mensagem', c5.status === 400 && fields(c5) === 'birthDate,documentNumber,legalName,phone,taxId', c5.json?.error?.details);
  const c6 = await call('POST', '/seller/kyc/submit', c.token, full({ birthDate: '2015-01-01' }));
  report('C6 menor de 18 anos recusado com mensagem propria', c6.status === 400 && /18 anos/.test(c6.json?.error?.details?.[0]?.message || ''), c6.json?.error?.details);
  report('C7 nada foi gravado em nenhuma tentativa invalida (sem KYC, sem documentos, usuario inalterado)', (await q('SELECT count(*)::int n FROM seller_kyc WHERE seller_id=$1', [c.sellerId]))[0].n === 0 && (await q('SELECT count(*)::int n FROM seller_documents WHERE seller_id=$1', [c.sellerId]))[0].n === 0 && (await q('SELECT kyc_status s FROM users WHERE id=$1', [c.userId]))[0].s === 'unverified');

  // ---------------- D. regras por pais
  const br = await mkSeller('BR', 'br');
  const d1 = await call('POST', '/seller/kyc/submit', br.token, full({ taxId: '123.456.789-00', documentType: 'cni' }));
  report('D1 Brasil, pessoa fisica: CPF com digito verificador errado e recusado ("CPF inválido")', d1.status === 400 && /CPF/.test(d1.json?.error?.details?.[0]?.message || '') && fields(d1) === 'taxId', d1.json?.error?.details);
  const d2 = await call('POST', '/seller/kyc/submit', br.token, full({ taxId: '529.982.247-25', documentType: 'bi' }));
  report('D2 Brasil: CPF valido passa, mas "BI" nao e documento aceito no pais (so passaporte e CNI/CNH)', d2.status === 400 && fields(d2) === 'documentType', d2.json?.error?.details);
  const d3 = await call('POST', '/seller/kyc/submit', br.token, full({ taxId: '529.982.247-25', documentType: 'cni' }));
  report('D3 Brasil, pessoa fisica com CPF valido e CNI: aceita', d3.status === 200, d3.json);
  const br2 = await mkSeller('BR', 'br2');
  const d4 = await call('POST', '/seller/kyc/submit', br2.token, full({ accountType: 'empresa', taxId: '529.982.247-25', documentType: 'cni', businessLicenseUrl: file('biz').url }));
  report('D4 Brasil, EMPRESA com um CPF no lugar do CNPJ: recusada ("CNPJ inválido")', d4.status === 400 && /CNPJ/.test(d4.json?.error?.details?.[0]?.message || ''), d4.json?.error?.details);
  const d5 = await call('POST', '/seller/kyc/submit', br2.token, full({ accountType: 'empresa', taxId: '11.222.333/0001-81', documentType: 'cni', businessLicenseUrl: file('biz').url }));
  report('D5 Brasil, empresa com CNPJ valido e registro: aceita', d5.status === 200, d5.json);
  const pt = await mkSeller('PT', 'pt');
  const d6 = await call('POST', '/seller/kyc/submit', pt.token, full({ taxId: '123456780' }));
  const d7 = await call('POST', '/seller/kyc/submit', pt.token, full({ taxId: '123456789' }));
  report('D6 Portugal: NIF com digito de controle errado recusado; NIF valido aceito', d6.status === 400 && fields(d6) === 'taxId' && d7.status === 200, { d6: d6.json?.error?.details, d7: d7.status });
  const d8 = await call('POST', '/seller/kyc/submit', pf.token, full({ taxId: 'ab' }));
  report('D8 Guine-Bissau: NIF/BI muito curto ou sem numeros recusado', d8.status === 400 && fields(d8) === 'taxId');

  // ---------------- E. reenvio preserva o que ja esta guardado
  const e = await mkSeller('GW', 'e');
  await call('POST', '/seller/kyc/submit', e.token, full());
  const e2 = await call('POST', '/seller/kyc/submit', e.token, { accountType: 'pf', legalName: 'Maria da Silva', birthDate: '1990-05-17', taxId: '123456789', phone: '+245 955000001', documentType: 'bi', documentNumber: 'BI123456' });
  report('E1 reenvio sem anexar os arquivos de novo: vale o que ja esta guardado (nao obriga a repetir uploads)', e2.status === 200, e2.json);
  const e3 = await call('POST', '/seller/kyc/submit', e.token, { accountType: 'pf', legalName: 'Maria da Silva' });
  report('E2 reenvio incompleto: lista so o que realmente falta (campos), nao os documentos ja guardados', e3.status === 400 && !fields(e3).includes('identityDocument') && !fields(e3).includes('selfie') && fields(e3).includes('taxId'), fields(e3));

  // ---------------- F. aprovacao do administrador
  const listBefore = await call('GET', '/admin/kyc', adminToken);
  const itemPf = (listBefore.json?.data ?? []).find((k: any) => k.sellerId === pf.sellerId);
  const itemEmp = (listBefore.json?.data ?? []).find((k: any) => k.sellerId === emp.sellerId);
  report('F1 fila do admin mostra o TIPO real (Pessoa Fisica / Empresa) em vez de sempre "Empresa", e nada faltando nos completos', itemPf?.accountType === 'Pessoa Física / Autônomo' && itemPf?.accountTypeKey === 'pf' && itemPf?.missingRequirements?.length === 0 && itemEmp?.accountType === 'Empresa / Sociedade Comercial' && itemEmp?.missingRequirements?.length === 0, { pf: itemPf?.accountType, emp: itemEmp?.accountType });
  const ap1 = await call('POST', `/admin/kyc/${itemPf.id}/approve`, adminToken, {});
  report('F2 pessoa fisica COMPLETA e aprovada pelo admin (sem exigir registro empresarial)', ap1.status === 200 && (await q('SELECT status FROM seller_kyc WHERE seller_id=$1', [pf.sellerId]))[0].status === 'verified' && (await q('SELECT status FROM sellers WHERE id=$1', [pf.sellerId]))[0].status === 'active', ap1.json);
  const ap2 = await call('POST', `/admin/kyc/${itemEmp.id}/approve`, adminToken, {});
  report('F3 empresa completa e aprovada', ap2.status === 200 && (await q('SELECT kyc_status s FROM users WHERE id=$1', [emp.userId]))[0].s === 'verified', ap2.json);

  // incompleto no banco: empresa sem registro (simula cadastro antigo/adulterado) e pessoa fisica sem selfie
  const inc = await mkSeller('GW', 'inc');
  await call('POST', '/seller/kyc/submit', inc.token, full({ accountType: 'empresa', taxId: '987654321', businessLicenseUrl: file('biz').url, companyMetadata: file('biz') }));
  await q("DELETE FROM seller_documents WHERE seller_id=$1 AND document_type='business_license'", [inc.sellerId]);
  const incKyc = (await q('SELECT id FROM seller_kyc WHERE seller_id=$1', [inc.sellerId]))[0];
  const ap3 = await call('POST', `/admin/kyc/${incKyc.id}/approve`, adminToken, {});
  report('F4 empresa SEM o registro empresarial no banco: aprovacao BLOQUEADA (400 KYC_APPROVAL_BLOCKED) e o vendedor continua nao verificado', ap3.status === 400 && ap3.json?.error?.code === 'KYC_APPROVAL_BLOCKED' && /empresarial/i.test(JSON.stringify(ap3.json?.error?.details)) && (await q('SELECT status FROM seller_kyc WHERE id=$1', [incKyc.id]))[0].status === 'pending' && (await q('SELECT kyc_status s FROM users WHERE id=$1', [inc.userId]))[0].s === 'pending', ap3.json);
  const lst = await call('GET', '/admin/kyc', adminToken);
  report('F5 a fila do admin mostra o que falta (missingRequirements) nesse cadastro', (lst.json?.data ?? []).find((k: any) => k.sellerId === inc.sellerId)?.missingRequirements?.some((m: any) => m.field === 'businessLicense'));
  const nok = await mkSeller('GW', 'nok');
  await call('POST', '/seller/kyc/submit', nok.token, full());
  const nokKyc = (await q('SELECT id FROM seller_kyc WHERE seller_id=$1', [nok.sellerId]))[0];
  await q("DELETE FROM seller_documents WHERE seller_id=$1 AND document_type='selfie'", [nok.sellerId]);
  await q('UPDATE seller_kyc SET selfie_url=NULL WHERE id=$1', [nokKyc.id]);
  const ap4 = await call('POST', `/admin/kyc/${nokKyc.id}/approve`, adminToken, {});
  report('F6 pessoa fisica sem selfie no banco: aprovacao bloqueada com a causa (selfie)', ap4.status === 400 && /selfie/i.test(ap4.json?.message || ''), ap4.json?.message);
  const never = await mkSeller('GW', 'never');
  const ap5 = await call('POST', `/admin/kyc/kyc_${never.sellerId}/approve`, adminToken, {});
  report('F7 vendedor que NUNCA enviou KYC: o atalho antigo (criar registro ja "verified" sem documentos) foi fechado — 400 e nada criado', ap5.status === 400 && (await q('SELECT count(*)::int n FROM seller_kyc WHERE seller_id=$1', [never.sellerId]))[0].n === 0, ap5.json);
  const rej = await call('POST', `/admin/kyc/${incKyc.id}/reject`, adminToken, { reason: 'Registro empresarial ilegivel' });
  report('F8 rejeicao continua funcionando (fluxo existente): status rejected e motivo guardado', rej.status === 200 && (await q('SELECT status, rejection_reason r FROM seller_kyc WHERE id=$1', [incKyc.id]))[0].r === 'Registro empresarial ilegivel', rej.json);
  // reenvio depois de rejeitado volta a pendente
  const re = await call('POST', '/seller/kyc/submit', inc.token, full({ accountType: 'empresa', taxId: '987654321', businessLicenseUrl: file('biz2').url, companyMetadata: file('biz2') }));
  report('F9 reenvio apos rejeicao: volta para "pending" para nova analise', re.status === 200 && (await q('SELECT status FROM seller_kyc WHERE id=$1', [incKyc.id]))[0].status === 'pending', re.json);

  // cadastro antigo sem tipo guardado
  const old = await mkSeller('GW', 'old');
  await q("INSERT INTO seller_kyc (id, seller_id, legal_name, document_type, document_number, document_front_url, selfie_url, proof_of_address_url, status) VALUES ($1,$2,'Antigo','bi','B1','u1','u2','u3','pending')", [uid('kyc'), old.sellerId]);
  const lst2 = await call('GET', '/admin/kyc', adminToken);
  const oldItem = (lst2.json?.data ?? []).find((k: any) => k.sellerId === old.sellerId);
  report('F10 cadastro ANTIGO (sem tipo guardado): rotulado "Não informado", exige o conjunto comum e pode ser aprovado se completo', /Não informado/.test(oldItem?.accountType || '') && oldItem?.missingRequirements?.length === 0, oldItem);

  // ---------------- G. aviso "cadastro nao inicializado": inexistente x sem KYC enviado x pendente
  const noSeller = uid('usr');
  await db.insert(users).values({ id: noSeller, email: `${noSeller}@t.test`, passwordHash: 'x', fullName: 'Sem cadastro', phone: '1', role: 'SELLER', countryCode: 'GW', kycStatus: 'unverified', isActive: true, isEmailVerified: true, isPhoneVerified: false, createdAt: new Date(), updatedAt: new Date() } as any);
  const g1 = await call('GET', '/seller/kyc', tokenFor(noSeller, 'SELLER'));
  report('G1 usuario SEM cadastro de vendedor: 404 SELLER_PROFILE_NOT_FOUND (a tela pede o onboarding)', g1.status === 404 && g1.json?.error?.code === 'SELLER_PROFILE_NOT_FOUND', g1.json);
  const fresh = await mkSeller('GW', 'fresh');
  const g2 = await call('GET', '/seller/kyc', fresh.token);
  report('G2 vendedor EXISTENTE que ainda nao enviou KYC: 200 com data nula, sellerProfileExists=true e kycSubmitted=false (nunca "cadastro nao inicializado")', g2.status === 200 && g2.json?.success === true && g2.json?.data === null && g2.json?.sellerProfileExists === true && g2.json?.kycSubmitted === false, g2.json);
  await call('POST', '/seller/kyc/submit', fresh.token, full());
  const g3 = await call('GET', '/seller/kyc', fresh.token);
  report('G3 depois do envio: KYC pendente de analise (status pending, kycSubmitted=true) — distinto dos dois casos anteriores', g3.json?.data?.status === 'pending' && g3.json?.kycSubmitted === true && g3.json?.sellerProfileExists === true, g3.json?.data?.status);

  server.close(); await pool.end();
  console.log(`\n=== RESULTADO: ${passed}/${total} ===`);
  process.exit(passed === total ? 0 : 1);
}
main().catch((e) => { console.error('ERRO FATAL', e); process.exit(2); });
