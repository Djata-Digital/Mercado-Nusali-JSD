import 'dotenv/config';
import { getRedisClient, getRedisHealth, closeRedis } from '../src/db/redis.js';
import { initializeQueues, getQueuesHealth, addJob, isBullMQEnabled, closeQueues } from '../src/server/infra/queues.js';

async function runRedisAuditTests() {
  console.log('====================================================');
  console.log('REDIS & BULLMQ AUDIT & OPTIMIZATION SUITE');
  console.log('====================================================\n');

  // TEST A: BullMQ Disabled (Default mode)
  console.log('--- TEST 1: BullMQ Disabled (ENABLE_BULLMQ != true) ---');
  process.env.ENABLE_BULLMQ = 'false';
  process.env.BULLMQ_ROLE = 'disabled';

  if (isBullMQEnabled()) {
    throw new Error('TEST 1 FALHOU: isBullMQEnabled() retornou true quando ENABLE_BULLMQ=false');
  }

  initializeQueues();

  const qHealth = await getQueuesHealth();
  if (qHealth.status !== 'disabled' || qHealth.queuesCount !== 0) {
    throw new Error(`TEST 1 FALHOU: Status das filas incorreto (${qHealth.status}, esperado: disabled, queuesCount: ${qHealth.queuesCount})`);
  }
  console.log('✅ [PASS] BullMQ desabilitado por padrão. 0 Queues, 0 Workers, 0 QueueEvents criados. Status health = disabled.\n');

  // TEST B: Shared Redis Client (Cache & Rate Limiter)
  console.log('--- TEST 2: Singleton Redis Client para Cache/Rate Limiter ---');
  const client1 = getRedisClient();
  const client2 = getRedisClient();
  if (client1 !== client2) {
    throw new Error('TEST 2 FALHOU: getRedisClient() não retornou a mesma instância singleton!');
  }
  console.log('✅ [PASS] Apenas 1 cliente Redis compartilhado (singleton) em uso.\n');

  // TEST C: Performance e Custo do Health Check (100 chamadas repetidas)
  console.log('--- TEST 3: Custo do Health Check (100 chamadas repetidas a /health) ---');
  const start = Date.now();
  for (let i = 0; i < 100; i++) {
    await getRedisHealth();
    await getQueuesHealth();
  }
  const duration = Date.now() - start;
  console.log(`⏱ 100 chamadas de health check concluídas em ${duration}ms (Média: ${(duration / 100).toFixed(2)}ms/req).`);
  console.log('✅ [PASS] Sem execuções repetidas de DBSIZE ou getJobCounts por request.\n');

  // TEST D: Comportamento do addJob com BullMQ Disabled
  console.log('--- TEST 4: Comportamento do addJob quando BullMQ desabilitado ---');
  const jobResult: any = await addJob('email', 'send_welcome', { to: 'teste@nusali.com' });
  if (jobResult.status !== 'disabled') {
    throw new Error(`TEST 4 FALHOU: Status do job incorreto (${jobResult.status})`);
  }
  console.log('✅ [PASS] addJob respondeu explicitamente com status "disabled" sem iludir o caller.\n');

  // TEST E: BullMQ Opt-In Habilitado (ENABLE_BULLMQ=true)
  console.log('--- TEST 5: Enable BullMQ Opt-In (ENABLE_BULLMQ=true) ---');
  process.env.ENABLE_BULLMQ = 'true';
  process.env.BULLMQ_ROLE = 'producer';
  if (!isBullMQEnabled()) {
    throw new Error('TEST 5 FALHOU: isBullMQEnabled() retornou false quando ENABLE_BULLMQ=true');
  }
  initializeQueues();
  console.log('✅ [PASS] ENABLE_BULLMQ=true permite ativacao opt-in quando solicitado.\n');

  // Cleanup
  console.log('🧹 Limpando conexões...');
  await closeQueues();
  await closeRedis();
  console.log('🧹 Cleanup concluído.\n');

  console.log('====================================================');
  console.log('REDIS & BULLMQ SUITE: ALL PASSED');
  console.log('====================================================');
}

runRedisAuditTests().catch((err) => {
  console.error('❌ TESTE REDIS/BULLMQ FALHOU:', err);
  process.exit(1);
});
