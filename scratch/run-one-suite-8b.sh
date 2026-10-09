#!/bin/bash
# FASE 8B — roda UMA suite em banco novo (PG17 descartavel) e imprime as ultimas linhas + contagem de PASS/FAIL. Nunca producao.
cd "$(dirname "$0")/.."
s="$1"; db="p8b_one_$$"
docker exec nusali-pg17-restore psql -U postgres -c "DROP DATABASE IF EXISTS $db" -c "CREATE DATABASE $db TEMPLATE phase3_tmpl" >/dev/null 2>&1
out=$(LEDGER_TEST_DATABASE_URL=postgres://postgres:postgres@localhost:55434/$db timeout 600 npx tsx scratch/$s.ts 2>&1 | tr -d '\r')
echo "== $s"
echo "$out" | grep -aEc "^\[?PASS|✅|\bPASS\b" | sed 's/^/PASS-lines: /'
echo "$out" | grep -aEc "^\[?FAIL|❌|\bFAIL\b" | sed 's/^/FAIL-lines: /'
echo "$out" | grep -aE "FAIL|❌|FATAL|ERRO|passaram|RESULTADO|Error" | tail -${2:-6} | cut -c1-260
docker exec nusali-pg17-restore psql -U postgres -c "DROP DATABASE IF EXISTS $db" >/dev/null 2>&1
