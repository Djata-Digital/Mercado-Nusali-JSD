import { Request, Response, NextFunction } from 'express';
import { getRedisClient } from '../../db/redis.js';

interface RateLimitConfig {
  windowMs: number; // e.g. 60000 (1 minute)
  maxRequests: number; // e.g. 30 requests per window
  message?: string;
  keyPrefix?: string;
}

const memoryRateLimit = new Map<string, { count: number; resetAt: number }>();

export function createRateLimiter(config: RateLimitConfig) {
  const { windowMs, maxRequests, message = 'Muitas requisições. Por favor, tente novamente mais tarde.', keyPrefix = 'rl:' } = config;

  return async (req: Request, res: Response, next: NextFunction) => {
    const ip = req.ip || req.socket.remoteAddress || '127.0.0.1';
    const key = `${keyPrefix}${ip}`;
    const now = Date.now();

    const client = getRedisClient();

    if (client && client.status === 'ready') {
      try {
        const current = await client.incr(key);
        if (current === 1) {
          await client.pexpire(key, windowMs);
        }

        res.setHeader('X-RateLimit-Limit', maxRequests);
        res.setHeader('X-RateLimit-Remaining', Math.max(0, maxRequests - current));

        if (current > maxRequests) {
          return res.status(429).json({
            success: false,
            error: {
              code: 'RATE_LIMIT_EXCEEDED',
              message,
            },
          });
        }
        return next();
      } catch (err) {
        // Fallback to memory limiter if redis call fails
      }
    }

    // In-memory fallback
    const record = memoryRateLimit.get(key);
    if (!record || now > record.resetAt) {
      memoryRateLimit.set(key, { count: 1, resetAt: now + windowMs });
      res.setHeader('X-RateLimit-Limit', maxRequests);
      res.setHeader('X-RateLimit-Remaining', maxRequests - 1);
      return next();
    }

    record.count += 1;
    res.setHeader('X-RateLimit-Limit', maxRequests);
    res.setHeader('X-RateLimit-Remaining', Math.max(0, maxRequests - record.count));

    if (record.count > maxRequests) {
      return res.status(429).json({
        success: false,
        error: {
          code: 'RATE_LIMIT_EXCEEDED',
          message,
        },
      });
    }

    return next();
  };
}
