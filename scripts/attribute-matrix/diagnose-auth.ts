/**
 * FASE 8C.3 — diagnóstico de AUTENTICAÇÃO do papel temporário (somente leitura, sem escrever nada, sem imprimir segredos).
 *
 *   node --import tsx scripts/attribute-matrix/diagnose-auth.ts
 *
 * Lê a URL do papel de ATTR_LOAD_DATABASE_URL (a mesma do carregador) e responde, sem expor a senha:
 *   1. o formato do usuário está correto para o pooler do Supabase (papel.<ref>)?
 *   2. a SENHA da URL confere com a senha realmente armazenada para o papel? A conferência é local: lê o segredo SCRAM do papel com a
 *      credencial administrativa do app (ATTR_VERIFY_ADMIN_URL, ou DATABASE_URL do .env), em transação SOMENTE LEITURA, recalcula o
 *      SCRAM com a senha da URL e compara. Nem a senha nem o segredo são impressos.
 *   3. o papel está dentro do prazo e pode logar?
 *   4. o que cada rota de conexão responde (pooler em sessão, pooler em transação), com o SQLSTATE e a mensagem seguros.
 */
import 'dotenv/config';
import crypto from 'crypto';
import pg from 'pg';
import { describeError, secretsFromUrl } from './safeError.js';

const ROLE = 'attr_loader_8c3';

function parseUrl(raw: string) {
  const u = new URL(raw);
  // exatamente o que o driver usa: usuário e senha decodificados
  return { user: decodeURIComponent(u.username), password: decodeURIComponent(u.password), host: u.hostname, port: u.port || '5432', database: decodeURIComponent(u.pathname.replace(/^\//, '')) || 'postgres' };
}

/** Confere uma senha contra um segredo SCRAM-SHA-256 do PostgreSQL ("SCRAM-SHA-256$iter:salt$StoredKey:ServerKey"). null = formato desconhecido. */
export function scramMatches(password: string, secret: string): boolean | null {
  const m = /^SCRAM-SHA-256\$(\d+):([^$]+)\$([^:]+):(.+)$/.exec(secret);
  if (!m) return null;
  const salt = Buffer.from(m[2], 'base64');
  const stored = Buffer.from(m[3], 'base64');
  const saltedPassword = crypto.pbkdf2Sync(password.normalize('NFKC'), salt, Number(m[1]), 32, 'sha256'); // NFKC ≈ SASLprep (idêntico para ASCII)
  const clientKey = crypto.createHmac('sha256', saltedPassword).update('Client Key').digest();
  const storedKey = crypto.createHash('sha256').update(clientKey).digest();
  return storedKey.length === stored.length && crypto.timingSafeEqual(storedKey, stored);
}

async function probe(label: string, rawUrl: string, secrets: string[]) {
  const pool = new pg.Pool({ connectionString: rawUrl, max: 1, connectionTimeoutMillis: 15000, ssl: { rejectUnauthorized: false }, options: '-c default_transaction_read_only=on' });
  pool.on('error', () => undefined);
  try {
    const r = await pool.query('select current_user as u, now() as agora');
    console.log(`  ${label}: CONECTOU como "${r.rows[0].u}"`);
    return true;
  } catch (e) {
    console.log(`  ${label}: FALHOU — ${describeError(e, secrets)}`);
    return false;
  } finally {
    await pool.end().catch(() => undefined);
  }
}

async function main() {
  const raw = process.env.ATTR_LOAD_DATABASE_URL;
  if (!raw) { console.log('Defina ATTR_LOAD_DATABASE_URL (a URL do papel) no PowerShell, como no passo 2 do runbook.'); process.exit(2); }
  const t = parseUrl(raw);
  const secrets = secretsFromUrl(raw);
  const isPooler = /pooler\.supabase\.com$/i.test(t.host);
  const baseUser = t.user.split('.')[0];
  console.log('1) FORMATO DA URL');
  console.log(`  host=${t.host} porta=${t.port} banco=${t.database}`);
  console.log(`  usuário: papel="${baseUser}"${t.user.includes('.') ? ' + sufixo de projeto (ok para o pooler)' : ' SEM sufixo de projeto'}`);
  if (baseUser !== ROLE) console.log(`  ATENÇÃO: o usuário deveria ser exatamente "${ROLE}" (ou "${ROLE}.<ref>" no pooler).`);
  if (isPooler && !t.user.includes('.')) console.log('  ATENÇÃO: no pooler do Supabase o usuário precisa do sufixo: attr_loader_8c3.<ref-do-projeto>.');
  if (/[<>]/.test(t.user)) console.log('  ATENÇÃO: o usuário contém "<" ou ">": o marcador <REF-DO-PROJETO> não foi substituído.');
  const pw = t.password;
  console.log(`  senha: ${pw.length} caracteres${pw !== pw.trim() ? ' (TEM espaço no início/fim!)' : ''}${/[^\x20-\x7e]/.test(pw) ? ' (tem caracteres fora do ASCII)' : ''}${pw.length === 0 ? ' (VAZIA!)' : ''}`);

  console.log('2) SENHA DA URL x SENHA ARMAZENADA (conferência local, sem imprimir segredos)');
  const adminUrl = process.env.ATTR_VERIFY_ADMIN_URL || process.env.DATABASE_URL;
  if (!adminUrl) { console.log('  sem credencial administrativa no ambiente (.env/DATABASE_URL): conferência ignorada.'); }
  else {
    const admin = new pg.Pool({ connectionString: adminUrl, max: 1, ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 15000 });
    admin.on('error', () => undefined);
    const c = await admin.connect().catch((e) => { console.log(`  não consegui ler o papel com a credencial administrativa: ${describeError(e, secretsFromUrl(adminUrl))}`); return null; });
    if (c) {
      try {
        await c.query('BEGIN READ ONLY');
        const rows = (await c.query(`select passwd, valuntil, (valuntil is not null and valuntil < now()) as expirado from pg_shadow where usename = $1`, [baseUser])).rows;
        const roles = (await c.query(`select rolcanlogin, rolconnlimit from pg_roles where rolname = $1`, [baseUser])).rows;
        await c.query('ROLLBACK');
        if (rows.length === 0) console.log(`  o papel "${baseUser}" NÃO existe (ou foi revogado).`);
        else {
          console.log(`  papel existe; login=${roles[0]?.rolcanlogin}; prazo=${rows[0].valuntil ? new Date(rows[0].valuntil).toISOString() : 'sem prazo'}; ${rows[0].expirado ? 'EXPIRADO' : 'dentro do prazo'}`);
          const ok = rows[0].passwd ? scramMatches(pw, rows[0].passwd) : null;
          if (ok === true) console.log('  RESULTADO: a senha da URL CONFERE com a senha armazenada do papel.');
          else if (ok === false) console.log('  RESULTADO: a senha da URL NÃO CONFERE com a armazenada. É diferente da definida no SQL (digitação, teclado, espaço) — redefina a senha (ver runbook) e refaça o passo 2.');
          else console.log('  RESULTADO: formato de senha armazenada não reconhecido (não é SCRAM-SHA-256).');
        }
      } finally { c.release(); await admin.end().catch(() => undefined); }
    }
  }

  console.log('3) ROTAS DE CONEXÃO (somente leitura; só SELECT)');
  await probe(`como configurado (${t.host}:${t.port})`, raw, secrets);
  if (isPooler && t.port === '5432') {
    const u = new URL(raw); u.port = '6543';
    await probe(`pooler em modo transação (${t.host}:6543)`, u.toString(), secrets);
  }
  if (isPooler && t.user.includes('.')) {
    const ref = t.user.split('.').slice(1).join('.');
    const u = new URL(raw); u.hostname = `db.${ref}.supabase.co`; u.port = '5432'; u.username = baseUser;
    console.log('  (ligação direta: o host db.<ref>.supabase.co é só IPv6 no plano Free; sem IPv6 na sua rede ela não conecta)');
    await probe(`ligação direta (db.<ref>.supabase.co:5432)`, u.toString(), secrets);
  }
}
// só executa quando chamado diretamente (importável nos testes sem efeitos colaterais)
if ((process.argv[1] || '').split('\\').join('/').endsWith('diagnose-auth.ts')) {
  main().catch((e) => { console.error('ERRO', describeError(e, secretsFromUrl(process.env.ATTR_LOAD_DATABASE_URL))); process.exit(1); });
}
