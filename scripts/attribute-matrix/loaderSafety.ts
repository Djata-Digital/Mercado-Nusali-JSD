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
import { urlUserMatchesLimitedRole } from './limitedWriter.js';

/** Interruptor mestre. Nesta fase é e permanece false. Só uma fase futura, autorizada, muda isto no código. */
export const REMOTE_WRITE_ENABLED = false;

export type CommandName = 'plan' | 'verify' | 'apply' | 'rollback-plan' | 'rollback';
export const WRITE_COMMANDS: ReadonlySet<CommandName> = new Set<CommandName>(['apply', 'rollback']);

export interface TargetInfo {
  /** Usuário da URL (nunca impresso; usado só para reconhecer o papel dedicado). */
  user: string;
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

function parseDbUrl(raw: string): { user: string; host: string; port: string; database: string } | null {
  try {
    const u = new URL(raw);
    if (!/^postgres(ql)?:$/.test(u.protocol)) return null;
    return { user: decodeURIComponent(u.username || ''), host: u.hostname, port: u.port || '5432', database: decodeURIComponent(u.pathname.replace(/^\//, '')) || 'postgres' };
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
  // ATTR_LOAD_FORCE_REMOTE_RULES=1 só AUMENTA o rigor (trata um alvo local com as regras de remoto/produção); usado nos testes.
  const local = isLocalHost(p.host) && env.ATTR_LOAD_FORCE_REMOTE_RULES !== '1';
  const known = knownProductionTargets(env);
  // mesmo host (e banco) de uma URL "de produção" do ambiente; para host remoto basta o host (pooler/direct do mesmo projeto)
  const matches = known.some((k) => (local ? false : k.host === p.host.toLowerCase()) || (k.host === p.host.toLowerCase() && k.database === p.database));
  return { user: p.user, host: p.host, port: p.port, database: p.database, isLocal: local, matchesKnownProduction: matches, label: `${p.host}:${p.port}/${p.database}` };
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
  flags: { allowRemoteRead?: boolean; expectHash?: string; confirm?: string; allowTarget?: string; maxOperations?: number };
  matrixVersion: string;
  matrixHash: string;
  /** Total de operações da matriz compilada (teto de --max-operations). */
  operationsTotal?: number;
}

export function expectedConfirmPhrase(command: CommandName, target: TargetInfo, matrixVersion: string, matrixHash: string): string {
  const verb = command === 'rollback' ? 'REVERTER' : 'APLICAR';
  return `${verb} ${matrixVersion} ${matrixHash.slice(0, 12)} EM ${target.host}:${target.port}/${target.database}`;
}

/** Lança LoaderSafetyError se a execução não for permitida. Devolve se o acesso tem que ser SOMENTE LEITURA. */
export function assertExecutionAllowed(i: SafetyInput): { readOnly: boolean; limitedWriter?: boolean } {
  const isWrite = WRITE_COMMANDS.has(i.command);
  if (!isWrite) {
    if (!i.target.isLocal && !i.flags.allowRemoteRead) {
      throw new LoaderSafetyError('REMOTE_READ_NOT_CONFIRMED', `O alvo ${i.target.label} é remoto. Para só LER, repita com --allow-remote-read (a sessão será imposta como READ ONLY).`);
    }
    return { readOnly: true };
  }
  // ---- escrita
  // Alvo remoto OU igual a um banco de produção conhecido: BLOQUEADO para qualquer credencial comum (inclusive a do app). A única exceção
  // (8C.3) é conectar com o papel dedicado de privilégios mínimos e prazo curto (limitedWriter.ts), com o alvo exato confirmado e um
  // limite de operações; o carregador ainda verifica a SESSÃO no banco antes de qualquer escrita. REMOTE_WRITE_ENABLED segue false.
  let limitedWriter = false;
  if (i.target.matchesKnownProduction || !i.target.isLocal) {
    if (!urlUserMatchesLimitedRole(i.target.user)) {
      if (i.target.matchesKnownProduction) {
        throw new LoaderSafetyError('PRODUCTION_TARGET_REFUSED', `O alvo ${i.target.label} coincide com um banco de produção conhecido do ambiente. Escrita recusada.`);
      }
      throw new LoaderSafetyError('REMOTE_WRITE_DISABLED', `Escrita em banco remoto (${i.target.label}) está desligada neste carregador (Fase 8B). Use um PostgreSQL local descartável.`);
    }
    if (i.flags.allowTarget !== i.target.label) {
      throw new LoaderSafetyError('LIMITED_WRITER_TARGET_NOT_CONFIRMED', `Confirme o banco de destino exato com --allow-target "${i.target.label}".`);
    }
    const max = i.flags.maxOperations;
    if (!Number.isInteger(max) || (max as number) < 1 || (max as number) > (i.operationsTotal ?? 0)) {
      throw new LoaderSafetyError('MAX_OPERATIONS_REQUIRED', `Informe --max-operations N (inteiro de 1 a ${i.operationsTotal ?? 0}): o limite de operações desta execução.`);
    }
    limitedWriter = true;
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
  return { readOnly: false, limitedWriter };
}

/** Hash canônico (chaves ordenadas) das operações — liga "o que foi revisado" a "o que será aplicado". */
export function hashOperations(ops: unknown): string {
  const canon = (v: any): any => (Array.isArray(v) ? v.map(canon) : v && typeof v === 'object' ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, canon(v[k])])) : v);
  return createHash('sha256').update(JSON.stringify(canon(ops))).digest('hex');
}
