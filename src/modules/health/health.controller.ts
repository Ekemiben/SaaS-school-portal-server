import { Controller, Get, Res, HttpStatus, Optional } from '@nestjs/common';
import type { Response } from 'express';
import { Public } from '../../common/decorators/public.decorator.js';
import { PrismaService } from '../../database/prisma.service.js';
import { PgBossService } from '../../infrastructure/queues/pg-boss/pg-boss.service.js';

@Controller()
export class HealthController {
  constructor(
    private readonly prisma: PrismaService,
    @Optional() private readonly pgBossService?: PgBossService,
  ) {}

  @Public()
  @Get('health')
  getHealth() {
    return {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      service: 'SaaS-school-portal-server',
      database: this.prisma.isDbConnected ? 'connected' : 'resilient-in-memory-mode',
      queue: this.pgBossService?.isStarted ? 'connected' : 'resilient-in-memory-mode',
      version: '2.1.0',
    };
  }

  @Public()
  @Get('api/v1/health')
  getApiV1Health() {
    return this.getHealth();
  }

  /**
   * Liveness probe per Constitution Section 99.
   * Returns 200 OK as long as the process is alive and receiving HTTP traffic.
   */
  @Public()
  @Get('health/liveness')
  getLiveness() {
    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
    };
  }

  @Public()
  @Get('api/v1/health/liveness')
  getApiV1Liveness() {
    return this.getLiveness();
  }

  /**
   * Readiness probe per Constitution Section 99.
   * Validates required infrastructure: PostgreSQL database and pg-boss queue.
   */
  @Public()
  @Get('health/readiness')
  async getReadiness(@Res({ passthrough: true }) res: Response) {
    const isDbReady = this.prisma.isDbConnected;
    const isQueueReady = !!this.pgBossService?.isStarted;

    const isProduction = process.env.NODE_ENV === 'production' || process.env.REQUIRE_DB === 'true';
    const isReady = isProduction ? isDbReady && isQueueReady : true;

    if (!isReady) {
      res.status(HttpStatus.SERVICE_UNAVAILABLE);
    }

    return {
      status: isReady ? 'ready' : 'degraded',
      database: isDbReady ? 'connected' : 'resilient-in-memory-mode',
      queue: isQueueReady ? 'operational' : 'resilient-in-memory-mode',
      timestamp: new Date().toISOString(),
    };
  }

  @Public()
  @Get('api/v1/health/readiness')
  async getApiV1Readiness(@Res({ passthrough: true }) res: Response) {
    return this.getReadiness(res);
  }

  @Public()
  @Get()
  getRoot() {
    return {
      name: 'Multi-Tenant School SaaS API Server',
      status: 'operational',
      healthEndpoints: {
        health: '/health',
        liveness: '/health/liveness',
        readiness: '/health/readiness',
      },
      documentation: 'Multi-Tenant School Management SaaS — Master Architecture Constitution v2.1',
      endpoints: {
        tenants: '/api/v1/tenant',
        auth: '/api/v1/auth',
        campuses: '/api/v1/campuses',
        students: '/api/v1/students',
        academics: '/api/v1/academics',
        attendance: '/api/v1/attendance',
        results: '/api/v1/results',
        fees: '/api/v1/fees',
        payments: '/api/v1/payments',
        reports: '/api/v1/reports',
      },
    };
  }
}
