import Redis from 'ioredis';

// Memory fallback store if Redis is unavailable or disabled
const memoryCache = new Map<string, { value: string; expiresAt?: number }>();

let redisClient: Redis | null = null;

export function getRedisClient(): Redis | null {
  if (redisClient) return redisClient;

  const redisUrl = process.env.REDIS_URL;
  if (!redisUrl || redisUrl === 'redis://localhost:6379') {
    // Return null silently to use the in-memory fallback cache unless a real Redis URL is supplied
    return null;
  }

  try {
    // Validate URL format before passing to Redis client
    new URL(redisUrl);

    redisClient = new Redis(redisUrl, {
      maxRetriesPerRequest: 2,
      connectTimeout: 3000,
      retryStrategy(times) {
        if (times > 3) {
          console.warn('Redis reconnection limit reached. Falling back to in-memory store.');
          return null; // Stop reconnecting
        }
        return Math.min(times * 200, 1000);
      },
      lazyConnect: true,
    });

    redisClient.on('error', () => {
      // Quietly fall back to in-memory cache
    });

    redisClient.connect().catch(() => {
      // Quietly fall back to in-memory cache
    });

    return redisClient;
  } catch {
    return null;
  }
}

/**
 * Get cached value by key
 */
export async function getCache<T = any>(key: string): Promise<T | null> {
  try {
    const client = getRedisClient();
    if (client && client.status === 'ready') {
      const data = await client.get(key);
      return data ? JSON.parse(data) : null;
    }
  } catch (err) {
    // Fall back to memory cache
  }

  const cached = memoryCache.get(key);
  if (!cached) return null;
  if (cached.expiresAt && Date.now() > cached.expiresAt) {
    memoryCache.delete(key);
    return null;
  }
  return JSON.parse(cached.value);
}

/**
 * Set value in cache with optional TTL in seconds (default: 300s / 5 minutes)
 */
export async function setCache(key: string, value: any, ttlSeconds: number = 300): Promise<void> {
  const serialized = JSON.stringify(value);

  try {
    const client = getRedisClient();
    if (client && client.status === 'ready') {
      await client.set(key, serialized, 'EX', ttlSeconds);
      return;
    }
  } catch (err) {
    // Fall back to memory cache
  }

  memoryCache.set(key, {
    value: serialized,
    expiresAt: ttlSeconds > 0 ? Date.now() + ttlSeconds * 1000 : undefined,
  });
}

/**
 * Delete cached key
 */
export async function delCache(key: string): Promise<void> {
  try {
    const client = getRedisClient();
    if (client && client.status === 'ready') {
      await client.del(key);
    }
  } catch (err) {
    // ignore
  }
  memoryCache.delete(key);
}

/**
 * Health check status for Redis
 */
export async function getRedisHealth(): Promise<{ status: string; type: string; cachedKeysCount: number }> {
  try {
    const client = getRedisClient();
    if (client && client.status === 'ready') {
      const dbsize = await client.dbsize();
      return { status: 'online', type: 'Redis Cloud/Instance', cachedKeysCount: dbsize };
    }
  } catch {
    // ignore
  }

  return { status: 'online (in-memory fallback)', type: 'In-Memory Cache Engine', cachedKeysCount: memoryCache.size };
}
