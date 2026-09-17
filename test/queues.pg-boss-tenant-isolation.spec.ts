import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { PgBossService } from '../src/infrastructure/queues/pg-boss/pg-boss.service.js';
import { PgBossDispatcher } from '../src/infrastructure/queues/pg-boss/pg-boss.dispatcher.js';
import { TenantWorkerContext } from '../src/infrastructure/queues/workers/tenant-worker.context.js';
import { RlsHelper } from '../src/database/rls.helper.js';
import { PrismaService } from '../src/database/prisma.service.js';
import { QUEUES } from '../src/jobs/queue.constants.js';
import { ConfigService } from '@nestjs/config';
import { BadRequestException, ForbiddenException } from '@nestjs/common';

describe('pg-boss Multi-Tenant Isolation & Transaction-Local RLS', () => {
  let pgBossService: PgBossService;
  let dispatcher: PgBossDispatcher;
  let prisma: PrismaService;
  let rlsHelper: RlsHelper;
  let workerContext: TenantWorkerContext;

  const TENANT_A = 'tenant_alpha_001';
  const TENANT_B = 'tenant_beta_002';

  beforeEach(async () => {
    const mockConfigService = {
      get: vi.fn(() => undefined),
    } as unknown as ConfigService;

    pgBossService = new PgBossService(mockConfigService);
    await pgBossService.start();
    dispatcher = new PgBossDispatcher(pgBossService);

    prisma = new PrismaService();
    rlsHelper = new RlsHelper(prisma);
    workerContext = new TenantWorkerContext(rlsHelper, prisma);
  });

  afterEach(async () => {
    await pgBossService.onModuleDestroy();
  });

  it('1. Strict Tenant Context Enforcement: Rejects job submission without valid tenantId', async () => {
    await expect(
      dispatcher.dispatch(QUEUES.NOTIFICATIONS, 'send-email', { foo: 'bar' }, ''),
    ).rejects.toThrow(BadRequestException);

    await expect(
      dispatcher.dispatch(QUEUES.NOTIFICATIONS, 'send-email', { foo: 'bar' }, '   '),
    ).rejects.toThrow(BadRequestException);
  });

  it('2. Tenant Data Isolation: Worker executing for Tenant A cannot mutate Tenant B records', async () => {
    const studentA = { id: 'stud_1', tenantId: TENANT_A, name: 'Alice Alpha' };
    const studentB = { id: 'stud_2', tenantId: TENANT_B, name: 'Bob Beta' };

    prisma.memoryStore.students.set('stud_1', studentA);
    prisma.memoryStore.students.set('stud_2', studentB);

    const envelope = {
      id: 'job_iso_1',
      name: 'process-student',
      queueName: QUEUES.IMPORT_EXPORT,
      tenantId: TENANT_A,
      data: { targetStudentId: 'stud_2' },
      timestamp: new Date().toISOString(),
    };

    const executionResult = await workerContext.runWithTenantContext(envelope, async (data, tx) => {
      // Attempting to mutate foreign tenant's record inside Tenant A's worker session
      return tx.memoryStore.students.set('stud_2', {
        ...studentB,
        name: 'Hacked Bob',
        tenantId: TENANT_B,
      });
    });

    expect(executionResult.success).toBe(false);
    expect(executionResult.error).toContain('Cross-tenant mutation prohibited');

    // Bob Beta in Tenant B remains untouched
    expect(prisma.memoryStore.students.get('stud_2').name).toBe('Bob Beta');
  });

  it('3. Tenant Read Isolation: Worker for Tenant A only views Tenant A scoped records', async () => {
    prisma.memoryStore.students.set('stud_1', { id: 'stud_1', tenantId: TENANT_A, name: 'Alice Alpha' });
    prisma.memoryStore.students.set('stud_2', { id: 'stud_2', tenantId: TENANT_B, name: 'Bob Beta' });

    const envelopeA = {
      id: 'job_iso_2',
      name: 'list-students',
      queueName: QUEUES.REPORTS,
      tenantId: TENANT_A,
      data: {},
      timestamp: new Date().toISOString(),
    };

    const resA = await workerContext.runWithTenantContext(envelopeA, async (_data, tx) => {
      return tx.memoryStore.students.values();
    });

    expect(resA.success).toBe(true);
    expect(resA.result.length).toBe(1);
    expect(resA.result[0].name).toBe('Alice Alpha');

    const envelopeB = {
      id: 'job_iso_3',
      name: 'list-students',
      queueName: QUEUES.REPORTS,
      tenantId: TENANT_B,
      data: {},
      timestamp: new Date().toISOString(),
    };

    const resB = await workerContext.runWithTenantContext(envelopeB, async (_data, tx) => {
      return tx.memoryStore.students.values();
    });

    expect(resB.success).toBe(true);
    expect(resB.result.length).toBe(1);
    expect(resB.result[0].name).toBe('Bob Beta');
  });
});
