import { Queue, Worker, QueueEvents } from 'bullmq';
import { logger } from './logger.js';

interface QueueInstance {
  queue: Queue | null;
  worker?: Worker | null;
  events?: QueueEvents | null;
}

const queues: Record<string, QueueInstance> = {};

const QUEUE_NAMES = [
  'notifications',
  'email',
  'payments',
  'webhooks',
  'images',
  'shipping',
  'reports',
] as const;

function getBullMQConnection() {
  const redisUrl = process.env.REDIS_URL?.trim();

  if (!redisUrl || redisUrl === 'redis://localhost:6379') {
    return null;
  }

  try {
    const url = new URL(redisUrl);

    if (
      url.protocol !== 'redis:' &&
      url.protocol !== 'rediss:'
    ) {
      logger.error(
        { protocol: url.protocol },
        'Unsupported Redis protocol for BullMQ',
      );

      return null;
    }

    const isTls = url.protocol === 'rediss:';

    return {
      host: url.hostname,
      port: Number(url.port) || 6379,

      username: url.username
        ? decodeURIComponent(url.username)
        : undefined,

      password: url.password
        ? decodeURIComponent(url.password)
        : undefined,

      /**
       * BullMQ workers require this to avoid command failures
       * during temporary Redis reconnects.
       */
      maxRetriesPerRequest: null,

      /**
       * Upstash can require a few seconds on cold connection.
       */
      connectTimeout: 10_000,

      /**
       * Keep TCP connection alive.
       */
      keepAlive: 10_000,

      /**
       * BullMQ/ioredis Redis compatibility.
       */
      enableReadyCheck: true,

      /**
       * Required for Upstash when using rediss://.
       */
      ...(isTls
        ? {
            tls: {
              servername: url.hostname,
            },
          }
        : {}),

      retryStrategy(times: number) {
        if (times > 10) {
          logger.error(
            { attempts: times },
            'BullMQ Redis reconnection limit reached',
          );

          return null;
        }

        return Math.min(times * 500, 5_000);
      },
    };
  } catch (error) {
    logger.error(
      {
        error:
          error instanceof Error
            ? error.message
            : error,
      },
      'Invalid REDIS_URL for BullMQ',
    );

    return null;
  }
}

export function initializeQueues() {
  const connection = getBullMQConnection();

  if (!connection) {
    logger.info(
      'BullMQ: Running in local memory dispatch mode (No remote REDIS_URL provided).',
    );

    return;
  }

  for (const name of QUEUE_NAMES) {
    /**
     * Prevent duplicate initialization during hot reload.
     */
    if (queues[name]?.queue) {
      continue;
    }

    try {
      const queue = new Queue(name, {
        connection,

        defaultJobOptions: {
          attempts: 3,

          backoff: {
            type: 'exponential',
            delay: 2_000,
          },

          /**
           * Keep recent jobs for debugging without
           * allowing Redis to grow indefinitely.
           */
          removeOnComplete: {
            count: 100,
          },

          removeOnFail: {
            count: 500,
          },
        },
      });

      const events = new QueueEvents(name, {
        connection,
      });

      const worker = new Worker(
        name,

        async (job) => {
          logger.info(
            {
              queue: name,
              jobId: job.id,
              jobName: job.name,
            },
            'Processing background queue job',
          );

          /**
           * At this stage these workers provide the
           * infrastructure layer.
           *
           * Later each queue will delegate to its real
           * service:
           *
           * email         -> Resend
           * notifications -> realtime/push
           * payments      -> payment providers
           * webhooks      -> webhook handlers
           * images        -> image processing
           * shipping      -> logistics
           * reports       -> report generation
           */
          return {
            success: true,
            processedAt: new Date().toISOString(),
          };
        },

        {
          connection,

          /**
           * Start conservatively while the marketplace
           * infrastructure is being validated.
           */
          concurrency: 2,
        },
      );

      queue.on('error', (error) => {
        logger.error(
          {
            queue: name,
            error: error.message,
          },
          'BullMQ queue error',
        );
      });

      worker.on('error', (error) => {
        logger.error(
          {
            queue: name,
            error: error.message,
          },
          'BullMQ worker error',
        );
      });

      worker.on('failed', (job, error) => {
        logger.error(
          {
            queue: name,
            jobId: job?.id,
            jobName: job?.name,
            error: error.message,
          },
          'Queue job failed',
        );
      });

      worker.on('completed', (job) => {
        logger.debug(
          {
            queue: name,
            jobId: job.id,
            jobName: job.name,
          },
          'Queue job completed',
        );
      });

      events.on('error', (error) => {
        logger.error(
          {
            queue: name,
            error: error.message,
          },
          'BullMQ QueueEvents error',
        );
      });

      queues[name] = {
        queue,
        worker,
        events,
      };

      logger.info(
        { queue: name },
        'BullMQ queue initialized',
      );
    } catch (error) {
      logger.warn(
        {
          queue: name,
          error:
            error instanceof Error
              ? error.message
              : error,
        },
        'Failed to initialize BullMQ queue',
      );
    }
  }
}

export async function addJob(
  queueName: string,
  jobName: string,
  data: any,
) {
  const instance = queues[queueName];
  const queue = instance?.queue;

  if (queue) {
    try {
      return await queue.add(jobName, data, {
        /**
         * Optional deterministic ID can later be supplied
         * for idempotent jobs such as payments/webhooks.
         */
      });
    } catch (error) {
      logger.warn(
        {
          queueName,
          jobName,
          error:
            error instanceof Error
              ? error.message
              : error,
        },
        'BullMQ add job failed, using synchronous fallback',
      );
    }
  }

  /**
   * Development fallback.
   *
   * Critical production jobs such as payment settlement
   * should NOT silently use this fallback later.
   */
  logger.debug(
    {
      queueName,
      jobName,
    },
    'BullMQ fallback: synchronous job handling',
  );

  return {
    id: `sync_${Date.now()}`,
    name: jobName,
    data,
    fallback: true,
  };
}

export async function getQueuesHealth() {
  const queueNames = Object.keys(queues);

  if (queueNames.length === 0) {
    return {
      status: 'in-memory fallback',
      queuesCount: 0,
      queues: [],
    };
  }

  const details: Record<
    string,
    {
      status: string;
      waiting?: number;
      active?: number;
      completed?: number;
      failed?: number;
    }
  > = {};

  let healthyQueues = 0;

  for (const name of queueNames) {
    const queue = queues[name]?.queue;

    if (!queue) {
      details[name] = {
        status: 'offline',
      };

      continue;
    }

    try {
      const counts = await queue.getJobCounts(
        'waiting',
        'active',
        'completed',
        'failed',
      );

      details[name] = {
        status: 'online',
        waiting: counts.waiting ?? 0,
        active: counts.active ?? 0,
        completed: counts.completed ?? 0,
        failed: counts.failed ?? 0,
      };

      healthyQueues++;
    } catch (error) {
      details[name] = {
        status: 'degraded',
      };

      logger.warn(
        {
          queue: name,
          error:
            error instanceof Error
              ? error.message
              : error,
        },
        'BullMQ health check failed',
      );
    }
  }

  return {
    status:
      healthyQueues === queueNames.length
        ? 'online'
        : healthyQueues > 0
          ? 'degraded'
          : 'offline',

    queuesCount: queueNames.length,

    healthyQueues,

    queues: queueNames,

    details,
  };
}

export async function closeQueues(): Promise<void> {
  const entries = Object.entries(queues);

  for (const [name, instance] of entries) {
    try {
      if (instance.worker) {
        await instance.worker.close();
      }

      if (instance.events) {
        await instance.events.close();
      }

      if (instance.queue) {
        await instance.queue.close();
      }

      logger.info(
        { queue: name },
        'BullMQ queue closed',
      );
    } catch (error) {
      logger.warn(
        {
          queue: name,
          error:
            error instanceof Error
              ? error.message
              : error,
        },
        'Error while closing BullMQ queue',
      );
    }

    delete queues[name];
  }
}