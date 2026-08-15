import Redis from 'ioredis';

// Memory fallback store if Redis is unavailable or disabled
const memoryCache = new Map<
  string,
  {
    value: string;
    expiresAt?: number;
  }
>();

let redisClient: Redis | null = null;
let connectionStarted = false;

/**
 * Creates and returns the shared Redis client.
 *
 * Supports:
 * - Local Redis: redis://
 * - Upstash / TLS Redis: rediss://
 *
 * In development, if Redis is unavailable, cache operations
 * can fall back to the local in-memory store.
 */
export function getRedisClient(): Redis | null {
  if (redisClient) {
    return redisClient;
  }

  const redisUrl = process.env.REDIS_URL?.trim();

  if (!redisUrl || redisUrl === 'redis://localhost:6379') {
    return null;
  }

  try {
    const parsedUrl = new URL(redisUrl);

    if (
      parsedUrl.protocol !== 'redis:' &&
      parsedUrl.protocol !== 'rediss:'
    ) {
      console.warn(
        `Unsupported Redis protocol "${parsedUrl.protocol}". Falling back to in-memory cache.`,
      );
      return null;
    }

    const isTls = parsedUrl.protocol === 'rediss:';

    redisClient = new Redis(redisUrl, {
      lazyConnect: true,

      /**
       * Cache/API requests should not remain blocked indefinitely.
       */
      maxRetriesPerRequest: 2,

      connectTimeout: 10_000,

      /**
       * Upstash uses TLS when REDIS_URL starts with rediss://.
       */
      ...(isTls
        ? {
            tls: {
              servername: parsedUrl.hostname,
            },
          }
        : {}),

      /**
       * Controlled reconnection policy.
       */
      retryStrategy(times) {
        if (times > 5) {
          console.warn(
            'Redis reconnection limit reached. Cache will use in-memory fallback.',
          );
          return null;
        }

        return Math.min(times * 500, 3_000);
      },

      /**
       * Keep TCP connection alive.
       */
      keepAlive: 10_000,

      /**
       * Do not enable offline queue for endless writes while disconnected.
       */
      enableOfflineQueue: true,
    });

    redisClient.on('connect', () => {
      console.info('Redis TCP connection established.');
    });

    redisClient.on('ready', () => {
      console.info('Redis is ready.');
    });

    redisClient.on('close', () => {
      console.warn('Redis connection closed.');
    });

    redisClient.on('reconnecting', () => {
      console.warn('Redis reconnecting...');
    });

    redisClient.on('end', () => {
      console.warn(
        'Redis connection ended. In-memory fallback will remain available.',
      );
    });

    redisClient.on('error', (error) => {
      console.warn('Redis connection error:', error.message);
    });

    if (!connectionStarted) {
      connectionStarted = true;

      redisClient.connect().catch((error) => {
        console.warn(
          'Initial Redis connection failed. Using in-memory fallback:',
          error instanceof Error ? error.message : error,
        );
      });
    }

    return redisClient;
  } catch (error) {
    console.warn(
      'Invalid REDIS_URL. Falling back to in-memory cache:',
      error instanceof Error ? error.message : error,
    );

    redisClient = null;
    connectionStarted = false;

    return null;
  }
}

/**
 * Waits briefly for Redis to become ready.
 *
 * Useful for health checks and operations executed immediately
 * after application startup.
 */
async function waitForRedisReady(
  client: Redis,
  timeoutMs = 5_000,
): Promise<boolean> {
  if (client.status === 'ready') {
    return true;
  }

  if (
    client.status === 'end' ||
    client.status === 'close'
  ) {
    return false;
  }

  return new Promise<boolean>((resolve) => {
    let finished = false;

    const finish = (result: boolean) => {
      if (finished) return;

      finished = true;
      clearTimeout(timer);

      client.off('ready', onReady);
      client.off('end', onEnd);
      client.off('close', onClose);

      resolve(result);
    };

    const onReady = () => finish(true);
    const onEnd = () => finish(false);
    const onClose = () => finish(false);

    const timer = setTimeout(() => {
      finish(client.status === 'ready');
    }, timeoutMs);

    client.once('ready', onReady);
    client.once('end', onEnd);
    client.once('close', onClose);
  });
}

/**
 * Get cached value by key.
 */
export async function getCache<T = any>(
  key: string,
): Promise<T | null> {
  try {
    const client = getRedisClient();

    if (client) {
      const ready = await waitForRedisReady(client);

      if (ready) {
        const data = await client.get(key);

        if (data !== null) {
          return JSON.parse(data) as T;
        }

        return null;
      }
    }
  } catch (error) {
    console.warn(
      `Redis GET failed for key "${key}". Using memory fallback:`,
      error instanceof Error ? error.message : error,
    );
  }

  const cached = memoryCache.get(key);

  if (!cached) {
    return null;
  }

  if (
    cached.expiresAt &&
    Date.now() > cached.expiresAt
  ) {
    memoryCache.delete(key);
    return null;
  }

  try {
    return JSON.parse(cached.value) as T;
  } catch {
    memoryCache.delete(key);
    return null;
  }
}

/**
 * Set value in cache with optional TTL in seconds.
 *
 * Default TTL:
 * 300 seconds / 5 minutes.
 */
export async function setCache(
  key: string,
  value: any,
  ttlSeconds = 300,
): Promise<void> {
  const serialized = JSON.stringify(value);

  try {
    const client = getRedisClient();

    if (client) {
      const ready = await waitForRedisReady(client);

      if (ready) {
        if (ttlSeconds > 0) {
          await client.set(
            key,
            serialized,
            'EX',
            ttlSeconds,
          );
        } else {
          await client.set(key, serialized);
        }

        /**
         * Remove stale memory fallback entry when Redis succeeded.
         */
        memoryCache.delete(key);

        return;
      }
    }
  } catch (error) {
    console.warn(
      `Redis SET failed for key "${key}". Using memory fallback:`,
      error instanceof Error ? error.message : error,
    );
  }

  memoryCache.set(key, {
    value: serialized,
    expiresAt:
      ttlSeconds > 0
        ? Date.now() + ttlSeconds * 1000
        : undefined,
  });
}

/**
 * Delete cached key from Redis and local fallback.
 */
export async function delCache(
  key: string,
): Promise<void> {
  try {
    const client = getRedisClient();

    if (client) {
      const ready = await waitForRedisReady(client);

      if (ready) {
        await client.del(key);
      }
    }
  } catch (error) {
    console.warn(
      `Redis DEL failed for key "${key}":`,
      error instanceof Error ? error.message : error,
    );
  } finally {
    memoryCache.delete(key);
  }
}

/**
 * Delete multiple cached keys.
 */
export async function delCacheMany(
  keys: string[],
): Promise<void> {
  if (keys.length === 0) {
    return;
  }

  try {
    const client = getRedisClient();

    if (client) {
      const ready = await waitForRedisReady(client);

      if (ready) {
        await client.del(...keys);
      }
    }
  } catch (error) {
    console.warn(
      'Redis multi-key DEL failed:',
      error instanceof Error ? error.message : error,
    );
  } finally {
    for (const key of keys) {
      memoryCache.delete(key);
    }
  }
}

/**
 * Delete keys matching a Redis pattern.
 *
 * Uses SCAN rather than KEYS to avoid blocking Redis.
 */
export async function delCacheByPattern(
  pattern: string,
): Promise<number> {
  let deleted = 0;

  try {
    const client = getRedisClient();

    if (client) {
      const ready = await waitForRedisReady(client);

      if (ready) {
        let cursor = '0';

        do {
          const [nextCursor, keys] =
            await client.scan(
              cursor,
              'MATCH',
              pattern,
              'COUNT',
              100,
            );

          cursor = nextCursor;

          if (keys.length > 0) {
            deleted += await client.del(...keys);
          }
        } while (cursor !== '0');
      }
    }
  } catch (error) {
    console.warn(
      `Redis pattern invalidation failed for "${pattern}":`,
      error instanceof Error ? error.message : error,
    );
  }

  /**
   * Also invalidate local fallback cache.
   *
   * Convert a simple Redis glob pattern to RegExp.
   */
  const regex = new RegExp(
    '^' +
      pattern
        .replace(/[.+?^${}()|[\]\\]/g, '\\$&')
        .replace(/\*/g, '.*') +
      '$',
  );

  for (const key of memoryCache.keys()) {
    if (regex.test(key)) {
      memoryCache.delete(key);
      deleted++;
    }
  }

  return deleted;
}

/**
 * Checks whether a key exists.
 */
export async function hasCache(
  key: string,
): Promise<boolean> {
  try {
    const client = getRedisClient();

    if (client) {
      const ready = await waitForRedisReady(client);

      if (ready) {
        return (await client.exists(key)) === 1;
      }
    }
  } catch (error) {
    console.warn(
      `Redis EXISTS failed for key "${key}":`,
      error instanceof Error ? error.message : error,
    );
  }

  const cached = memoryCache.get(key);

  if (!cached) {
    return false;
  }

  if (
    cached.expiresAt &&
    Date.now() > cached.expiresAt
  ) {
    memoryCache.delete(key);
    return false;
  }

  return true;
}

/**
 * Redis health check.
 */
export async function getRedisHealth(): Promise<{
  status: string;
  type: string;
  cachedKeysCount: number;
}> {
  try {
    const client = getRedisClient();

    if (client) {
      const ready = await waitForRedisReady(
        client,
        3_000,
      );

      if (ready) {
        const pong = await client.ping();

        if (pong === 'PONG') {
          const dbsize = await client.dbsize();

          return {
            status: 'online',
            type: 'Redis / Upstash',
            cachedKeysCount: dbsize,
          };
        }
      }

      return {
        status: 'degraded',
        type: `Redis unavailable (${client.status})`,
        cachedKeysCount: memoryCache.size,
      };
    }
  } catch (error) {
    console.warn(
      'Redis health check failed:',
      error instanceof Error ? error.message : error,
    );

    return {
      status: 'degraded',
      type: 'Redis unavailable - In-Memory Cache Engine',
      cachedKeysCount: memoryCache.size,
    };
  }

  return {
    status: 'online (in-memory fallback)',
    type: 'In-Memory Cache Engine',
    cachedKeysCount: memoryCache.size,
  };
}

/**
 * Gracefully close Redis connection.
 *
 * Useful during application shutdown and automated tests.
 */
export async function closeRedis(): Promise<void> {
  if (!redisClient) {
    return;
  }

  try {
    if (
      redisClient.status === 'ready' ||
      redisClient.status === 'connect'
    ) {
      await redisClient.quit();
    } else {
      redisClient.disconnect();
    }
  } catch {
    redisClient.disconnect();
  } finally {
    redisClient = null;
    connectionStarted = false;
  }
}