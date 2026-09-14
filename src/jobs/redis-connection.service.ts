import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import { Redis } from 'ioredis';

@Injectable()
export class RedisConnectionService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RedisConnectionService.name);
  public client?: Redis;
  public isRedisConnected = false;

  getClientOptions() {
    const isTest = process.env.NODE_ENV === 'test';
    const retryStrategy = (times: number) => {
      if (isTest || (times > 2 && process.env.NODE_ENV !== 'production')) return null;
      return Math.min(times * 100, 2000);
    };

    if (process.env.REDIS_URL) {
      return {
        pathOrUrl: process.env.REDIS_URL,
        options: {
          maxRetriesPerRequest: null,
          enableReadyCheck: false,
          connectTimeout: isTest ? 500 : 2500,
          retryStrategy,
        },
      };
    }

    return {
      options: {
        host: process.env.REDIS_HOST || 'localhost',
        port: parseInt(process.env.REDIS_PORT || '6379', 10),
        password: process.env.REDIS_PASSWORD || undefined,
        tls: process.env.REDIS_TLS === 'true' ? {} : undefined,
        maxRetriesPerRequest: null,
        enableReadyCheck: false,
        connectTimeout: isTest ? 500 : 2500,
        retryStrategy,
      },
    };
  }

  async onModuleInit() {
    const config = this.getClientOptions();
    try {
      this.client = config.pathOrUrl
        ? new Redis(config.pathOrUrl, config.options)
        : new Redis(config.options);

      this.client.on('error', (err) => {
        this.logger.warn(`Redis connection error: ${err.message}`);
        this.isRedisConnected = false;
      });

      const probeTimeout = process.env.NODE_ENV === 'test' ? 600 : 2500;
      await Promise.race([
        this.client.ping(),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error(`Redis connection timeout after ${probeTimeout}ms`)), probeTimeout),
        ),
      ]);

      this.isRedisConnected = true;
      this.logger.log('Successfully connected to production Redis instance for BullMQ queues.');
    } catch (error: any) {
      if (this.client) {
        try {
          this.client.disconnect();
        } catch {}
      }
      this.isRedisConnected = false;
      const isProduction =
        process.env.NODE_ENV === 'production' || process.env.REQUIRE_REDIS === 'true';

      if (isProduction) {
        const errorMsg = `CRITICAL: Redis connection failed in production mode (${error?.message}). Background distributed job persistence requires an active Redis cluster.`;
        this.logger.error(errorMsg);
        throw new Error(errorMsg);
      }

      this.logger.warn(
        `Redis not reachable (${error?.message}). Running with resilient persistent fallback for dev/test environment.`,
      );
    }
  }

  async onModuleDestroy() {
    if (this.client) {
      try {
        await this.client.quit();
      } catch {
        this.client.disconnect();
      }
    }
  }
}
