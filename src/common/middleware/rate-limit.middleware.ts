import { Injectable, NestMiddleware, HttpException, HttpStatus } from '@nestjs/common';
import type { Request, Response, NextFunction } from 'express';

interface RateLimitBucket {
  count: number;
  resetTime: number;
}

@Injectable()
export class RateLimitMiddleware implements NestMiddleware {
  private static readonly memoryStore = new Map<string, RateLimitBucket>();

  use(req: Request, res: Response, next: NextFunction) {
    const ip = req.ip || req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown-ip';
    const clientKey = Array.isArray(ip) ? ip[0] : ip;
    const path = req.path || req.url;

    // Strict limit for authentication & sensitive endpoints (5 req / min)
    const isAuthRoute = path.includes('/auth/login') || path.includes('/auth/forgot-password');
    const limit = isAuthRoute ? 10 : 180;
    const windowMs = 60 * 1000;

    const key = `${clientKey}:${isAuthRoute ? 'auth' : 'general'}`;
    const now = Date.now();

    let bucket = RateLimitMiddleware.memoryStore.get(key);
    if (!bucket || now > bucket.resetTime) {
      bucket = {
        count: 0,
        resetTime: now + windowMs,
      };
      RateLimitMiddleware.memoryStore.set(key, bucket);
    }

    bucket.count++;
    const remaining = Math.max(0, limit - bucket.count);
    const resetSeconds = Math.ceil((bucket.resetTime - now) / 1000);

    res.setHeader('X-RateLimit-Limit', limit);
    res.setHeader('X-RateLimit-Remaining', remaining);
    res.setHeader('X-RateLimit-Reset', resetSeconds);

    if (bucket.count > limit) {
      res.setHeader('Retry-After', resetSeconds);
      throw new HttpException(
        {
          statusCode: HttpStatus.TOO_MANY_REQUESTS,
          error: 'Too Many Requests',
          message: `Rate limit exceeded. Please retry after ${resetSeconds} seconds.`,
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    next();
  }
}
