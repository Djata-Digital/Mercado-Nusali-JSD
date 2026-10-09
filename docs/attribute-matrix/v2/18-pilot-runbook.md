# 18 — Piloto de 100 operações: passo a passo (executado por VOCÊ)

> Nada daqui foi executado em produção. **Você** cria o papel e **você** roda os comandos no seu PowerShell: a senha e a URL com credenciais nunca passam pelo chat nem por arquivos. O backup e o hash abaixo já foram verificados.

**Backup:** `C:\Users\djata\Backups\mercado-nusali\mercado-nusali-full-20261009T123333.dump` — SHA-256 `8ae1a2f0592b7b024def740b596427e4506a112c5276938060b9a4dd17a946c3` (reconferido: OK). Se houver atividade na produção até o piloto, refaça o backup (`node scratch/p8d_backup.cjs`).
**Matriz:** `v2-2026-10-08`, hash `05b3b649e91bd18ea0049630f54c4c0239c09759f53ae41592d0762ee6dffbc8`, 847 operações.
**Alvo exato:** `aws-1-eu-west-3.pooler.supabase.com:6543/postgres`.

## 1. Criar o papel (no SQL Editor do Supabase)
1. Abra `docs/attribute-matrix/v2/ops/limited-role.create.sql` (ou rode `node --import tsx scripts/attribute-matrix/load.ts limited-role-sql`, que só imprime o SQL).
2. **Troque** `<<DEFINA-AQUI-UMA-SENHA-LONGA-E-ALEATORIA>>` por uma senha longa e aleatória gerada por você (gerenciador de senhas). Não a envie a ninguém.
3. Execute. O papel `attr_loader_8c3` nasce com prazo de **3 horas**, 2 conexões no máximo e permissões mínimas (INSERT/DELETE em `category_attributes`, INSERT em `audit_logs`, SELECT em 5 tabelas). Anote o horário: o piloto e o restante da carga têm que caber nesse prazo (ou crie o papel de novo depois).
4. Conferência (SQL Editor, opcional): `select rolname, rolvaliduntil from pg_roles where rolname = 'attr_loader_8c3';`

## 2. Preparar o terminal (credenciais só na memória do seu PowerShell)
```powershell
cd "C:\Users\djata\Desktop\Mercado Nusali"
$sec = Read-Host "Senha do papel attr_loader_8c3" -AsSecureString
$pw  = [System.Net.NetworkCredential]::new('', $sec).Password
$ref = "<REF-DO-PROJETO>"      # o mesmo sufixo do usuário do pooler que você já usa: postgres.<ref>
$env:ATTR_LOAD_DATABASE_URL = "postgresql://attr_loader_8c3.$ref`:$([uri]::EscapeDataString($pw))@aws-1-eu-west-3.pooler.supabase.com:6543/postgres"
$env:NODE_ENV = "test"
Remove-Variable pw, sec
$H = "05b3b649e91bd18ea0049630f54c4c0239c09759f53ae41592d0762ee6dffbc8"
$T = "aws-1-eu-west-3.pooler.supabase.com:6543/postgres"
```

## 3. Pré-voo (somente leitura, ~3 min)
```powershell
node --import tsx scripts/attribute-matrix/load.ts plan --allow-remote-read
```
Esperado: `"ok": true`, `"readOnlySession": true`, árvore `322/322` (0 faltando, 0 a mais, 0 alteradas), `operations: 847`, hash `05b3b649e91b…`, `wouldCreate: 847`, `alreadyPresent: 0`, `drift: 0`, `errors: 0`. Qualquer outra coisa: **pare** e não prossiga.

## 4. Piloto (ESCREVE em produção: só 100 linhas, em 2 lotes de 50) — rode somente com a sua autorização final
```powershell
node --import tsx scripts/attribute-matrix/load.ts apply --expect-hash $H --confirm "APLICAR v2-2026-10-08 05b3b649e91b EM $T" --allow-target $T --max-operations 100 --batch-size 50
```
O carregador (a) valida o alvo, o hash, a frase e o limite; (b) conecta como o papel e **verifica a sessão no banco** (papel exato, prazo, privilégios mínimos); (c) grava `window_opened` na auditoria (sem isso não escreve); (d) faz um dry-run, cria **no máximo 100** operações em lotes de 50, confere a contagem a cada lote e grava `batch_applied`; (e) grava `window_closed`. O diário fica em `attribute-matrix-journal\` (ignorado pelo git).
Esperado: `"ok": true`, `created: 100`, `stoppedEarly: true`, `drift: 0`, `errors: []`, `limitedWriter.role = attr_loader_8c3`.

## 5. Verificação posterior (somente leitura)
```powershell
node scratch/p8c2_monitor.cjs
node scratch/p8c2_prod_audit.cjs
node --import tsx scripts/attribute-matrix/load.ts plan --allow-remote-read
```
Esperado: `seed: 100`, `admin: 0`, `valoresDeProduto: 0`, `produtos: 0`, `lotesAuditados: 2`, `categorias: 322`, `migracoes: 38`, HTTP 200 e `erros5xx: 0`; na auditoria: `window_opened` 1 e `window_closed` 1; no `plan`: `alreadyPresent: 100`, `wouldCreate: 747`, `drift: 0`. `category_attributes` deve ter 100 linhas todas `source = 'seed'`.

## 6. Se algo sair do esperado: reverter só o piloto
```powershell
node --import tsx scripts/attribute-matrix/load.ts rollback-plan --allow-remote-read
node --import tsx scripts/attribute-matrix/load.ts rollback --expect-hash $H --confirm "REVERTER v2-2026-10-08 05b3b649e91b EM $T" --allow-target $T --max-operations 100
```
Remove só linhas `seed` nunca editadas (para na primeira editada pelo admin), no máximo 100 por execução, com auditoria. Restauração do backup é o último recurso e **não** é automática (ver `17-backup-restore-procedure.md`).

## 7. Encerrar (sempre, mesmo se o piloto falhar)
1. No SQL Editor, execute `docs/attribute-matrix/v2/ops/limited-role.revoke.sql` (derruba conexões, remove permissões e **apaga o papel**). A última consulta deve devolver `papeis_restantes = 0`.
2. No PowerShell: `Remove-Item Env:ATTR_LOAD_DATABASE_URL; Remove-Item Env:NODE_ENV`.
3. Guarde o diário (`attribute-matrix-journal\`) e as saídas dos comandos.

## 8. O que o carregador mantém (testado)
Alvo exato (`--allow-target`), hash fixo, frase de confirmação com banco, limite de operações obrigatório (1 a 847; piloto 100), lotes de 50, auditoria obrigatória (sem `window_opened` não escreve), recusa de qualquer credencial comum (a do app → `PRODUCTION_TARGET_REFUSED`; qualquer outro usuário → recusado), `NODE_ENV=production` recusado, reversão com teto e só de linhas `seed` não editadas, papel com prazo imposto pelo banco e revogável.

## 9. Depois do piloto
O restante (747) é outra autorização: mesmo comando com `--max-operations 747` (dentro do prazo do papel; senão crie o papel de novo).

## 10. Se o pré-voo falhar na autenticação (SQLSTATE 28P01) — diagnóstico e correção
Já confirmado em produção (somente leitura): o papel existe, pode logar, está dentro do prazo, tem hash SCRAM e a função de autenticação do pooler (`pgbouncer.get_auth`) o enxerga. O pooler **reconhece** o papel: para um papel inexistente ele responde `user not found in the database`, e para `attr_loader_8c3` responde `28P01 password authentication failed`. Ou seja, o usuário e o formato `attr_loader_8c3.<ref>` estão corretos e o problema é **a senha enviada diferir da armazenada**.
1. No PowerShell com `ATTR_LOAD_DATABASE_URL` definida (passo 2):
```powershell
node --import tsx scripts/attribute-matrix/diagnose-auth.ts
```
   Ele confere **localmente** (sem imprimir segredos) se a senha da URL é a armazenada, mostra o formato do usuário, o prazo do papel e a resposta de cada rota (pooler sessão 5432, pooler transação 6543, direta). A ligação direta (`db.<ref>.supabase.co`) é **só IPv6** no plano Free e não conecta nesta rede: não é alternativa.
2. Se disser **NÃO CONFERE** (o caso esperado): redefina só a senha com `docs/attribute-matrix/v2/ops/limited-role.reset-password.sql` (SQL Editor; senha de 32+ caracteres só com letras e dígitos), refaça o passo 2 digitando **essa** senha e rode o `diagnose-auth` de novo até aparecer **CONFERE** e `CONECTOU`. Se acabou de redefinir e ainda falhar, aguarde ~1 minuto (o pooler guarda em cache o segredo do papel) e repita.
3. Se disser **CONFERE** e mesmo assim falhar: envie só a linha `FALHOU — …` da rota (sem credenciais).
4. Lembrete: o papel vence às 16:20 UTC do dia da criação; se vencer, recrie-o (`limited-role.revoke.sql` e depois `limited-role.create.sql`).

## 11. Porta 6543 (pooler em modo transação) — usar ESTA porta
Para o papel `attr_loader_8c3` o pooler em sessão (5432) respondeu `28P01` mesmo com a senha conferindo, e o pooler em transação (6543) conectou. O alvo exato passa a ser `aws-1-eu-west-3.pooler.supabase.com:6543/postgres` (já ajustado nos passos 2–4; a frase de confirmação do `plan` sai com 6543). Se a sua variável ainda tem 5432:
```powershell
$env:ATTR_LOAD_DATABASE_URL = $env:ATTR_LOAD_DATABASE_URL -replace ':5432/', ':6543/'
$T = "aws-1-eu-west-3.pooler.supabase.com:6543/postgres"
node --import tsx scripts/attribute-matrix/load.ts plan --allow-remote-read
```
Compatibilidade verificada (somente leitura em produção e em PostgreSQL descartável): o carregador não usa locks de sessão, `SET` de sessão, `LISTEN`, nem prepared statements nomeados; só consultas parametrizadas não nomeadas e INSERT/DELETE avulsos. O modo transação **ignora** a opção de inicialização `default_transaction_read_only`, então os comandos de leitura agora rodam numa transação `BEGIN READ ONLY` num único cliente (o pooler mantém o mesmo backend até o fim) e o carregador recusa se o banco não confirmar `transaction_read_only = on`. O pré-voo leva ~3–4 min porque roda numa única transação.

## 12. Recriar o papel expirado (passo a passo — executado por VOCÊ)
O papel `attr_loader_8c3` vence 3 h depois de criado (o anterior venceu em 2026-10-09 16:20 UTC). Para recriar com **senha nova, sem digitá-la nem exibi-la**:
1. Abra o PowerShell na pasta do projeto e rode (use o seu `<REF-DO-PROJETO>`, o mesmo sufixo de `postgres.<ref>`):
```powershell
Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass -Force
.\docs\attribute-matrix\v2\ops\new-role-session.ps1 -Ref "<REF-DO-PROJETO>"
```
   O script gera uma senha de 40 caracteres, põe na **área de transferência** o SQL "criar ou renovar o papel" (sem DROP) já com essa senha, e define `ATTR_LOAD_DATABASE_URL` **nesta sessão** com a mesma senha, na **porta 6543**. Nada é exibido nem gravado em arquivo.
2. No Supabase, abra o **SQL Editor**, cole (Ctrl+V) e clique em **Run**. Se o editor pedir confirmação, confirme. O resultado final deve mostrar `attr_loader_8c3` com `rolcanlogin = true` e `rolvaliduntil` cerca de **3 horas à frente** (anote o horário: é o prazo para o pré-voo e o piloto).
3. Volte ao PowerShell e pressione **Enter**: a área de transferência é limpa. Se você colar o SQL em outro lugar, ele contém a senha: não salve nem compartilhe.
4. Confirme a autenticação (somente leitura):
```powershell
node --import tsx scripts/attribute-matrix/diagnose-auth.ts
```
   Esperado: `CONFERE com a senha armazenada`, `dentro do prazo` e `CONECTOU como "attr_loader_8c3"` na rota 6543.
5. Pré-voo (somente leitura, ~3–4 min):
```powershell
node --import tsx scripts/attribute-matrix/load.ts plan --allow-remote-read
```
   Esperado: `ok: true`, `readOnlySession: true`, alvo `aws-1-eu-west-3.pooler.supabase.com:6543/postgres`, árvore 322/322, `wouldCreate: 847`, `drift: 0`, hash `05b3b649e91b…`.
6. Se não for executar o piloto em seguida, **revogue** (SQL Editor: `limited-role.revoke.sql`) e feche o PowerShell. O piloto (passo 4 deste runbook) só com a sua autorização final e dentro do prazo do papel.
Privilégios, limites (2 conexões, 60 s por comando) e todas as travas do carregador são os mesmos de antes: nada foi alterado nos scripts SQL.

### 12.1 Correção do erro `42501 permission denied to drop objects`
Causa confirmada (reproduzida em PostgreSQL 17 com um administrador não superusuário, como o `postgres` do Supabase): ao criar um papel, o administrador recebe só `ADMIN OPTION` sobre ele (sem `INHERIT` nem `SET`, regra do PostgreSQL 16+). `ALTER ROLE`, `GRANT`, `REVOKE` e `DROP ROLE` funcionam com `ADMIN OPTION`, mas **`DROP OWNED BY` exige poder assumir o papel** e falha. Por isso o SQL passou a **criar ou renovar o papel sem `DROP OWNED`/`DROP ROLE`/`CASCADE`**: se o papel já existe (por exemplo expirado), só a senha, o prazo (3 h a partir de agora), o limite de 2 conexões e os privilégios exatos são refeitos (revoga tudo em `public` e concede de novo só o mínimo); se não existe, cria com todos os atributos de segurança. A revogação final (`limited-role.revoke.sql`) também não usa `DROP OWNED`: desativa o papel (sem login, prazo no passado, sem privilégios) e tenta `DROP ROLE`; se não puder remover, ele fica desativado. Os privilégios do SQL Editor não foram ampliados.

## 13. Piloto interrompido (`DRY_RUN_ERRORS`) — causa, correção e retomada
**O que aconteceu:** o `apply` parou no dry-run (`wouldCreate: 499`, `errors: 1`) porque o motor para na PRIMEIRA operação com erro (por isso 499 e não 847: a operação nº 500 falhou e o contador só reflete o que foi examinado até ali). O dry-run não escreve; o `plan` roda em outro caminho (uma transação `BEGIN READ ONLY`), por isso mostrou 847. Verificado só com leitura: 0 linhas em `category_attributes`, 0 produtos alterados e apenas a linha de auditoria `window_opened` (sem `window_closed`) — **nada do piloto foi gravado**.
**Causa registrada:** o motor guardava só o texto "Failed query: SELECT …" e descartava a causa (`error.cause`), por isso o SQLSTATE real daquela consulta não ficou registrado e não pode ser reconstituído; o teste de estresse (900 consultas na 6543) não reproduziu falha, o que aponta para queda transitória de conexão no pooler (modo transação) e não para permissão (o papel passou na validação de privilégio mínimo e a consulta falha era um simples SELECT). Para não presumir, a correção faz as duas coisas: (1) o erro agora traz **SQLSTATE e a causa real** (sem URL, senha nem parâmetros); (2) falhas **transitórias** de conexão (ECONNRESET, 57P01, 53300, "Connection terminated…") são repetidas com segurança (até 5 tentativas, espera 0,75/1,5/3/6 s). Erros de senha (28xxx), permissão (42501), SQL (42xxx) e regra (23xxx) **nunca** são repetidos.
**Segurança da repetição de escrita:** antes de repetir um INSERT, o motor confere se o anterior chegou a ser confirmado (então registra `recovered` e não duplica). O teto `--max-operations` continua exato (recuperadas contam como criadas). O pool de escrita usa 1 conexão (o papel permite 2); consultas de leitura avulsas são repetidas; a auditoria `batch_applied`/`window_*` também. Se o fechamento da janela falhar, o relatório traz `windowCloseError` (em vez de ser engolido).
**Retomar (você, no mesmo PowerShell, porta 6543):** o papel vale até o prazo anotado; se vencer, refaça a seção 12. Rode de novo o `plan` e, se `ok: true`, o MESMO `apply` do passo 4 (`--max-operations 100 --batch-size 50`). É idempotente: se algo já tiver sido gravado, é pulado. Se falhar de novo, a saída mostrará o SQLSTATE real (`causa: [XXXXX] …`) — envie só essa linha.
Testes (PostgreSQL 17 descartável): `scratch/test-attr-pilot-resilience-8c3.ts` 21/21, incluindo quedas forçadas de conexão (`pg_terminate_backend`) durante dry-run, escrita de exatamente 100 linhas e CLI do piloto completo; sem repetição de erros de permissão.
