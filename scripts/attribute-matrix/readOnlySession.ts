/**
 * FASE 8C.3 — sessão SOMENTE LEITURA imposta pelo banco, compatível com poolers em modo TRANSAÇÃO (Supabase, porta 6543).
 *
 * Por que não usar a opção de inicialização `-c default_transaction_read_only=on`: o pooler em modo transação (verificado em produção,
 * somente leitura) IGNORA parâmetros de inicialização — `show default_transaction_read_only` volta `off` — e o relatório diria
 * "somente leitura" sem que o banco a impusesse. A garantia correta é uma transação explícita `BEGIN READ ONLY` num único cliente:
 * o pooler mantém a mesma conexão de banco até o COMMIT/ROLLBACK (verificado: 1 backend em 15 consultas) e o modo vale até lá.
 * A função confere `transaction_read_only = on` antes de devolver o cliente; se não estiver, recusa.
 */
export interface ReadOnlyClient {
  query(sql: string): Promise<{ rows: any[] }>;
  release(err?: Error | boolean): void;
}
export interface ClientSource { connect(): Promise<ReadOnlyClient> }

export async function beginReadOnly(source: ClientSource): Promise<ReadOnlyClient> {
  const client = await source.connect();
  try {
    await client.query('BEGIN READ ONLY');
    const mode = (await client.query('SHOW transaction_read_only')).rows[0]?.transaction_read_only;
    if (mode !== 'on') throw new Error(`READ_ONLY_NOT_ENFORCED: o banco não confirmou a transação somente leitura (transaction_read_only=${String(mode)}).`);
    return client;
  } catch (e) {
    try { await client.query('ROLLBACK'); } catch { /* a conexão pode estar quebrada */ }
    client.release(true);
    throw e;
  }
}

/** Encerra a sessão somente leitura (ROLLBACK, nada a gravar) e devolve o cliente ao pool. */
export async function endReadOnly(client: ReadOnlyClient | null | undefined): Promise<void> {
  if (!client) return;
  try { await client.query('ROLLBACK'); } catch { /* ignora: a conexão será descartada */ }
  client.release();
}
