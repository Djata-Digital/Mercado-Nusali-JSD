/**
 * FASE 8C.3 — repetição segura de operações que falham por problema TRANSITÓRIO de conexão (pooler/rede), nunca por erro lógico.
 * Leituras repetem direto; escritas só repetem DEPOIS de conferir se a gravação anterior chegou a ser confirmada (ver applyEngine).
 */
import { errorChain } from './safeError.js';

const TRANSIENT_CODES = new Set(['ECONNRESET', 'ETIMEDOUT', 'EPIPE', 'ECONNREFUSED', 'EAI_AGAIN', 'ENETUNREACH', 'EHOSTUNREACH', 'ENOTFOUND', '57P01', '57P02', '57P03', '53300', '53400']);
const TRANSIENT_MESSAGE = /connection terminated|connection timeout|timeout exceeded when trying to connect|terminating connection|server closed the connection|socket hang up|client has encountered a connection error|too many connections|connection (?:is )?closed|EDBCONNECTION|ECONNRESET|read ETIMEDOUT/i;

/** true quando QUALQUER elo da cadeia de causas indica queda/limite de conexão. Autenticação (28xxx), permissão (42501) e erros de SQL/regra nunca são transitórios. */
export function isTransient(e: unknown): boolean {
  for (const link of errorChain(e)) {
    const code = link.code ?? '';
    if (code.startsWith('28') || code === '42501' || code.startsWith('42') || code.startsWith('23')) return false;
    if (TRANSIENT_CODES.has(code) || code.startsWith('08')) return true;
    if (TRANSIENT_MESSAGE.test(link.message)) return true;
  }
  return false;
}

export const defaultSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
export const backoffMs = (attempt: number) => Math.min(8000, 750 * 2 ** (attempt - 1)); // 750, 1500, 3000, 6000...
export const MAX_ATTEMPTS = 5;

export interface RetryHooks { sleep?: (ms: number) => Promise<void>; attempts?: number; onRetry?: (attempt: number, e: unknown) => void | Promise<void> }

/** Repete `fn` só para erros transitórios (idempotente por contrato: leituras). Lança o último erro se esgotar. */
export async function withRetry<T>(fn: () => Promise<T>, hooks: RetryHooks = {}): Promise<T> {
  const attempts = hooks.attempts ?? MAX_ATTEMPTS;
  const sleep = hooks.sleep ?? defaultSleep;
  for (let a = 1; ; a++) {
    try {
      return await fn();
    } catch (e) {
      if (!isTransient(e) || a >= attempts) throw e;
      if (hooks.onRetry) await hooks.onRetry(a, e);
      await sleep(backoffMs(a));
    }
  }
}
