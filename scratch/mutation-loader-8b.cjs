/**
 * FASE 8B — TESTE DE MUTACAO do carregador e da origem: cada mutacao desliga UM ponto critico de seguranca; o teste correspondente
 * TEM QUE FALHAR (mutante morto). Restaura os arquivos no fim. Somente PostgreSQL local descartavel.
 */
const fs = require('fs');
const cp = require('child_process');
const mutations = [
  { id: 'L1 escrita remota habilitada', file: 'scripts/attribute-matrix/loaderSafety.ts', from: 'export const REMOTE_WRITE_ENABLED = false;', to: 'export const REMOTE_WRITE_ENABLED = true;', test: 'loader' },
  { id: 'L2 alvo igual a producao nao e reconhecido', file: 'scripts/attribute-matrix/loaderSafety.ts', from: "if (i.target.matchesKnownProduction) {", to: 'if (false) {', test: 'loader' },
  { id: 'L3 confirmacao digitada nao exigida', file: 'scripts/attribute-matrix/loaderSafety.ts', from: 'if (i.flags.confirm !== phrase) {', to: 'if (false) {', test: 'loader' },
  { id: 'L4 hash da matriz nao exigido', file: 'scripts/attribute-matrix/loaderSafety.ts', from: 'if (!i.flags.expectHash || i.flags.expectHash.toLowerCase() !== i.matrixHash.toLowerCase()) {', to: 'if (false) {', test: 'loader' },
  { id: 'L5 reversao apaga linha editada pelo admin / nao seed', file: 'scripts/attribute-matrix/applyEngine.ts', from: "if (row.source !== 'seed' || row.adminModifiedAt) {", to: 'if (false) {', test: 'loader' },
  { id: 'L6 deriva por edicao posterior do admin nao detectada', file: 'scripts/attribute-matrix/applyEngine.ts', from: 'if (row.adminModifiedAt) d.push(', to: 'if (false) d.push(', test: 'loader' },
  { id: 'L7 carga grava source=admin', file: 'scripts/attribute-matrix/applyEngine.ts', from: "await createAttribute(db, op.categoryId, op.payload as Record<string, any>, { source: 'seed' });", to: 'await createAttribute(db, op.categoryId, op.payload as Record<string, any>);', test: 'loader' },
  { id: 'S1 origem lida do corpo da requisicao', file: 'src/server/modules/catalog/attributeDefinitionService.ts', from: "source: opts.source === 'seed' ? 'seed' : 'admin',", to: "source: (opts.source === 'seed' || raw.source === 'seed') ? 'seed' : 'admin',", test: 'source' },
  { id: 'S2 verificacao de arvore de categorias desligada', file: 'scripts/attribute-matrix/load.ts', from: 'if (missingInDb.length || extraInDb.length || changed.length) {', to: 'if (false) {', test: 'loader' },
];
const only = process.argv[2];
const norm = (s) => s.replace(/\r\n/g, '\n');
const originals = new Map();
const restore = () => { for (const [f, c] of originals) fs.writeFileSync(f, c); };
process.on('SIGINT', () => { restore(); process.exit(130); });
const results = [];
try {
  for (const m of mutations) {
    if (only && !m.id.startsWith(only)) continue;
    const raw = fs.readFileSync(m.file, 'utf8');
    if (!originals.has(m.file)) originals.set(m.file, raw);
    const crlf = raw.includes('\r\n');
    const text = norm(raw);
    if (!text.includes(m.from)) { results.push({ m: m.id, status: 'ALVO NAO ENCONTRADO' }); console.log(results[results.length - 1]); continue; }
    const mutated = text.replace(m.from, () => m.to);
    fs.writeFileSync(m.file, crlf ? mutated.replace(/\n/g, '\r\n') : mutated);
    let out = '';
    try {
      if (m.test === 'source') {
        const db = 'p8b_mutsrc';
        cp.execSync(`docker exec nusali-pg17-restore psql -U postgres -c "DROP DATABASE IF EXISTS ${db}" -c "CREATE DATABASE ${db} TEMPLATE phase3_tmpl"`, { stdio: 'ignore' });
        out = cp.execSync('npx tsx scratch/test-attr-source-8b.ts', { env: { ...process.env, LEDGER_TEST_DATABASE_URL: `postgres://postgres:postgres@localhost:55434/${db}` }, encoding: 'utf8', maxBuffer: 1 << 28, timeout: 300000 });
      } else {
        out = cp.execSync('npx tsx scratch/test-attr-loader-8b.ts', { env: process.env, encoding: 'utf8', maxBuffer: 1 << 28, timeout: 900000 });
      }
    } catch (e) { out = String(e.stdout || '') + String(e.stderr || ''); }
    const line = (out.match(/=== RESULTADO: (\d+)\/(\d+)/) || []);
    const killed = !line[0] || line[1] !== line[2];
    const failed = (out.match(/^\[FAIL\] (\S+)/gm) || []).map((x) => x.replace('[FAIL] ', ''));
    results.push({ m: m.id, status: killed ? 'MORTO (teste detectou)' : 'SOBREVIVEU (teste fraco!)', falhas: failed.join(' ') || (line[0] ? '' : 'erro fatal') });
    fs.writeFileSync(m.file, originals.get(m.file));
    console.log(results[results.length - 1]);
  }
} finally { restore(); }
console.log('\n=== MUTACAO: ' + results.filter((r) => r.status.startsWith('MORTO')).length + '/' + results.length + ' mutantes mortos');
process.exit(results.every((r) => r.status.startsWith('MORTO')) ? 0 : 1);
