#!/bin/bash
# FASE 8B — roda as suites de regressao relevantes, cada uma em um banco NOVO clonado do modelo (PG17 descartavel). Nunca producao.
cd "$(dirname "$0")/.."
OUT="${1:-scratch/_suites_8b.log}"
: > "$OUT"
SUITES="test-attr-phase3 test-attr-phase3-checkout test-attr-phase6 test-attr-phase7 test-attr-phase7-checkout test-cart-race-condition test-checkout-quantity-price-condition test-checkout-order-mode test-d18c212-add-to-cart-400 test-d18c73h-expiration-job-safety test-fase-b-multi-seller-checkout test-m1-d1-checkout-contract test-m1-d15c4-cancel-inventory-location test-m1-d16a2-variant-writer test-m1-d16c2-1-close-alt-cart-entries test-m1-d16c2-live-variant-stock test-m1-d16d2-multi-variant-cart test-m1-d16e5-1-variant-identity test-m1-d16e5-source-inventory-transfer test-m1-d16e6-1-transfer-state-machine test-m1-d16e6-2-consolidated-stock-summary test-m1-d16f5-fulfillment-reservation test-m1-d16f62-smart-fulfillment-checkout test-m1-d16h2-cart-backend test-m1-d18c52-pending-payment-expiration test-m1-d2-checkout-routing test-c5-2-d4-reservation-submission test-stock-conversion-8a test-stock-conversion-8b test-attr-matrix-8a"
i=0
for s in $SUITES; do
  i=$((i+1)); db="p8b_s${i}"
  docker exec nusali-pg17-restore psql -U postgres -c "DROP DATABASE IF EXISTS $db" -c "CREATE DATABASE $db TEMPLATE phase3_tmpl" >/dev/null 2>&1
  res=$(LEDGER_TEST_DATABASE_URL=postgres://postgres:postgres@localhost:55434/$db timeout 600 npx tsx scratch/$s.ts 2>&1 | tr -d '\r' | grep -aE "RESULTADO|RESULT|PASS(ED)?[: ]+[0-9]|[0-9]+ ?/ ?[0-9]+|ERRO FATAL|FATAL" | tail -2 | tr '\n' ' ')
  echo "$s :: $res" | tee -a "$OUT"
  docker exec nusali-pg17-restore psql -U postgres -c "DROP DATABASE IF EXISTS $db" >/dev/null 2>&1
done
echo "FIM" | tee -a "$OUT"
