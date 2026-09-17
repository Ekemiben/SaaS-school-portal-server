import { describe, it, expect, beforeEach } from 'vitest';
import { HealthController } from './health.controller.js';
import { PrismaService } from '../../database/prisma.service.js';

describe('HealthController Probes (Constitution Section 99)', () => {
  let controller: HealthController;
  let prisma: PrismaService;

  beforeEach(() => {
    prisma = new PrismaService();
    prisma.isDbConnected = true;
    controller = new HealthController(prisma);
  });

  it('should return 200 on liveness probe', () => {
    const liveness = controller.getLiveness();
    expect(liveness.status).toBe('ok');
    expect(liveness.timestamp).toBeDefined();
  });

  it('should return ready status on readiness probe when operational', async () => {
    const mockRes = {
      status: (code: number) => {
        mockRes.statusCode = code;
        return mockRes;
      },
      statusCode: 200,
    } as any;

    const readiness = await controller.getReadiness(mockRes);
    expect(readiness.status).toBe('ready');
    expect(readiness.database).toBe('connected');
    expect(mockRes.statusCode).toBe(200);
  });

  it('should return root operational metadata with endpoints', () => {
    const root = controller.getRoot();
    expect(root.status).toBe('operational');
    expect(root.healthEndpoints.liveness).toBe('/health/liveness');
    expect(root.healthEndpoints.readiness).toBe('/health/readiness');
  });
});
