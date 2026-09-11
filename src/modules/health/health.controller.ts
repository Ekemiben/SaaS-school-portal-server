import { Controller, Get } from '@nestjs/common';
import { Public } from '../../common/decorators/public.decorator.js';
import { PrismaService } from '../../database/prisma.service.js';

@Controller()
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  @Public()
  @Get('health')
  getHealth() {
    return {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      service: 'SaaS-school-portal-server',
      database: this.prisma.isDbConnected ? 'connected' : 'resilient-in-memory-mode',
      version: '1.0.0',
    };
  }

  @Public()
  @Get('api/v1/health')
  getApiV1Health() {
    return this.getHealth();
  }

  @Public()
  @Get()
  getRoot() {
    return {
      name: 'Multi-Tenant School SaaS API Server',
      status: 'operational',
      healthEndpoint: '/health',
      documentation: 'See Multi_Tenant_School_SaaS_Architecture_Documentation',
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
