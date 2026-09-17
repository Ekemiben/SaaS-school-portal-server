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
    const rawIp = req.ip || req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown-ip';
    const clientIp = Array.isArray(rawIp) ? rawIp[0] : (typeof rawIp === 'string' ? rawIp.split(',')[0].trim() : 'unknown-ip');
    const path = (req.path || req.url || '').toLowerCase();
    const tenantId = (req.headers['x-tenant-id'] || req.headers['x-tenant-slug'] || '') as string;

    // Rate tier classification per Constitution Section 66 (Rate Limiting Without Redis)
    let tier: 'auth' | 'payment' | 'bulk' | 'general' = 'general';
    let limit = 180;

    const isAuthRoute =
      path.includes('/auth/login') ||
      path.includes('/auth/register') ||
      path.includes('/auth/forgot-password') ||
      path.includes('/auth/reset-password') ||
      path.includes('/auth/2fa') ||
      path.includes('/auth/verify');

    const isPaymentRoute =
      path.includes('/payments/initialize') ||
      path.includes('/payments/verify') ||
      path.includes('/webhooks') ||
      path.includes('/billing/checkout');

    const isBulkRoute =
      path.includes('/bulk-import') ||
      path.includes('/data-exchange') ||
      path.includes('/export');

    if (isAuthRoute) {
      tier = 'auth';
      limit = 15; // 15 requests / min
    } else if (isPaymentRoute) {
      tier = 'payment';
      limit = 30; // 30 requests / min
    } else if (isBulkRoute) {
      tier = 'bulk';
      limit = 30; // 30 requests / min
    } else {
      tier = 'general';
      limit = 180; // 180 requests / min
    }

    const windowMs = 60 * 1000;
    const scopeKey = tenantId ? `tenant_${tenantId}` : `ip_${clientIp}`;
    const key = `${scopeKey}:${tier}`;
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
          message: `Rate limit exceeded for ${tier} operations. Please retry after ${resetSeconds} seconds.`,
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    next();
  }
}
