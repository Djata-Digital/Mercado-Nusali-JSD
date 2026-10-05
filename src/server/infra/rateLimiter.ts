import crypto from 'node:crypto';
import { Request, Response, NextFunction } from 'express';
import { getRedisClient } from '../../db/redis.js';

interface RateLimitConfig {
  windowMs: number; // e.g. 60000 (1 minute)
  maxRequests: number; // e.g. 30 requests per window
  message?: string;
  keyPrefix?: string;
  /**
   * Chave de contagem alternativa ao IP (ex.: e-mail da conta). Retornar `null` ignora o limitador
   * para esta requisição (ex.: corpo sem e-mail válido — a validação da rota responde 400).
   */
  keyGenerator?: (req: Request) => string | null;
}

const memoryRateLimit = new Map<string, { count: number; resetAt: number }>();

// As chaves podem ser controladas por quem chama (ex.: e-mails aleatórios): sem teto, o limitador em
// memória (usado quando o Redis está indisponível) cresceria sem limite.
const MEMORY_MAX_ENTRIES = 50_000;
const MEMORY_SWEEP_INTERVAL_MS = 60_000;

function sweepMemory(now: number): void {
  for (const [key, record] of memoryRateLimit) {
    if (now > record.resetAt) memoryRateLimit.delete(key);
  }
  // Ainda acima do teto (rajada dentro das janelas): descarta as mais antigas (ordem de inserção do Map).
  if (memoryRateLimit.size > MEMORY_MAX_ENTRIES) {
    let excess = memoryRateLimit.size - MEMORY_MAX_ENTRIES;
    for (const key of memoryRateLimit.keys()) {
      if (excess-- <= 0) break;
      memoryRateLimit.delete(key);
    }
  }
}

const sweepTimer = setInterval(() => sweepMemory(Date.now()), MEMORY_SWEEP_INTERVAL_MS);
sweepTimer.unref();

/**
 * Incrementa o contador de `key` na janela e devolve o valor atual. Redis quando pronto; qualquer falha
 * do Redis (ou Redis indisponível) cai para o contador em memória do processo.
 */
async function incrementCounter(key: string, windowMs: number): Promise<number> {
  const client = getRedisClient();
  if (client && client.status === 'ready') {
    try {
      const current = await client.incr(key);
      if (current === 1) {
        await client.pexpire(key, windowMs);
      }
      return current;
    } catch (err) {
      // Fallback to memory limiter if redis call fails
    }
  }

  const now = Date.now();
  const record = memoryRateLimit.get(key);
  if (!record || now > record.resetAt) {
    if (memoryRateLimit.size >= MEMORY_MAX_ENTRIES) sweepMemory(now);
    memoryRateLimit.set(key, { count: 1, resetAt: now + windowMs });
    return 1;
  }
  record.count += 1;
  return record.count;
}

/**
 * Contador reutilizável pela camada de serviço (limites por conta). `allowed` = ainda dentro do limite.
 * Quem chama decide o que fazer ao exceder (429, resposta genérica silenciosa, invalidar um código...).
 */
export async function consumeRateLimit(key: string, windowMs: number, max: number): Promise<{ allowed: boolean; count: number }> {
  const count = await incrementCounter(key, windowMs);
  return { allowed: count <= max, count };
}

/** Lê o contador atual de `key` SEM incrementar (0 se não existe/expirou). */
export async function getRateLimitCount(key: string): Promise<number> {
  const client = getRedisClient();
  if (client && client.status === 'ready') {
    try {
      const raw = await client.get(key);
      const n = Number(raw);
      return Number.isFinite(n) && n > 0 ? n : 0;
    } catch (err) {
      // cai para a memória
    }
  }
  const record = memoryRateLimit.get(key);
  return record && Date.now() <= record.resetAt ? record.count : 0;
}

/** Zera um contador (ex.: depois de um acerto, ou quando um novo código é emitido). */
export async function resetRateLimitCounter(key: string): Promise<void> {
  memoryRateLimit.delete(key);
  const client = getRedisClient();
  if (client && client.status === 'ready') {
    try {
      await client.del(key);
    } catch (err) {
      // Sem Redis o contador em memória (já removido) é a única cópia.
    }
  }
}

/** Parte de chave por conta: SHA-256 do valor normalizado — e-mail nunca aparece em chave do Redis. */
export function rateLimitAccountKey(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const normalized = value.trim().toLowerCase();
  if (!normalized || normalized.length > 320) return null;
  return crypto.createHash('sha256').update(normalized).digest('hex').slice(0, 32);
}

/** Só para testes: limpa o contador em memória. */
export function __resetRateLimitMemoryForTests(): void {
  memoryRateLimit.clear();
}

/** Só para testes: quantidade de chaves no contador em memória. */
export function __rateLimitMemorySizeForTests(): number {
  return memoryRateLimit.size;
}

export function createRateLimiter(config: RateLimitConfig) {
  const { windowMs, maxRequests, message = 'Muitas requisições. Por favor, tente novamente mais tarde.', keyPrefix = 'rl:', keyGenerator } = config;

  return async (req: Request, res: Response, next: NextFunction) => {
    let identity: string | null;
    if (keyGenerator) {
      identity = keyGenerator(req);
      if (identity === null) return next();
    } else {
      identity = req.ip || req.socket.remoteAddress || '127.0.0.1';
    }
    const key = `${keyPrefix}${identity}`;

    const current = await incrementCounter(key, windowMs);

    res.setHeader('X-RateLimit-Limit', maxRequests);
    res.setHeader('X-RateLimit-Remaining', Math.max(0, maxRequests - current));

    if (current > maxRequests) {
      return res.status(429).json({
        success: false,
        error: {
          code: 'RATE_LIMIT_EXCEEDED',
          message,
        },
      });
    }

    return next();
  };
}
