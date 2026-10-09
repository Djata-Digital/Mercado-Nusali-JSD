/**
 * FASE 8C.3 — AUTORIZAÇÃO MÍNIMA para UMA operação administrativa de escrita remota/produção (sem bilhetes criptográficos).
 *
 * A escrita remota continua BLOQUEADA por padrão e para QUALQUER credencial comum (inclusive a do app). A única exceção é conectar com um
 * PAPEL DE BANCO DEDICADO, criado pelo responsável só para esta operação, que o próprio banco limita:
 *   - nome exato `attr_loader_8c3`; sem superusuário/criar papel/criar banco/replicação/bypass de RLS; sem herdar de outros papéis;
 *   - privilégios mínimos: INSERT e DELETE em category_attributes, INSERT em audit_logs, SELECT só nas tabelas que o carregador lê;
 *     NENHUM privilégio de escrita em produtos, pedidos, pagamentos, escrow, categorias, comissões etc.;
 *   - prazo curto imposto pelo banco (VALID UNTIL, teto de 3 h), no máximo 2 conexões, tempo máximo por comando;
 *   - revogação: DROP do papel (ver revokeSql).
 * Do lado do carregador (esta camada), além do papel: alvo exato confirmado (--allow-target), limite de operações (--max-operations),
 * hash da matriz (--expect-hash), frase de confirmação (--confirm), NODE_ENV != production, verificação da SESSÃO (papel, expiração,
 * privilégios reais lidos do catálogo) ANTES de qualquer escrita, e janela auditada (window_opened/window_closed em audit_logs).
 * Nenhuma credencial é gravada ou impressa.
 */
export const LIMITED_WRITER_ROLE = 'attr_loader_8c3';
export const LIMITED_WRITER_MAX_TTL_HOURS = 3;

/** Escritas permitidas (único conjunto). */
export const ALLOWED_WRITES: Record<string, { insert?: boolean; delete?: boolean }> = {
  'public.category_attributes': { insert: true, delete: true },
  'public.audit_logs': { insert: true },
};

/** Leituras que o carregador realmente usa (preflight, serviço de atributos, verificação e exclusão com checagem de uso). */
export const GRANTED_READS = ['categories', 'category_attributes', 'product_attribute_values', 'product_attributes', 'products'];

/** O usuário da URL pode vir como `papel.refdoprojeto` (pooler do Supabase): vale o trecho antes do primeiro ponto. */
export const urlUserMatchesLimitedRole = (urlUser: string): boolean => urlUser.split('.')[0] === LIMITED_WRITER_ROLE;

/**
 * Cria OU RENOVA o papel (idempotente, sem DROP): senha nova, login, prazo de N horas a partir de agora, limite de conexões, e os privilégios
 * EXATOS (revoga tudo em public e concede de novo só o mínimo). No Supabase o usuário `postgres` não é superusuário: ao criar o papel ele
 * recebe só ADMIN OPTION (sem herdar nem poder assumir o papel, PostgreSQL 16+), por isso `DROP OWNED BY` falha com 42501 — e não é preciso:
 * ALTER ROLE, GRANT e REVOKE funcionam com ADMIN OPTION. Os atributos de segurança (NOSUPERUSER etc.) só entram na criação — um
 * não-superusuário não pode reafirmá-los via ALTER (42501); se alguém os alterar, verifyLimitedWriterSession recusa o papel.
 */
export function createRoleSql(ttlHours = LIMITED_WRITER_MAX_TTL_HOURS): string {
  if (!(ttlHours > 0 && ttlHours <= LIMITED_WRITER_MAX_TTL_HOURS)) throw new Error(`O prazo do papel deve estar entre 0 e ${LIMITED_WRITER_MAX_TTL_HOURS} h.`);
  return `-- FASE 8C.3 — papel DEDICADO e temporário para a carga da matriz de atributos: CRIA ou RENOVA (sem DROP). Execute no SQL Editor.
-- Se o papel já existe (ex.: expirado), só a senha, o prazo e os privilégios exatos são refeitos.
-- 1) TROQUE a senha abaixo por uma senha longa e aleatória gerada por você (não a compartilhe em chat nem em arquivos).
-- 2) O prazo (VALID UNTIL) começa agora; o banco recusa novas conexões depois dele.
DO $$
DECLARE
  v_until text := (now() + interval '${ttlHours} hours')::text;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '${LIMITED_WRITER_ROLE}') THEN
    EXECUTE format(
      'CREATE ROLE ${LIMITED_WRITER_ROLE} LOGIN PASSWORD %L NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS NOINHERIT CONNECTION LIMIT 2 VALID UNTIL %L',
      '<<DEFINA-AQUI-UMA-SENHA-LONGA-E-ALEATORIA>>', v_until);
  ELSE
    EXECUTE format(
      'ALTER ROLE ${LIMITED_WRITER_ROLE} WITH LOGIN PASSWORD %L NOINHERIT CONNECTION LIMIT 2 VALID UNTIL %L',
      '<<DEFINA-AQUI-UMA-SENHA-LONGA-E-ALEATORIA>>', v_until);
  END IF;
END $$;
ALTER ROLE ${LIMITED_WRITER_ROLE} SET statement_timeout = '60s';
ALTER ROLE ${LIMITED_WRITER_ROLE} SET idle_in_transaction_session_timeout = '30s';
-- privilégios EXATOS: zera tudo em public e concede de novo só o mínimo
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM ${LIMITED_WRITER_ROLE};
REVOKE ALL ON SCHEMA public FROM ${LIMITED_WRITER_ROLE};
GRANT USAGE ON SCHEMA public TO ${LIMITED_WRITER_ROLE};
GRANT SELECT ON ${GRANTED_READS.map((t) => `public.${t}`).join(', ')} TO ${LIMITED_WRITER_ROLE};
GRANT INSERT, DELETE ON public.category_attributes TO ${LIMITED_WRITER_ROLE};
GRANT INSERT ON public.audit_logs TO ${LIMITED_WRITER_ROLE};
`;
}

/**
 * Desativa o papel ao terminar (sem DROP OWNED): derruba sessões (se houver permissão), NOLOGIN, prazo no passado, revoga tudo e tenta
 * DROP ROLE (só funciona sem objetos dependentes; se falhar, o papel permanece DESATIVADO e sem privilégios).
 */
export function revokeRoleSql(): string {
  return `-- FASE 8C.3 — REVOGAÇÃO do papel dedicado (executar ao terminar, mesmo que a operação tenha falhado). Sem DROP OWNED BY.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '${LIMITED_WRITER_ROLE}') THEN
    BEGIN
      PERFORM pg_terminate_backend(pid) FROM pg_stat_activity WHERE usename = '${LIMITED_WRITER_ROLE}';
    EXCEPTION WHEN insufficient_privilege THEN
      RAISE NOTICE 'Sem permissão para derrubar sessões abertas; elas deixam de funcionar quando o papel é desativado/removido.';
    END;
    EXECUTE 'ALTER ROLE ${LIMITED_WRITER_ROLE} NOLOGIN';
    EXECUTE 'ALTER ROLE ${LIMITED_WRITER_ROLE} VALID UNTIL ''1970-01-01''';
    EXECUTE 'REVOKE ALL ON ALL TABLES IN SCHEMA public FROM ${LIMITED_WRITER_ROLE}';
    EXECUTE 'REVOKE ALL ON SCHEMA public FROM ${LIMITED_WRITER_ROLE}';
    BEGIN
      EXECUTE 'DROP ROLE ${LIMITED_WRITER_ROLE}';
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE 'O papel ficou DESATIVADO (sem login e sem privilégios), mas não foi removido: %', SQLERRM;
    END;
  END IF;
END $$;
-- Conferência: papeis_restantes = 0 (removido) ou pode_logar = 0 (desativado)
SELECT (SELECT count(*) FROM pg_roles WHERE rolname = '${LIMITED_WRITER_ROLE}') AS papeis_restantes,
       (SELECT count(*) FROM pg_roles WHERE rolname = '${LIMITED_WRITER_ROLE}' AND rolcanlogin) AS pode_logar;
`;
}

export interface SessionClient { query(sql: string, params?: unknown[]): Promise<{ rows: any[] }> }

export interface LimitedSessionReport {
  role: string;
  validUntil: string;
  dbNow: string;
  minutesLeft: number;
  tablesChecked: number;
  allowedWrites: string[];
}

/**
 * Verifica a SESSÃO REAL já conectada (antes de qualquer escrita): papel exato, expiração dentro do teto, atributos do papel,
 * ausência de herança de outros papéis e privilégios EFETIVOS lidos do catálogo (nenhuma escrita fora de ALLOWED_WRITES).
 * Lança Error com mensagem objetiva; devolve um relatório sem dados sensíveis.
 */
export async function verifyLimitedWriterSession(c: SessionClient): Promise<LimitedSessionReport> {
  const me = (await c.query(`select current_user as u, session_user as s, now() as db_now`)).rows[0];
  if (me.u !== LIMITED_WRITER_ROLE || me.s !== LIMITED_WRITER_ROLE) throw new Error(`LIMITED_WRITER_ROLE_MISMATCH: a sessão está como "${me.u}" e a escrita remota exige exatamente "${LIMITED_WRITER_ROLE}".`);
  const r = (await c.query(`select rolsuper, rolcreaterole, rolcreatedb, rolreplication, rolbypassrls, rolvaliduntil, rolcanlogin, rolconnlimit from pg_roles where rolname = current_user`)).rows[0];
  if (!r) throw new Error('LIMITED_WRITER_ROLE_MISSING: papel não encontrado no catálogo.');
  if (r.rolsuper || r.rolcreaterole || r.rolcreatedb || r.rolreplication || r.rolbypassrls) throw new Error('LIMITED_WRITER_ROLE_TOO_POWERFUL: o papel tem atributo administrativo (superusuário, criar papel/banco, replicação ou bypass de RLS).');
  const until = r.rolvaliduntil ? new Date(r.rolvaliduntil).getTime() : NaN;
  if (!Number.isFinite(until)) throw new Error('LIMITED_WRITER_NO_EXPIRY: o papel não tem prazo de validade finito (VALID UNTIL) — recusado.');
  const left = (until - new Date(me.db_now).getTime()) / 60000;
  if (!(left > 0)) throw new Error('LIMITED_WRITER_EXPIRED: o prazo do papel já terminou.');
  if (left > LIMITED_WRITER_MAX_TTL_HOURS * 60 + 5) throw new Error(`LIMITED_WRITER_TTL_TOO_LONG: o prazo do papel excede ${LIMITED_WRITER_MAX_TTL_HOURS} h.`);
  const mem = (await c.query(`select count(*)::int n from pg_auth_members where member = (select oid from pg_roles where rolname = current_user)`)).rows[0].n;
  if (mem > 0) throw new Error('LIMITED_WRITER_INHERITS_ROLES: o papel é membro de outros papéis — recusado.');
  const dbCreate = (await c.query(`select has_database_privilege(current_user, current_database(), 'CREATE') as ok`)).rows[0].ok;
  if (dbCreate) throw new Error('LIMITED_WRITER_CAN_CREATE_IN_DATABASE: o papel pode criar objetos no banco — recusado.');
  const schemaCreate = (await c.query(`select n.nspname from pg_namespace n where n.nspname not in ('pg_catalog','information_schema') and n.nspname not like 'pg_toast%' and n.nspname not like 'pg_temp%' and has_schema_privilege(current_user, n.oid, 'CREATE')`)).rows;
  if (schemaCreate.length) throw new Error(`LIMITED_WRITER_CAN_CREATE_IN_SCHEMA: o papel pode criar objetos em: ${schemaCreate.map((x) => x.nspname).join(', ')}.`);
  const rels = (await c.query(`
    select n.nspname || '.' || c.relname as rel,
           has_table_privilege(current_user, c.oid, 'INSERT') as ins, has_table_privilege(current_user, c.oid, 'UPDATE') as upd,
           has_table_privilege(current_user, c.oid, 'DELETE') as del, has_table_privilege(current_user, c.oid, 'TRUNCATE') as trn,
           has_any_column_privilege(current_user, c.oid, 'INSERT') as cins, has_any_column_privilege(current_user, c.oid, 'UPDATE') as cupd
      from pg_class c join pg_namespace n on n.oid = c.relnamespace
     where c.relkind in ('r','p','v','m','f') and n.nspname not in ('pg_catalog','information_schema') and n.nspname not like 'pg_toast%' and n.nspname not like 'pg_temp%'`)).rows;
  const violations: string[] = [];
  const allowedSeen: string[] = [];
  for (const t of rels) {
    const allow = ALLOWED_WRITES[t.rel] ?? {};
    const bad: string[] = [];
    if (t.ins && !allow.insert) bad.push('INSERT');
    if (t.del && !allow.delete) bad.push('DELETE');
    if (t.upd || t.cupd) bad.push('UPDATE');
    if (t.trn) bad.push('TRUNCATE');
    if (t.cins && !t.ins && !allow.insert) bad.push('INSERT(coluna)');
    if (bad.length) violations.push(`${t.rel}: ${bad.join('+')}`);
    if (allow.insert && t.ins) allowedSeen.push(`${t.rel}:INSERT`);
    if (allow.delete && t.del) allowedSeen.push(`${t.rel}:DELETE`);
  }
  if (violations.length) throw new Error(`LIMITED_WRITER_EXCESS_PRIVILEGES: privilégios de escrita fora do permitido — ${violations.slice(0, 6).join('; ')}.`);
  for (const [rel, a] of Object.entries(ALLOWED_WRITES)) {
    if (a.insert && !allowedSeen.includes(`${rel}:INSERT`)) throw new Error(`LIMITED_WRITER_MISSING_PRIVILEGE: o papel não tem INSERT em ${rel}.`);
  }
  return { role: me.u, validUntil: new Date(r.rolvaliduntil).toISOString(), dbNow: new Date(me.db_now).toISOString(), minutesLeft: Math.round(left), tablesChecked: rels.length, allowedWrites: allowedSeen };
}
