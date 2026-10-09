/**
 * FASE 8B — TESTE DE MUTACAO da correcao de estoque: cada mutacao desliga UM ponto critico e o teste test-stock-conversion-8b.ts
 * TEM QUE FALHAR (mutante morto). Restaura os arquivos no fim (mesmo se interrompido). Somente banco local descartavel.
 */
const fs = require('fs');
const cp = require('child_process');
const mutations = [
  { id: 'M1 nao aposentar a linha simples na conversao', file: 'src/server/modules/catalog/variantService.ts', from: 'if (seenIds.size > 0) await InventoryService.retireProductLevelStockForVariants(', to: 'if (false) await InventoryService.retireProductLevelStockForVariants(' },
  { id: 'M2 nao baixar a linha aposentada ao cancelar reserva antiga', file: 'src/server/modules/inventory/inventoryService.ts', from: 'if (res.inventoryId) await InventoryService.settleRetiredProductLevelRow(', to: 'if (false) await InventoryService.settleRetiredProductLevelRow(' },
  { id: 'M3 checkout aceita linha sem variante', file: 'src/server/modules/orders/orderService.ts', from: 'if (activeVariantRows.length > 0) {\n            throw new Error(`VARIANT_REQUIRED', to: 'if (false) {\n            throw new Error(`VARIANT_REQUIRED' },
  { id: 'M4 carrinho unitario aceita sem variante', file: 'src/server/buyerRoutes.ts', from: 'if (activeVariantRows.length > 0) {\n      throw new CartOperationError(400, \'VARIANT_REQUIRED\'', to: 'if (false) {\n      throw new CartOperationError(400, \'VARIANT_REQUIRED\'' },
  { id: 'M5 checkout aceita variante desativada', file: 'src/server/modules/orders/orderService.ts', from: 'if (varRows[0].isActive === false) {', to: 'if (false) {' },
  { id: 'M6 ajuste de estoque sem variante em produto variavel permitido', file: 'src/server/modules/inventory/inventoryService.ts', from: 'if (activeVariants.length > 0) {\n        throw new Error(\'VARIANT_REQUIRED', to: 'if (false) {\n        throw new Error(\'VARIANT_REQUIRED' },
  { id: 'M7 leitura soma a linha simples junto com variantes', file: 'src/server/modules/catalog/catalogService.ts', from: 'sql`(${inventory.variantId} IS NULL AND NOT EXISTS', to: 'sql`(${inventory.variantId} IS NULL AND true OR NOT EXISTS' },
  { id: 'M8 aposentadoria nao e idempotente (ignora onHand<=reservado)', file: 'src/server/modules/inventory/inventoryService.ts', from: 'if (onHand <= reserved) continue;', to: 'if (false) continue;' },
];
const norm = (s) => s.replace(/\r\n/g, '\n');
const results = [];
const originals = new Map();
const restore = () => { for (const [f, c] of originals) fs.writeFileSync(f, c); };
process.on('SIGINT', () => { restore(); process.exit(130); });
try {
  for (const m of mutations) {
    const raw = fs.readFileSync(m.file, 'utf8');
    if (!originals.has(m.file)) originals.set(m.file, raw);
    const crlf = raw.includes('\r\n');
    const text = norm(raw);
    if (!text.includes(m.from)) { results.push({ m: m.id, status: 'ALVO NAO ENCONTRADO' }); continue; }
    const mutated = text.replace(m.from, m.to);
    fs.writeFileSync(m.file, crlf ? mutated.replace(/\n/g, '\r\n') : mutated);
    const db = 'p8b_mut_' + results.length;
    cp.execSync(`docker exec nusali-pg17-restore psql -U postgres -c "DROP DATABASE IF EXISTS ${db}" -c "CREATE DATABASE ${db} TEMPLATE phase3_tmpl"`, { stdio: 'ignore' });
    let out = '';
    try {
      out = cp.execSync('npx tsx scratch/test-stock-conversion-8b.ts', { env: { ...process.env, LEDGER_TEST_DATABASE_URL: `postgres://postgres:postgres@localhost:55434/${db}` }, encoding: 'utf8', maxBuffer: 1 << 28, timeout: 300000 });
    } catch (e) { out = String(e.stdout || '') + String(e.stderr || ''); }
    const line = (out.match(/=== RESULTADO: (\d+)\/(\d+)/) || [])[0];
    const failed = (out.match(/^\[FAIL\] (\S+)/gm) || []).map((x) => x.replace('[FAIL] ', ''));
    const killed = !line || /RESULTADO: (\d+)\/(\d+)/.test(line) && RegExp.$1 !== RegExp.$2;
    results.push({ m: m.id, status: killed ? 'MORTO (teste detectou)' : 'SOBREVIVEU (teste fraco!)', falhas: failed.join(' ') || (line ? '' : 'erro fatal') });
    fs.writeFileSync(m.file, originals.get(m.file));
    console.log(results[results.length - 1]);
  }
} finally { restore(); }
console.log('\n=== MUTACAO: ' + results.filter((r) => r.status.startsWith('MORTO')).length + '/' + results.length + ' mutantes mortos');
process.exit(results.every((r) => r.status.startsWith('MORTO')) ? 0 : 1);
