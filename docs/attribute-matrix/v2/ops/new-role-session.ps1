<#
  FASE 8C.3 — prepara a RECRIAÇÃO do papel temporário attr_loader_8c3 SEM digitar nem mostrar a senha.

  O que este script faz (nada é enviado ao Supabase por ele):
    1. gera uma senha forte (40 caracteres alfanuméricos, aleatória, só na memória);
    2. monta o SQL "revogar o papel antigo + criar o novo" com essa senha e o coloca na ÁREA DE TRANSFERÊNCIA (nada é gravado em arquivo);
    3. define ATTR_LOAD_DATABASE_URL nesta sessão do PowerShell (porta 6543) com a MESMA senha — assim não há diferença de digitação;
    4. espera você colar e executar o SQL no SQL Editor do Supabase e então limpa a área de transferência.
  A senha nunca é impressa, registrada em log nem salva em arquivo.

  Uso (no PowerShell, na pasta do projeto):
    Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass -Force
    .\docs\attribute-matrix\v2\ops\new-role-session.ps1 -Ref "<REF-DO-PROJETO>"
#>
param(
  [Parameter(Mandatory = $true)][string]$Ref,
  [string]$PoolerHost = 'aws-1-eu-west-3.pooler.supabase.com',
  [int]$Port = 6543,
  [string]$Database = 'postgres',
  [switch]$NoRefSuffix,   # só para ensaios locais (sem pooler)
  [switch]$NoPrompt       # só para ensaios automatizados
)
$ErrorActionPreference = 'Stop'
$role = 'attr_loader_8c3'
$ops = $PSScriptRoot

# 1) senha forte (sem caracteres ambíguos nem especiais: evita problemas de aspas no SQL, no PowerShell e na URL)
$alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789'
$rng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
$chars = New-Object System.Collections.Generic.List[char]
$buf = New-Object byte[] 1
while ($chars.Count -lt 40) {
  $rng.GetBytes($buf)
  if ($buf[0] -lt 224) { $chars.Add($alphabet[$buf[0] % $alphabet.Length]) }   # 224 = 4 x 56: sem viés
}
$pw = -join $chars

# 2) SQL = revogar (idempotente) + criar com a senha + conferência do prazo
$revoke = Get-Content (Join-Path $ops 'limited-role.revoke.sql') -Raw -Encoding UTF8
$create = Get-Content (Join-Path $ops 'limited-role.create.sql') -Raw -Encoding UTF8
$marker = '<<DEFINA-AQUI-UMA-SENHA-LONGA-E-ALEATORIA>>'
if (-not $create.Contains($marker)) { throw 'limited-role.create.sql sem o marcador de senha esperado.' }
$check = "`r`n-- Conferência: o papel deve existir, poder logar e vencer em ~3 horas`r`nSELECT rolname, rolcanlogin, rolvaliduntil, rolconnlimit FROM pg_roles WHERE rolname = '$role';`r`n"
$sql = $revoke + "`r`n" + $create.Replace($marker, $pw) + $check
Set-Clipboard -Value $sql

# 3) URL do carregador nesta sessão (porta do pooler em modo transação)
$user = if ($NoRefSuffix) { $role } else { "$role.$Ref" }
$env:ATTR_LOAD_DATABASE_URL = "postgresql://${user}:${pw}@${PoolerHost}:${Port}/${Database}"
if (-not $env:NODE_ENV -or $env:NODE_ENV -eq 'production') { $env:NODE_ENV = 'test' }
$sql = $null; $pw = $null; $chars = $null; $buf = $null   # a senha fica apenas na variável de ambiente desta sessão

Write-Host ''
Write-Host 'PRONTO — a senha NÃO foi exibida.' -ForegroundColor Green
Write-Host "  Alvo configurado: ${PoolerHost}:${Port}/${Database} (usuário ${role}$(if (-not $NoRefSuffix) { '.<ref>' }))"
Write-Host '  1) Abra o SQL Editor do Supabase, cole (Ctrl+V) e clique em Run. Se pedir confirmação de operação destrutiva (DROP), confirme.'
Write-Host '  2) A última linha do resultado deve mostrar o papel com rolcanlogin = true e rolvaliduntil ~3 horas à frente (anote o horário).'
if (-not $NoPrompt) {
  [void](Read-Host '  3) Depois de executar no Supabase, volte aqui e pressione Enter para LIMPAR a área de transferência')
  Set-Clipboard -Value ' '
  Write-Host '  Área de transferência limpa.' -ForegroundColor Green
}
Write-Host '  Próximos passos (neste mesmo PowerShell):'
Write-Host '    node --import tsx scripts/attribute-matrix/diagnose-auth.ts          # deve dar "CONFERE" e "CONECTOU"'
Write-Host '    node --import tsx scripts/attribute-matrix/load.ts plan --allow-remote-read'
