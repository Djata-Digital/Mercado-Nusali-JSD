/**
 * Sonda usada por tests/test-db-safety.test.ts em SUBPROCESSO: tenta abrir o pool via getDb() com o ambiente que o teste montou. Imprime POOL_CREATED se
 * conseguiu criar o pool (o que NUNCA deve acontecer para um banco que não seja descartável local) ou REFUSED:<código> se a proteção recusou antes de conectar.
 * Não executa nenhuma consulta.
 */
import { getDb } from '../../src/db/index.js';

try {
  const db = getDb();
  console.log(db ? 'POOL_CREATED' : 'NO_DB');
} catch (e: any) {
  console.log(`REFUSED:${e?.code || e?.name}`);
}
process.exit(0);
