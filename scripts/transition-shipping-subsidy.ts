/**
 * Transição da política de frete: modo legado "Nusali assume 100%" (MARKETPLACE_FREE_SHIPPING) → subsídio global por percentagem (padrão 0%).
 *
 *   plano (padrão, SÓ LEITURA):  tsx scripts/transition-shipping-subsidy.ts [--percent 0] [--enable] [--keep-legacy]
 *   aplicar:                     SHIPPING_SUBSIDY_TRANSITION_CONFIRM=YES tsx scripts/transition-shipping-subsidy.ts --apply --expect-legacy-mode MARKETPLACE_FREE_SHIPPING [--rollback-file ficheiro.json]
 *   reverter:                    SHIPPING_SUBSIDY_TRANSITION_CONFIRM=YES tsx scripts/transition-shipping-subsidy.ts --rollback ficheiro.json
 *
 * Segurança: sem --apply/--rollback nada é escrito; aplicar exige a variável de confirmação E --expect-legacy-mode (o valor ANTERIOR tem de ser o
 * esperado, senão aborta); o ficheiro de reversão é gravado ANTES de aplicar; a mudança e a auditoria são uma só transação; pedidos nunca são tocados
 * (o script só os conta, antes e depois). Nunca imprime credenciais. O destino é o DATABASE_URL do ambiente.
 */
import 'dotenv/config';
import fs from 'fs';
import pg from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { planSubsidyTransition, applySubsidyTransition, rollbackSubsidyTransition, type TransitionTarget } from '../src/server/modules/shipping/shippingSubsidyTransition.js';

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}
const flag = (name: string) => process.argv.includes(`--${name}`);

async function main() {
  if (!process.env.DATABASE_URL) { console.error('[subsidy-transition] DATABASE_URL não configurada.'); process.exitCode = 1; return; }
  const apply = flag('apply');
  const rollbackFile = arg('rollback');
  if ((apply || rollbackFile) && process.env.SHIPPING_SUBSIDY_TRANSITION_CONFIRM !== 'YES') {
    console.error('[subsidy-transition] recusado: SHIPPING_SUBSIDY_TRANSITION_CONFIRM não é exatamente "YES". Nada foi alterado.');
    process.exitCode = 1; return;
  }
  const percentText = arg('percent') ?? '0';
  const percent = Number(percentText);
  const target: TransitionTarget = { percent, enabled: flag('enable') && percent > 0, disableLegacyFreeMode: !flag('keep-legacy') };

  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false }, max: 1 });
  const db = drizzle(pool);
  try {
    if (rollbackFile) {
      const snap = JSON.parse(fs.readFileSync(rollbackFile, 'utf8'));
      const r = await rollbackSubsidyTransition(db, snap);
      console.log('[subsidy-transition] reversão concluída.');
      console.log(`  antes : ativo=${r.before.enabled} ${r.before.percent}% | modo padrão=${r.before.legacyDefaultMode}`);
      console.log(`  depois: ativo=${r.after.enabled} ${r.after.percent}% | modo padrão=${r.after.legacyDefaultMode}`);
      console.log(`  pedidos (não alterados): ${r.ordersCount}`);
      return;
    }

    const plan = await planSubsidyTransition(db, target);
    console.log('[subsidy-transition] estado atual : ' + `ativo=${plan.current.enabled} ${plan.current.percent}% | modo padrão=${plan.current.legacyDefaultMode ?? 'não configurado'}`);
    console.log('[subsidy-transition] alvo         : ' + `ativo=${target.enabled} ${target.percent}% | desativar modo legado=${target.disableLegacyFreeMode}`);
    console.log(`[subsidy-transition] pedidos existentes: ${plan.existingOrders} (não serão recalculados)`);
    plan.changes.forEach((c) => console.log('  • ' + c));
    plan.warnings.forEach((w) => console.log('  ! ' + w));
    if (!apply) { console.log('[subsidy-transition] MODO PLANO: nada foi escrito. Para aplicar use --apply (ver cabeçalho do script).'); return; }

    const expected = arg('expect-legacy-mode');
    const current = plan.current.legacyDefaultMode ?? 'none';
    if (!expected || expected !== current) {
      console.error(`[subsidy-transition] recusado: o modo atual é "${current}" e o esperado informado é "${expected ?? '(ausente)'}". Nada foi alterado.`);
      process.exitCode = 1; return;
    }
    if (plan.noop) { console.log('[subsidy-transition] nada a mudar.'); return; }

    const file = arg('rollback-file') || `shipping-subsidy-rollback-${Date.now()}.json`;
    const snapshot = { enabled: plan.current.enabled, percent: plan.current.percent, legacyDefaultMode: plan.current.legacyDefaultMode, takenAt: new Date().toISOString() };
    fs.writeFileSync(file, JSON.stringify(snapshot, null, 2), { flag: 'wx' });
    console.log(`[subsidy-transition] ficheiro de reversão gravado: ${file}`);
    const r = await applySubsidyTransition(db, target);
    console.log('[subsidy-transition] transição concluída.');
    console.log(`  depois: ativo=${r.after.enabled} ${r.after.percent}% | modo padrão=${r.after.legacyDefaultMode}`);
    console.log(`  pedidos antes/depois (devem ser iguais e inalterados): ${r.ordersBefore} / ${r.ordersAfter}`);
  } catch (e: any) {
    console.error('[subsidy-transition] falhou:', e?.message || e);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}
main();
