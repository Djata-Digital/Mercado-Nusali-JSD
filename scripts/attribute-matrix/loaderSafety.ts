/**
 * FASE 8B — travas de SEGURANÇA do carregador da matriz (puro, sem banco, testável).
 *
 * Princípios:
 *   1. O carregador NUNCA lê DATABASE_URL: o alvo vem só de ATTR_LOAD_DATABASE_URL (escolha consciente, por execução).
 *   2. Escrita só em banco LOCAL descartável (localhost/127.0.0.1/::1/*.localhost/*.test). Escrita em banco remoto está DESLIGADA no
 *      código (REMOTE_WRITE_ENABLED = false): ligá-la exige uma alteração de código revisada, em fase própria autorizada pelo dono.
 *   3. Qualquer alvo que coincida (host+banco) com uma URL de produção conhecida do ambiente é recusado para escrita, mesmo local
 *      por túnel, e só é aceito para leitura com --allow-remote-read (transação READ ONLY imposta pelo próprio banco).
 *   4. Escrita local ainda exige confirmação digitada com versão, hash da matriz, host e banco; e --expect-hash.
 *   5. Segredos nunca são impressos: só host:porta/banco.
 */
import { createHash } from 'crypto';

/** Interruptor mestre. Nesta fase é e permanece false. Só uma fase futura, autorizada, muda isto no código. */
export const REMOTE_WRITE_ENABLED = false;

export type CommandName = 'plan' | 'verify' | 'apply' | 'rollback-plan' | 'rollback';
export const WRITE_COMMANDS: ReadonlySet<CommandName> = new Set<CommandName>(['apply', 'rollback']);

export interface TargetInfo {
  host: string;
  port: string;
  database: string;
  isLocal: boolean;
  /** Coincide (host+banco, ou só host em provedores gerenciados) com alguma URL de produção conhecida do ambiente. */
  matchesKnownProduction: boolean;
  label: string;
}

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '[::1]']);

export function isLocalHost(host: string): boolean {
  const h = host.toLowerCase();
  return LOCAL_HOSTS.has(h) || h.endsWith('.localhost') || h.endsWith('.test');
}

function parseDbUrl(raw: string): { host: string; port: string; database: string } | null {
  try {
    const u = new URL(raw);
    if (!/^postgres(ql)?:$/.test(u.protocol)) return null;
    return { host: u.hostname, port: u.port || '5432', database: decodeURIComponent(u.pathname.replace(/^\//, '')) || 'postgres' };
  } catch {
    return null;
  }
}

/** Todas as URLs de banco que o ambiente conhece como "produção" (qualquer variável com postgres://, exceto a do carregador). */
export function knownProductionTargets(env: NodeJS.ProcessEnv): Array<{ host: string; database: string }> {
  const out: Array<{ host: string; database: string }> = [];
  for (const [k, v] of Object.entries(env)) {
    if (k === 'ATTR_LOAD_DATABASE_URL' || !v || typeof v !== 'string') continue;
    if (!/^postgres(ql)?:\/\//i.test(v)) continue;
    const p = parseDbUrl(v);
    if (p) out.push({ host: p.host.toLowerCase(), database: p.database });
  }
  return out;
}

export function classifyTarget(rawUrl: string, env: NodeJS.ProcessEnv): TargetInfo {
  const p = parseDbUrl(rawUrl);
  if (!p) throw new LoaderSafetyError('TARGET_URL_INVALID', 'ATTR_LOAD_DATABASE_URL não é uma URL postgres:// válida.');
  const local = isLocalHost(p.host);
  const known = knownProductionTargets(env);
  // mesmo host (e banco) de uma URL "de produção" do ambiente; para host remoto basta o host (pooler/direct do mesmo projeto)
  const matches = known.some((k) => (local ? false : k.host === p.host.toLowerCase()) || (k.host === p.host.toLowerCase() && k.database === p.database));
  return { host: p.host, port: p.port, database: p.database, isLocal: local, matchesKnownProduction: matches, label: `${p.host}:${p.port}/${p.database}` };
}

export class LoaderSafetyError extends Error {
  constructor(public code: string, message: string) {
    super(`${code}: ${message}`);
  }
}

export interface SafetyInput {
  command: CommandName;
  target: TargetInfo;
  nodeEnv: string | undefined;
  flags: { allowRemoteRead?: boolean; expectHash?: string; confirm?: string };
  matrixVersion: string;
  matrixHash: string;
}

export function expectedConfirmPhrase(command: CommandName, target: TargetInfo, matrixVersion: string, matrixHash: string): string {
  const verb = command === 'rollback' ? 'REVERTER' : 'APLICAR';
  return `${verb} ${matrixVersion} ${matrixHash.slice(0, 12)} EM ${target.host}:${target.port}/${target.database}`;
}

/** Lança LoaderSafetyError se a execução não for permitida. Devolve se o acesso tem que ser SOMENTE LEITURA. */
export function assertExecutionAllowed(i: SafetyInput): { readOnly: boolean } {
  const isWrite = WRITE_COMMANDS.has(i.command);
  if (!isWrite) {
    if (!i.target.isLocal && !i.flags.allowRemoteRead) {
      throw new LoaderSafetyError('REMOTE_READ_NOT_CONFIRMED', `O alvo ${i.target.label} é remoto. Para só LER, repita com --allow-remote-read (a sessão será imposta como READ ONLY).`);
    }
    return { readOnly: true };
  }
  // ---- escrita
  if (i.target.matchesKnownProduction) {
    throw new LoaderSafetyError('PRODUCTION_TARGET_REFUSED', `O alvo ${i.target.label} coincide com um banco de produção conhecido do ambiente. Escrita recusada.`);
  }
  if (!i.target.isLocal) {
    if (!REMOTE_WRITE_ENABLED) {
      throw new LoaderSafetyError('REMOTE_WRITE_DISABLED', `Escrita em banco remoto (${i.target.label}) está desligada neste carregador (Fase 8B). Use um PostgreSQL local descartável.`);
    }
  }
  if (String(i.nodeEnv || '').toLowerCase() === 'production') {
    throw new LoaderSafetyError('NODE_ENV_PRODUCTION', 'NODE_ENV=production: escrita recusada.');
  }
  if (!i.flags.expectHash || i.flags.expectHash.toLowerCase() !== i.matrixHash.toLowerCase()) {
    throw new LoaderSafetyError('MATRIX_HASH_MISMATCH', `--expect-hash ausente ou diferente do hash da matriz (${i.matrixHash}). Rode "plan" e confira o hash revisado.`);
  }
  const phrase = expectedConfirmPhrase(i.command, i.target, i.matrixVersion, i.matrixHash);
  if (i.flags.confirm !== phrase) {
    throw new LoaderSafetyError('CONFIRMATION_REQUIRED', `Confirmação explícita ausente ou incorreta. Para prosseguir, passe exatamente: --confirm "${phrase}"`);
  }
  return { readOnly: false };
}

/** Hash canônico (chaves ordenadas) das operações — liga "o que foi revisado" a "o que será aplicado". */
export function hashOperations(ops: unknown): string {
  const canon = (v: any): any => (Array.isArray(v) ? v.map(canon) : v && typeof v === 'object' ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, canon(v[k])])) : v);
  return createHash('sha256').update(JSON.stringify(canon(ops))).digest('hex');
}
