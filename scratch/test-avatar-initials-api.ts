/**
 * Foto de perfil — API real (HTTP) em Postgres 17 DESCARTAVEL: PUT /buyer/profile so aceita a foto carregada pela propria pessoa
 * (ou vazio para voltar as iniciais), upload de perfil confere o conteudo real do arquivo (armazenamento SUBSTITUIDO, nunca R2),
 * alteracao de nome sem mexer na foto, avatar artificial antigo tolerado/limpo, e persistencia (GET perfil). Nunca producao.
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
import http from 'http';
import express from 'express';
import jwt from 'jsonwebtoken';
import pg from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import * as schema from '../src/db/schema.js';
import { users, countries } from '../src/db/schema.js';
import { apiRouter } from '../src/server/api.js';
import { storageService } from '../src/server/infra/storage.js';

if (!['localhost', '127.0.0.1'].includes(new URL(testDbUrl).hostname)) throw new Error('Somente banco local descartavel.');
process.env.STORAGE_PUBLIC_URL = 'https://pub-test.example.invalid'; // dotenv nao sobrescreve, mas garante
let passed = 0, total = 0;
const report = (l: string, ok: boolean, d?: any) => { total++; if (ok) passed++; console.log(`[${ok ? 'PASS' : 'FAIL'}] ${l}${ok ? '' : ' -> ' + JSON.stringify(d ?? null).slice(0, 700)}`); };
let seq = 0;
const uid = (p: string) => `${p}_av_${Date.now()}_${++seq}_${Math.random().toString(36).slice(2, 5)}`;
const tokenFor = (userId: string, role = 'BUYER') => jwt.sign({ userId, email: `${userId}@t.test`, role, fullName: `T ${userId}`, countryCode: 'GW', kycStatus: 'unverified', isEmailVerified: true }, process.env.JWT_ACCESS_SECRET!);
const UNSPLASH = 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&w=150&q=80';

// arquivos de teste com assinatura real (minimos)
const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(64, 1)]);
const JPEG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(64, 2)]);

async function main() {
  const pool = new pg.Pool({ connectionString: testDbUrl, ssl: { rejectUnauthorized: false }, max: 6 });
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
  const upload = async (token: string, buf: Buffer, type: string, name = 'foto.jpg') => {
    const fd = new FormData(); fd.append('file', new Blob([buf], { type }), name);
    const res = await fetch(`${base}/upload/profiles`, { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: fd });
    let json: any = null; try { json = await res.json(); } catch { /* */ }
    return { status: res.status, json };
  };
  // armazenamento SUBSTITUIDO: nunca chega ao R2
  let stored = 0;
  (storageService as any).uploadFile = async (file: any, folder: string, opts: any) => {
    stored++;
    return { url: `${process.env.STORAGE_PUBLIC_URL}/${opts?.objectKey ?? folder + '/x'}?v=${stored}`, objectKey: opts?.objectKey ?? 'x', bucket: 'test', access: 'public', fileSize: file.size, mimeType: file.mimetype };
  };

  await db.insert(countries).values([{ id: 'GW', code: 'GW', name: 'Guiné-Bissau', flag: 'x', currency: 'XOF', currencySymbol: 'CFA', phonePrefix: '+245', isActive: true, createdAt: new Date() }]).onConflictDoNothing();
  const mk = async (name: string, avatar: string | null = null) => {
    const userId = uid('usr');
    await db.insert(users).values({ id: userId, email: `${userId}@t.test`, passwordHash: 'x', fullName: name, phone: '955000001', role: 'BUYER', countryCode: 'GW', kycStatus: 'unverified', isActive: true, isEmailVerified: true, isPhoneVerified: false, avatarUrl: avatar, createdAt: new Date(), updatedAt: new Date() } as any);
    return { userId, token: tokenFor(userId) };
  };
  const dbAvatar = async (id: string) => (await q('SELECT avatar_url FROM users WHERE id=$1', [id]))[0]?.avatar_url ?? null;
  const getProfile = async (t: string) => (await call('GET', '/buyer/profile', t)).json?.data;

  // ---------- A. cadastro sem foto
  const a = await mk('João Djata');
  report('A1 conta sem foto: perfil devolve avatar vazio (a tela mostra JD)', (await getProfile(a.token))?.avatar === '' && (await getProfile(a.token))?.fullName === 'João Djata');

  // ---------- B. upload (mecanismo existente) com validacao de tipo/tamanho/conteudo
  let r = await upload(a.token, PNG, 'image/png', 'a.png');
  report('B1 PNG real é aceito (201) e a chave é profiles/<id>/avatar', r.status === 201 && String(r.json?.data?.url).startsWith(`https://pub-test.example.invalid/profiles/${encodeURIComponent(a.userId)}/avatar`), r);
  const myUrl = r.json?.data?.url as string;
  r = await upload(a.token, JPEG, 'image/jpeg', 'a.jpg');
  report('B2 JPEG real é aceito (201)', r.status === 201, r);
  r = await upload(a.token, Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"></svg>'.padEnd(64, ' ')), 'image/png', 'x.png');
  report('B3 arquivo que NÃO é imagem, mas declara image/png → 400 INVALID_IMAGE_CONTENT (nada gravado)', r.status === 400 && r.json?.error?.code === 'INVALID_IMAGE_CONTENT', r);
  const before = stored;
  r = await upload(a.token, PNG, 'image/jpeg', 'x.jpg');
  report('B4 PNG declarado como JPEG (tipo ≠ conteúdo) → 400', r.status === 400 && r.json?.error?.code === 'INVALID_IMAGE_CONTENT' && stored === before, r);
  r = await upload(a.token, Buffer.from('GIF89a' + 'x'.repeat(64)), 'image/gif', 'x.gif');
  report('B5 GIF recusado pelo tipo', r.status >= 400 && r.status < 500, r);
  r = await upload(a.token, Buffer.concat([PNG, Buffer.alloc(5 * 1024 * 1024)]), 'image/png', 'big.png');
  report('B6 acima de 5 MB → 413/400, nada gravado', (r.status === 413 || r.status === 400) && stored === before, r);
  r = await fetch(`${base}/upload/profiles`, { method: 'POST', body: new FormData() }).then(async (x) => ({ status: x.status, json: await x.json().catch(() => null) }));
  report('B7 sem sessão → 401', r.status === 401, r);

  // ---------- C. salvar a foto no perfil
  const bad = await call('PUT', '/buyer/profile', a.token, { avatar: 'https://example.com/meu.png' });
  report('C1 link externo → 400 AVATAR_NOT_ALLOWED e nada muda', bad.status === 400 && bad.json?.error?.code === 'AVATAR_NOT_ALLOWED' && (await dbAvatar(a.userId)) === null, bad);
  const bad2 = await call('PUT', '/buyer/profile', a.token, { avatar: UNSPLASH });
  report('C2 avatar predefinido (Unsplash) não pode mais ser definido → 400', bad2.status === 400 && bad2.json?.error?.code === 'AVATAR_NOT_ALLOWED', bad2);
  const bad3 = await call('PUT', '/buyer/profile', a.token, { avatar: `https://pub-test.example.invalid/profiles/${encodeURIComponent('outro_usuario')}/avatar?v=1` });
  report('C3 foto de OUTRO usuário → 400', bad3.status === 400, bad3);
  const bad4 = await call('PUT', '/buyer/profile', a.token, { avatar: 'data:image/png;base64,AAAA' });
  report('C4 data: URL → 400', bad4.status === 400, bad4);
  const bad5 = await call('PUT', '/buyer/profile', a.token, { avatar: `https://pub-test.example.invalid.evil.com/profiles/${encodeURIComponent(a.userId)}/avatar` });
  report('C5 domínio parecido (prefixo enganoso) → 400', bad5.status === 400, bad5);
  const ok = await call('PUT', '/buyer/profile', a.token, { avatar: myUrl });
  report('C6 a foto do próprio upload é salva', ok.status === 200 && (await dbAvatar(a.userId)) === myUrl, ok);
  report('C7 persistência: o perfil (e o login, que lê a mesma coluna) devolve a foto', (await getProfile(a.token))?.avatar === myUrl);

  // ---------- D. alterar nome sem perder a foto; iniciais seguem o nome
  const rn = await call('PUT', '/buyer/profile', a.token, { fullName: 'Maria Pereira', avatar: myUrl });
  report('D1 mudar o nome mantém a foto real', rn.status === 200 && (await getProfile(a.token))?.fullName === 'Maria Pereira' && (await dbAvatar(a.userId)) === myUrl, rn);
  const rn2 = await call('PUT', '/buyer/profile', a.token, { fullName: 'Maria Pereira Gomes' });
  report('D2 salvar só o nome (sem "avatar") não toca na foto', rn2.status === 200 && (await dbAvatar(a.userId)) === myUrl, rn2);

  // ---------- E. remover foto → iniciais
  const rm = await call('PUT', '/buyer/profile', a.token, { avatar: '' });
  report('E1 avatar vazio remove a foto (volta às iniciais)', rm.status === 200 && (await dbAvatar(a.userId)) === null && (await getProfile(a.token))?.avatar === '', rm);

  // ---------- F. conta antiga com avatar artificial
  const old = await mk('Djata Digital', UNSPLASH);
  const keep = await call('PUT', '/buyer/profile', old.token, { fullName: 'Djata Digital Lda', avatar: UNSPLASH });
  report('F1 conta antiga com Unsplash: salvar o perfil com o mesmo valor não é bloqueado', keep.status === 200 && (await getProfile(old.token))?.fullName === 'Djata Digital Lda', keep);
  const clean = await call('PUT', '/buyer/profile', old.token, { avatar: '' });
  report('F2 o cliente envia "" ao salvar → o avatar artificial é limpo do banco', clean.status === 200 && (await dbAvatar(old.userId)) === null, clean);
  const real = await mk('Ana Real', `https://pub-test.example.invalid/profiles/ana/avatar?v=9`);
  const rr = await call('PUT', '/buyer/profile', real.token, { fullName: 'Ana Real Silva' });
  report('F3 foto real já existente permanece ao salvar outros campos', rr.status === 200 && (await dbAvatar(real.userId)) === `https://pub-test.example.invalid/profiles/ana/avatar?v=9`, rr);

  // ---------- G. isolamento
  const b = await mk('Beto');
  const cross = await call('PUT', '/buyer/profile', b.token, { avatar: myUrl });
  report('G1 uma pessoa não consegue apontar para a foto de outra', cross.status === 400 && (await dbAvatar(b.userId)) === null, cross);

  console.log(`\n${passed}/${total} passaram`);
  server.close(); await pool.end();
  process.exit(passed === total ? 0 : 1);
}
main().catch((e) => { console.error('ERRO FATAL', e); process.exit(2); });
