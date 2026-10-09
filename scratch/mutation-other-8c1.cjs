/** FASE 8C.1 — mutacao dos pontos criticos de "Outro" estruturado e do despacho com reserva antiga. PostgreSQL local descartavel. */
const fs = require('fs');
const cp = require('child_process');
const M = [
  { id: 'O1 servidor nao exige especificacao em "Outro" novo', file: 'src/utils/attributeValidator.ts', from: 'if (!opts.allowBareOther) return fail(def, \'OTHER_DETAIL_REQUIRED\'', to: 'if (false) return fail(def, \'OTHER_DETAIL_REQUIRED\'', test: 'test-attr-other-8c1' },
  { id: 'O2 especificacao nao e gravada (so a opcao)', file: 'src/server/modules/catalog/attributeValueService.ts', from: "if (v.type === 'select' && v.otherDetail) rows.push", to: "if (false) rows.push", test: 'test-attr-other-8c1' },
  { id: 'O3 ficha publica mostra "Outro" em vez da especificacao', file: 'src/server/modules/catalog/productSpecSheet.ts', from: 'const text = t.otherDetail ? String(t.otherDetail) :', to: 'const text =', test: 'test-attr-other-8c1' },
  { id: 'O4 leitura perde a especificacao (edicao apagaria ao reescrever)', file: 'src/server/modules/catalog/attributeValueService.ts', from: 'const detailRow = list.find((r) => r.optionValue == null &&', to: 'const detailRow = list.find((r) => false && r.optionValue == null &&', test: 'test-attr-other-8c1' },
  { id: 'O5 edicao aceita "Outro" novo sem especificacao', file: 'src/server/modules/catalog/productAttributeUpdateService.ts', from: 'allowBareOther: !seen.has(k)', to: 'allowBareOther: true', test: 'test-attr-other-8c1' },
  { id: 'O6 eixo de variante aceita formato composto', file: 'src/utils/attributeValidator.ts', from: "const composite = def.role === 'variant_axis' ? null : splitOtherValue", to: 'const composite = splitOtherValue', test: 'test-attr-other-8c1' },
  { id: 'O7 formulario ignora o campo complementar', file: 'src/utils/attributeFormModel.ts', from: "if (def.type !== 'select' || typeof v !== 'string' || !isOtherOption(v)) return v;", to: 'return v;', test: 'test-attr-other-8c1' },
  { id: 'O8 valor antigo "Outro" sem especificacao bloqueia edicao de outro atributo', file: 'src/server/modules/catalog/productAttributeUpdateService.ts', from: 'validateAttributeValue(def, cur.raw, { allowBareOther: true })', to: 'validateAttributeValue(def, cur.raw)', test: 'test-attr-other-8c1' },
  { id: 'D1 despacho sem trava na linha de estoque', file: 'src/server/modules/logistics/shipmentService.ts', from: ".where(eq(inventory.id, targetInventoryId)).limit(1).for('update');", to: '.where(eq(inventory.id, targetInventoryId)).limit(1);', test: 'test-stock-old-reservation-8c1' },
  { id: 'D2 cancelamento nao baixa a linha aposentada', file: 'src/server/modules/inventory/inventoryService.ts', from: 'if (res.inventoryId) await InventoryService.settleRetiredProductLevelRow(', to: 'if (false) await InventoryService.settleRetiredProductLevelRow(', test: 'test-stock-old-reservation-8c1' },
];
const only = process.argv[2];
const norm = (s) => s.replace(/\r\n/g, '\n');
const orig = new Map();
const restore = () => { for (const [f, c] of orig) fs.writeFileSync(f, c); };
process.on('SIGINT', () => { restore(); process.exit(130); });
const res = [];
try {
  for (const m of M) {
    if (only && !m.id.startsWith(only)) continue;
    const raw = fs.readFileSync(m.file, 'utf8');
    if (!orig.has(m.file)) orig.set(m.file, raw);
    const crlf = raw.includes('\r\n'); const text = norm(raw);
    if (!text.includes(m.from)) { res.push({ m: m.id, status: 'ALVO NAO ENCONTRADO' }); console.log(res[res.length - 1]); continue; }
    fs.writeFileSync(m.file, (crlf ? (t) => t.replace(/\n/g, '\r\n') : (t) => t)(text.replace(m.from, () => m.to)));
    const db = 'p8c1_mut_' + res.length;
    cp.execSync(`docker exec nusali-pg17-restore psql -U postgres -c "DROP DATABASE IF EXISTS ${db}" -c "CREATE DATABASE ${db} TEMPLATE phase3_tmpl"`, { stdio: 'ignore' });
    let out = '';
    try { out = cp.execSync(`npx tsx scratch/${m.test}.ts`, { env: { ...process.env, LEDGER_TEST_DATABASE_URL: `postgres://postgres:postgres@localhost:55434/${db}` }, encoding: 'utf8', maxBuffer: 1 << 28, timeout: 600000 }); } catch (e) { out = String(e.stdout || '') + String(e.stderr || ''); }
    const line = out.match(/=== RESULTADO: (\d+)\/(\d+)/);
    const killed = !line || line[1] !== line[2];
    res.push({ m: m.id, status: killed ? 'MORTO (teste detectou)' : 'SOBREVIVEU (teste fraco!)', falhas: (out.match(/^\[FAIL\] (\S+)/gm) || []).map((x) => x.replace('[FAIL] ', '')).join(' ') || (line ? '' : 'erro fatal') });
    fs.writeFileSync(m.file, orig.get(m.file));
    console.log(res[res.length - 1]);
  }
} finally { restore(); }
console.log('\n=== MUTACAO: ' + res.filter((r) => r.status.startsWith('MORTO')).length + '/' + res.length + ' mutantes mortos');
process.exit(res.every((r) => r.status.startsWith('MORTO')) ? 0 : 1);
