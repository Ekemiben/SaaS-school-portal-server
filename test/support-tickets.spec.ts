import { describe, it, expect, vi } from 'vitest';
import { CommunicationsService } from '../src/modules/communications/communications.service.js';

describe('Phase 3: Support Tickets Backend Persistence Verification', () => {
  const mockThreads: any[] = [];

  const mockPrisma: any = {
    communicationThread: {
      findMany: vi.fn().mockImplementation(async (query: any) => {
        return mockThreads.filter((t) => t.tenantId === query.where.tenantId);
      }),
      create: vi.fn().mockImplementation(async (data: any) => {
        const newThread = {
          id: `th_${Date.now()}`,
          tenantId: data.data.tenantId,
          subject: data.data.subject,
          createdById: data.data.createdById,
          participantIds: data.data.participantIds,
          lastMessageAt: data.data.lastMessageAt || new Date(),
          createdAt: new Date(),
          messages: [
            {
              id: `msg_${Date.now()}`,
              content: data.data.messages.create.content,
              senderId: data.data.messages.create.senderId,
              createdAt: new Date(),
            },
          ],
        };
        mockThreads.unshift(newThread);
        return newThread;
      }),
    },
    communicationMessage: {
      create: vi.fn(),
      findMany: vi.fn().mockResolvedValue([]),
    },
  };

  const commsService = new CommunicationsService(mockPrisma);

  it('should create a persistent support ticket with thread and message records', async () => {
    const ticket = await commsService.createSupportTicket('tenant-alpha', 'usr_admin_1', {
      subject: 'Portal SSL Domain Certificate Renewal',
      category: 'Infrastructure & Security',
      priority: 'HIGH',
      description: 'Requesting SSL cert validation for custom domain subdomain.school.edu.ng',
    });

    expect(ticket.id).toBeDefined();
    expect(ticket.subject).toBe('Portal SSL Domain Certificate Renewal');
    expect(ticket.category).toBe('Infrastructure & Security');
    expect(ticket.priority).toBe('HIGH');
    expect(ticket.status).toBe('OPEN');
    expect(ticket.description).toContain('SSL cert validation');
    expect(mockPrisma.communicationThread.create).toHaveBeenCalled();
  });

  it('should list submitted support tickets from database', async () => {
    const list = await commsService.getSupportTickets('tenant-alpha');
    expect(list.length).toBeGreaterThan(0);
    expect(list[0].subject).toBe('Portal SSL Domain Certificate Renewal');
    expect(list[0].category).toBe('Infrastructure & Security');
    expect(list[0].status).toBe('OPEN');
  });
});
