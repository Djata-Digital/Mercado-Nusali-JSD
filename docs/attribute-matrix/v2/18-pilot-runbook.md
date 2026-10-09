# 18 — Piloto de 100 operações: passo a passo (executado por VOCÊ)

> Nada daqui foi executado em produção. **Você** cria o papel e **você** roda os comandos no seu PowerShell: a senha e a URL com credenciais nunca passam pelo chat nem por arquivos. O backup e o hash abaixo já foram verificados.

**Backup:** `C:\Users\djata\Backups\mercado-nusali\mercado-nusali-full-20261009T123333.dump` — SHA-256 `8ae1a2f0592b7b024def740b596427e4506a112c5276938060b9a4dd17a946c3` (reconferido: OK). Se houver atividade na produção até o piloto, refaça o backup (`node scratch/p8d_backup.cjs`).
**Matriz:** `v2-2026-10-08`, hash `05b3b649e91bd18ea0049630f54c4c0239c09759f53ae41592d0762ee6dffbc8`, 847 operações.
**Alvo exato:** `aws-1-eu-west-3.pooler.supabase.com:5432/postgres`.

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
$env:ATTR_LOAD_DATABASE_URL = "postgresql://attr_loader_8c3.$ref`:$([uri]::EscapeDataString($pw))@aws-1-eu-west-3.pooler.supabase.com:5432/postgres"
$env:NODE_ENV = "test"
Remove-Variable pw, sec
$H = "05b3b649e91bd18ea0049630f54c4c0239c09759f53ae41592d0762ee6dffbc8"
$T = "aws-1-eu-west-3.pooler.supabase.com:5432/postgres"
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
