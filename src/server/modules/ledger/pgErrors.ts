/**
 * Leitura de erros do PostgreSQL que chegam encapsulados.
 *
 * O drizzle-orm (>= 0.4x) embrulha o erro do driver `pg` em `DrizzleQueryError`: o SQLSTATE (`code`) e o nome da constraint ficam em `err.cause`,
 * não em `err`. Quem testava só `err.code` nunca reconhecia uma violação de unicidade. Funções PURAS (sem I/O).
 */
export interface PgErrorInfo {
  code: string;
  constraint?: string;
  table?: string;
}

const SQLSTATE = /^[0-9A-Z]{5}$/;

/** Primeiro erro da cadeia (err, err.cause, err.cause.cause…; no máximo 5 níveis) que tenha um SQLSTATE válido. */
export function findPgError(err: unknown): PgErrorInfo | null {
  let cur: any = err;
  for (let depth = 0; depth < 5 && cur && typeof cur === 'object'; depth++) {
    if (typeof cur.code === 'string' && SQLSTATE.test(cur.code)) {
      return {
        code: cur.code,
        constraint: typeof cur.constraint === 'string' ? cur.constraint : undefined,
        table: typeof cur.table === 'string' ? cur.table : undefined,
      };
    }
    cur = cur.cause;
  }
  return null;
}

/**
 * Verdadeiro SOMENTE para violação de unicidade (23505) da constraint/índice com exatamente este nome. Qualquer outro erro — outra constraint, outro
 * SQLSTATE (deadlock, conexão, tabela inexistente…), erro sem SQLSTATE — devolve falso e tem de ser propagado por quem chama.
 */
export function isUniqueViolationOf(err: unknown, constraintName: string): boolean {
  const info = findPgError(err);
  return !!info && info.code === '23505' && info.constraint === constraintName;
}
