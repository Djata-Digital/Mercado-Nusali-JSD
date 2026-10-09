# 17 — Backup manual completo e restauração verificada (Supabase Free)

> O plano Free não tem backups automáticos. Este é o procedimento executado em 2026-10-09 (somente leitura na produção). Sem credenciais e sem dados pessoais neste documento.

## Resultado
| Item | Valor |
|---|---|
| Arquivo | `C:\Users\djata\Backups\mercado-nusali\mercado-nusali-full-20261009T123333.dump` (fora do Git, fora do projeto) |
| Formato / tamanho | `pg_dump -Fc` (esquema + dados), 641.899 bytes |
| SHA-256 | `8ae1a2f0592b7b024def740b596427e4506a112c5276938060b9a4dd17a946c3` (também em `….dump.sha256`) |
| Origem | PostgreSQL 17.6 (produção), 10 schemas (`public`, `drizzle`, `auth`, `storage`, `realtime`, `vault`, `extensions`, `graphql`, `graphql_public`, `pgbouncer`), 129 tabelas com dados exportados, 0 erros/avisos no `pg_dump` |
| Proteção | pasta só com o usuário atual (permissões herdadas removidas) e arquivos somente leitura |
| Restauração | `pg_restore` em PostgreSQL 17 descartável: **3 erros**, todos da extensão exclusiva do Supabase `supabase_vault` (indisponível fora do Supabase) e da tabela `vault.secrets`, que **tem 0 linhas** em produção — sem perda de dados |
| Esquema | colunas 1381 = 1381, tabelas 129 = 129, sequências 3 = 3, funções 8 = 8, gatilhos 16 = 16, constraints 494 = 494 e índices 417 = 417 (18 definições só diferem na redação de `ANY(ARRAY[…])` entre versões do PostgreSQL: mesmo conjunto de valores); 227 FKs, todas validadas |
| Migrações | 38 = 38, com o mesmo hash e data em cada uma |
| Dados | 129 tabelas, 1.359 linhas; 20 tabelas com dados: contagem **e** checksum (por tabela, independente de collation) idênticos nas 20 |
| Funcional | o `plan` do carregador sobre a cópia restaurada: 322 categorias, 847 a criar, 0 deriva, hash `05b3b649e91b…` |

## Procedimento de backup (repetível)
1. Pasta de destino fora do repositório, com permissão só do dono (`icacls <pasta> /inheritance:r` e depois `/grant "<usuário>:(OI)(CI)F"`).
2. `pg_dump` **cliente 17** (container descartável), em modo somente leitura (o `pg_dump` abre uma transação `REPEATABLE READ` que apenas lê): `pg_dump "<URL de conexão em variável de ambiente>" -Fc --no-owner --no-privileges --verbose -f <arquivo>`. A URL nunca é digitada na linha de comando nem impressa (script `scratch/p8d_backup.cjs` a lê do ambiente).
3. Copiar para a pasta protegida, gerar o SHA-256 e gravar `….sha256`; marcar os arquivos como somente leitura.
4. **Fazer uma 2ª cópia em outro local** (HD externo/nuvem **criptografada**). Uma cópia única na mesma máquina não protege contra perda do computador. Sugestão: criptografar o arquivo antes de enviar à nuvem (BitLocker/7-Zip com senha forte guardada à parte).

## Procedimento de restauração (testado)
1. Conferir a integridade: `sha256sum -c <arquivo>.sha256` (ou `Get-FileHash -Algorithm SHA256`) — deve dar OK.
2. `pg_restore --list <arquivo>` (deve listar as 129 cargas de tabela e os 10 schemas).
3. Criar um banco **vazio** em PostgreSQL 17 e restaurar: `pg_restore --no-owner --no-privileges -d <banco> <arquivo>`.
   - Fora do Supabase, esperar exatamente os erros de `supabase_vault`/`vault.secrets` (sem linhas). **Dentro de um projeto Supabase** (restaurar num projeto novo) a extensão existe e esses erros não ocorrem.
   - Restauração parcial (só atributos): `pg_restore --data-only -t category_attributes -t product_attribute_values …`.
4. Verificar com `scratch/p8d_verify_restore.cjs` (compara esquema, constraints, índices, migrações, contagens e checksum por tabela contra a produção em sessão somente leitura).
5. Para recuperar a produção: restaurar **em um projeto/banco novo**, validar e só então apontar o aplicativo (`DATABASE_URL`) para ele — nunca restaurar por cima da produção sem decisão do dono.

## Limites
- O backup é de **2026-10-09 12:33**; novos dados depois dele não estão nele. Refazer imediatamente antes do piloto se houver atividade (a produção hoje tem 0 produtos/pedidos).
- Contém dados pessoais (tabelas de autenticação): tratar como sensível; não enviar a ninguém nem commitar.
- O plano Free não tem PITR; este arquivo é o único ponto de restauração até o dono configurar backups do provedor.
- A cópia temporária do backup e dos logs de restauração permanece em `/tmp` do container descartável `nusali-pg17-restore` (a remoção foi bloqueada pela verificação de segurança): remover com `docker exec nusali-pg17-restore sh -c "rm -f /tmp/mercado-nusali-full-*.dump /tmp/toc.txt /tmp/restore.*"` ou recriar o container.
