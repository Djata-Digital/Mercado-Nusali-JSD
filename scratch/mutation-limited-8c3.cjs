/**
 * FASE 8C.3 — TESTE DE MUTACAO da integracao com o papel dedicado: cada mutacao DESLIGA um ponto de seguranca; o teste correspondente
 * TEM QUE FALHAR (mutante morto). Restaura os arquivos no fim. Somente PostgreSQL local descartavel.
 */
const fs = require('fs');
const cp = require('child_process');
const LS = 'scripts/attribute-matrix/loaderSafety.ts', LD = 'scripts/attribute-matrix/load.ts', AE = 'scripts/attribute-matrix/applyEngine.ts', LW = 'scripts/attribute-matrix/limitedWriter.ts';
const INT = 'scratch/test-attr-limited-integration-8c3.ts', ROLE = 'scratch/test-attr-limited-role-8c3.ts';
const M = [
  { id: 'M1 qualquer usuario passa pelo portao de escrita remota/producao', file: LS, from: 'if (!urlUserMatchesLimitedRole(i.target.user)) {', to: 'if (false) {', test: INT, stop: 'refusals' },
  { id: 'M2 alvo exato nao e exigido (--allow-target)', file: LS, from: 'if (i.flags.allowTarget !== i.target.label) {', to: 'if (false) {', test: INT, stop: 'refusals' },
  { id: 'M3 limite de operacoes nao e exigido', file: LS, from: 'if (!Number.isInteger(max) || (max as number) < 1 || (max as number) > (i.operationsTotal ?? 0)) {', to: 'if (false) {', test: INT, stop: 'refusals' },
  { id: 'M4 hash da matriz nao e exigido', file: LS, from: 'if (!i.flags.expectHash || i.flags.expectHash.toLowerCase() !== i.matrixHash.toLowerCase()) {', to: 'if (false) {', test: INT, stop: 'refusals' },
  { id: 'M5 confirmacao digitada nao e exigida', file: LS, from: 'if (i.flags.confirm !== phrase) {', to: 'if (false) {', test: INT, stop: 'refusals' },
  { id: 'M6 NODE_ENV=production nao e recusado', file: LS, from: "if (String(i.nodeEnv || '').toLowerCase() === 'production') {", to: 'if (false) {', test: INT, stop: 'refusals' },
  { id: 'M7 recusa de producao removida', file: LS, from: "      if (i.target.matchesKnownProduction) {\n        throw new LoaderSafetyError('PRODUCTION_TARGET_REFUSED'", to: "      if (false) {\n        throw new LoaderSafetyError('PRODUCTION_TARGET_REFUSED'", test: INT, stop: 'refusals' },
  { id: 'M8 sessao do papel nao e verificada antes de escrever', file: LD, from: 'const lw = await verifyLimitedWriterSession(pool);', to: 'const lw = { role: LIMITED_WRITER_ROLE, validUntil: "", dbNow: "", minutesLeft: 120, tablesChecked: 0, allowedWrites: [] as string[] };', test: INT, stop: 'refusals' },
  { id: 'M9 janela de auditoria nao e aberta', file: LD, from: "await windowAudit('system.attribute_matrix.window_opened',", to: "await Promise.resolve(", test: INT, stop: 'pilot' },
  { id: 'M10 limite de operacoes ignorado na escrita', file: LD, from: 'const stopAfter = limitedWriter ? Math.min(maxOperationsFlag as number, stopAfterFlag ?? Infinity) : stopAfterFlag;', to: 'const stopAfter = stopAfterFlag;', test: INT, stop: 'pilot' },
  { id: 'M11 limite de remocoes ignorado na reversao', file: AE, from: 'if (!opts.dryRun && opts.maxRemovals !== undefined && out.removed >= opts.maxRemovals) {', to: 'if (false) {', test: INT },
  { id: 'M12 privilegios em excesso do papel nao sao detectados', file: LW, from: "  if (violations.length) throw new Error(`LIMITED_WRITER_EXCESS_PRIVILEGES", to: "  if (false) throw new Error(`LIMITED_WRITER_EXCESS_PRIVILEGES", test: ROLE },
  { id: 'M13 teto de 3 h do prazo do papel removido', file: LW, from: "if (left > LIMITED_WRITER_MAX_TTL_HOURS * 60 + 5) throw", to: "if (false) throw", test: ROLE },
  { id: 'M14 nome exato do papel nao e exigido na sessao', file: LW, from: 'if (me.u !== LIMITED_WRITER_ROLE || me.s !== LIMITED_WRITER_ROLE) throw', to: 'if (false) throw', test: ROLE },
  { id: 'M15 papel sem prazo aceito', file: LW, from: "if (!Number.isFinite(until)) throw", to: "if (false) throw", test: ROLE },
  { id: 'M16 atributos de administrador do papel aceitos', file: LW, from: 'if (r.rolsuper || r.rolcreaterole || r.rolcreatedb || r.rolreplication || r.rolbypassrls) throw', to: 'if (false) throw', test: ROLE },
];
const only = process.argv[2];
const norm = (s) => s.replace(/\r\n/g, '\n');
const orig = new Map();
const restore = () => { for (const [f, c] of orig) fs.writeFileSync(f, c); };
process.on('SIGINT', () => { restore(); process.exit(130); });
const res = [];
try {
  for (const m of M) {
    if (only && !m.id.startsWith(only + ' ')) continue;
    const raw = fs.readFileSync(m.file, 'utf8');
    if (!orig.has(m.file)) orig.set(m.file, raw);
    const crlf = raw.includes('\r\n'); const text = norm(raw);
    if (!text.includes(m.from)) { res.push({ m: m.id, status: 'ALVO NAO ENCONTRADO' }); console.log(res[res.length - 1]); continue; }
    fs.writeFileSync(m.file, (crlf ? (t) => t.replace(/\n/g, '\r\n') : (t) => t)(text.replace(m.from, () => m.to)));
    let out = '';
    cp.execSync('docker exec nusali-pg17-restore psql -U postgres -c "DROP DATABASE IF EXISTS p8c3_int" -c "DROP DATABASE IF EXISTS p8c3_role" -c "DROP ROLE IF EXISTS attr_loader_8c3" -c "DROP ROLE IF EXISTS outro_papel" -c "DROP ROLE IF EXISTS grupo_x"', { stdio: 'ignore' });
    try { out = cp.execSync(`npx tsx ${m.test}`, { env: { ...process.env, ...(m.stop ? { INT_STOP: m.stop } : {}) }, encoding: 'utf8', maxBuffer: 1 << 28, timeout: 900000 }); } catch (e) { out = String(e.stdout || '') + String(e.stderr || ''); }
    const line = out.match(/=== RESULTADO: (\d+)\/(\d+)/);
    const killed = !line || line[1] !== line[2];
    res.push({ m: m.id, status: killed ? 'MORTO (teste detectou)' : 'SOBREVIVEU (teste fraco!)', falhas: (out.match(/^\[FAIL\] (\S+)/gm) || []).map((x) => x.replace('[FAIL] ', '')).slice(0, 8).join(' ') || (line ? '' : 'erro fatal') });
    fs.writeFileSync(m.file, orig.get(m.file));
    console.log(res[res.length - 1]);
  }
} finally { restore(); }
console.log('\n=== MUTACAO: ' + res.filter((r) => r.status.startsWith('MORTO')).length + '/' + res.length + ' mutantes mortos');
process.exit(res.every((r) => r.status.startsWith('MORTO')) ? 0 : 1);
