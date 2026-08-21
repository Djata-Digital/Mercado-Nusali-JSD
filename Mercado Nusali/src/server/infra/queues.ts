import { Queue, Worker, QueueEvents } from 'bullmq';
import { logger } from './logger.js';

interface QueueInstance {
  queue?: Queue | null;
  worker?: Worker | null;
  events?: QueueEvents | null;
}

const queues: Record<string, QueueInstance> = {};

let globalQuotaExceeded = false;
let lastQueuesHealthTime = 0;
let cachedQueuesHealth: any = null;

export function isBullMQEnabled(): boolean {
  if (globalQuotaExceeded) return false;
  return process.env.ENABLE_BULLMQ === 'true';
}

export function getBullMQRole(): string {
  if (!isBullMQEnabled()) return 'disabled';
  return (process.env.BULLMQ_ROLE || 'producer').toLowerCase();
}

function getBullMQConnection() {
  if (!isBullMQEnabled()) {
    return null;
  }

  const redisUrl = process.env.REDIS_URL?.trim();

  if (!redisUrl || redisUrl === 'redis://localhost:6379') {
    return null;
  }

  try {
    const url = new URL(redisUrl);

    if (url.protocol !== 'redis:' && url.protocol !== 'rediss:') {
      logger.error({ protocol: url.protocol }, 'Unsupported Redis protocol for BullMQ');
      return null;
    }

    const isTls = url.protocol === 'rediss:';

    return {
      host: url.hostname,
      port: Number(url.port) || 6379,
      username: url.username ? decodeURIComponent(url.username) : undefined,
      password: url.password ? decodeURIComponent(url.password) : undefined,
      maxRetriesPerRequest: null,
      connectTimeout: 10_000,
      keepAlive: 10_000,
      enableReadyCheck: true,
      ...(isTls ? { tls: { servername: url.hostname } } : {}),
      retryStrategy(times: number) {
        if (globalQuotaExceeded || !isBullMQEnabled()) {
          return null;
        }
        if (times > 5) {
          logger.error({ attempts: times }, 'BullMQ Redis reconnection limit reached');
          return null;
        }
        return Math.min(times * 500, 3_000);
      },
    };
  } catch (error) {
    logger.error(
      { error: error instanceof Error ? error.message : error },
      'Invalid REDIS_URL for BullMQ'
    );
    return null;
  }
}

function handleQuotaError(error: any) {
  const msg = String(error?.message || error);
  if (msg.includes('max requests limit exceeded')) {
    if (!globalQuotaExceeded) {
      globalQuotaExceeded = true;
      logger.warn(
        'Upstash Redis: Limite diário de requisições atingido. Filas BullMQ desativadas.'
      );
      closeQueues().catch(() => {});
    }
    return true;
  }
  return false;
}

export function initializeQueues() {
  if (!isBullMQEnabled()) {
    logger.info(
      'BullMQ: Running in disabled mode (ENABLE_BULLMQ!=true). No queues or workers active.'
    );
    return;
  }

  const role = getBullMQRole();
  logger.info({ role }, 'BullMQ: Initialized in on-demand mode.');
}

/**
 * Lazy Queue Creation (Only created when addJob is called)
 */
function getOrCreateQueue(queueName: string): Queue | null {
  if (!isBullMQEnabled()) return null;

  if (queues[queueName]?.queue) {
    return queues[queueName].queue!;
  }

  const connection = getBullMQConnection();
  if (!connection) return null;

  try {
    const queue = new Queue(queueName, {
      connection,
      defaultJobOptions: {
        attempts: 3,
        backoff: { type: 'exponential', delay: 2_000 },
        removeOnComplete: { count: 100 },
        removeOnFail: { count: 500 },
      },
    });

    queue.on('error', (error) => {
      if (handleQuotaError(error)) return;
      logger.error({ queue: queueName, error: error.message }, 'BullMQ queue error');
    });

    if (!queues[queueName]) {
      queues[queueName] = {};
    }
    queues[queueName].queue = queue;

    const role = getBullMQRole();
    if (role === 'worker' || role === 'full' || role === 'all') {
      getOrCreateWorker(queueName, connection);
    }

    logger.info({ queue: queueName }, 'BullMQ queue lazily created');
    return queue;
  } catch (error) {
    logger.warn({ queue: queueName, error }, 'Failed to lazily create BullMQ queue');
    return null;
  }
}

/**
 * Lazy Worker Creation
 */
function getOrCreateWorker(queueName: string, connection: any): Worker | null {
  if (queues[queueName]?.worker) {
    return queues[queueName].worker!;
  }

  try {
    const worker = new Worker(
      queueName,
      async (job) => {
        logger.info({ queue: queueName, jobId: job.id, jobName: job.name }, 'Processing background queue job');
        return { success: true, processedAt: new Date().toISOString() };
      },
      { connection, concurrency: 2 }
    );

    worker.on('error', (error) => {
      if (handleQuotaError(error)) return;
      logger.error({ queue: queueName, error: error.message }, 'BullMQ worker error');
    });

    if (!queues[queueName]) {
      queues[queueName] = {};
    }
    queues[queueName].worker = worker;
    return worker;
  } catch (error) {
    logger.warn({ queue: queueName, error }, 'Failed to create BullMQ worker');
    return null;
  }
}

/**
 * On-demand QueueEvents Creation
 */
export function getOrCreateQueueEvents(queueName: string): QueueEvents | null {
  if (!isBullMQEnabled()) return null;
  if (queues[queueName]?.events) return queues[queueName].events!;

  const connection = getBullMQConnection();
  if (!connection) return null;

  try {
    const events = new QueueEvents(queueName, { connection });
    events.on('error', (error) => {
      if (handleQuotaError(error)) return;
      logger.error({ queue: queueName, error: error.message }, 'BullMQ QueueEvents error');
    });

    if (!queues[queueName]) queues[queueName] = {};
    queues[queueName].events = events;
    return events;
  } catch {
    return null;
  }
}

export async function addJob(queueName: string, jobName: string, data: any) {
  if (!isBullMQEnabled()) {
    logger.debug({ queueName, jobName }, 'BullMQ disabled: job not queued.');
    return {
      id: 'disabled',
      name: jobName,
      data,
      status: 'disabled',
    };
  }

  const queue = getOrCreateQueue(queueName);
  if (queue) {
    try {
      return await queue.add(jobName, data);
    } catch (error) {
      if (handleQuotaError(error)) {
        return { id: 'disabled', name: jobName, data, status: 'disabled' };
      }
      logger.warn({ queueName, jobName, error }, 'BullMQ add job failed');
    }
  }

  return {
    id: `noop_${Date.now()}`,
    name: jobName,
    data,
    status: 'disabled',
  };
}

export async function getQueuesHealth() {
  if (!isBullMQEnabled()) {
    return {
      status: 'disabled',
      queuesCount: 0,
      queues: [],
    };
  }

  const now = Date.now();
  if (cachedQueuesHealth && now - lastQueuesHealthTime < 30_000) {
    return cachedQueuesHealth;
  }

  const activeQueueNames = Object.keys(queues);
  if (activeQueueNames.length === 0) {
    const res = {
      status: 'disabled',
      queuesCount: 0,
      queues: [],
    };
    cachedQueuesHealth = res;
    lastQueuesHealthTime = now;
    return res;
  }

  const details: Record<string, any> = {};
  let healthyQueues = 0;

  for (const name of activeQueueNames) {
    const queue = queues[name]?.queue;
    if (!queue) {
      details[name] = { status: 'offline' };
      continue;
    }

    try {
      const counts = await queue.getJobCounts('waiting', 'active', 'completed', 'failed');
      details[name] = {
        status: 'online',
        waiting: counts.waiting ?? 0,
        active: counts.active ?? 0,
        completed: counts.completed ?? 0,
        failed: counts.failed ?? 0,
      };
      healthyQueues++;
    } catch {
      details[name] = { status: 'degraded' };
    }
  }

  const result = {
    status: healthyQueues === activeQueueNames.length ? 'online' : healthyQueues > 0 ? 'degraded' : 'offline',
    queuesCount: activeQueueNames.length,
    healthyQueues,
    queues: activeQueueNames,
    details,
  };

  cachedQueuesHealth = result;
  lastQueuesHealthTime = now;
  return result;
}

export async function closeQueues(): Promise<void> {
  const entries = Object.entries(queues);
  for (const [name, instance] of entries) {
    try {
      if (instance.worker) await instance.worker.close();
      if (instance.events) await instance.events.close();
      if (instance.queue) await instance.queue.close();
      logger.info({ queue: name }, 'BullMQ queue closed');
    } catch (error) {
      logger.warn({ queue: name, error }, 'Error closing BullMQ queue');
    }
    delete queues[name];
  }
}