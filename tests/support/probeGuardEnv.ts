// Sonda do teste do guarda: chama assertLedgerTestDatabaseGuard() e imprime o ambiente resultante (sem conectar a nada).
import { assertLedgerTestDatabaseGuard } from './ledgerTestDbGuard.js';
const u = assertLedgerTestDatabaseGuard();
console.log(JSON.stringify({ u, db: process.env.DATABASE_URL, prod: process.env.PRODUCTION_DATABASE_URL, redis: process.env.REDIS_URL, t: process.env.NUSALI_TEST_RUN }));
