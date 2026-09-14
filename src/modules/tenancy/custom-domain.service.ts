import { Injectable, NotFoundException, ConflictException, BadRequestException, Logger } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service.js';
import { CloudflareDomainProvider } from './cloudflare-domain.provider.js';
import { randomUUID } from 'crypto';

@Injectable()
export class CustomDomainService {
  private readonly logger = new Logger(CustomDomainService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly domainProvider: CloudflareDomainProvider,
  ) {}

  async listDomains(tenantId: string) {
    if (this.prisma.isDbConnected) {
      return this.prisma.tenantDomain.findMany({
        where: { tenantId },
        orderBy: [{ isPrimary: 'desc' }, { createdAt: 'asc' }],
      });
    }
    return Array.from(this.prisma.memoryStore.domains.values()).filter((d) => d.tenantId === tenantId);
  }

  async addCustomDomain(tenantId: string, domain: string) {
    const cleanDomain = domain.toLowerCase().trim();

    if (cleanDomain.includes('localhost') || cleanDomain.includes('127.0.0.1')) {
      throw new BadRequestException('Localhost domains cannot be configured as custom production domains.');
    }

    if (this.prisma.isDbConnected) {
      const existing = await this.prisma.tenantDomain.findUnique({ where: { domain: cleanDomain } });
      if (existing) {
        throw new ConflictException(`Domain "${cleanDomain}" is already registered in the platform.`);
      }
    } else {
      const existing = Array.from(this.prisma.memoryStore.domains.values()).find((d) => d.domain === cleanDomain);
      if (existing) {
        throw new ConflictException(`Domain "${cleanDomain}" is already registered in the platform.`);
      }
    }

    const domainId = `domain_${randomUUID().replace(/-/g, '').substring(0, 12)}`;
    const verificationToken = `saas_${randomUUID().replace(/-/g, '')}`;

    const domainRecord = {
      id: domainId,
      tenantId,
      domain: cleanDomain,
      type: 'CUSTOM' as const,
      isPrimary: false,
      isVerified: false,
      verificationToken,
      sslStatus: 'PENDING',
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    if (this.prisma.isDbConnected) {
      await this.prisma.tenantDomain.create({ data: domainRecord });
    } else {
      this.prisma.memoryStore.domains.set(domainId, domainRecord);
    }

    return {
      domain: cleanDomain,
      verificationToken,
      status: 'PENDING_VERIFICATION',
      requiredDnsRecords: [
        {
          type: 'TXT',
          name: `_saas-verify.${cleanDomain}`,
          value: `saas-verify=${verificationToken}`,
          purpose: 'Ownership Verification',
        },
        {
          type: 'CNAME',
          name: cleanDomain,
          value: process.env.SAAS_CNAME_TARGET || 'custom.yoursaas.com',
          purpose: 'Traffic Routing & TLS Termination',
        },
      ],
    };
  }

  async verifyCustomDomain(tenantId: string, domain: string) {
    const cleanDomain = domain.toLowerCase().trim();
    let domainRecord: any = null;

    if (this.prisma.isDbConnected) {
      domainRecord = await this.prisma.tenantDomain.findUnique({ where: { domain: cleanDomain } });
    } else {
      domainRecord = Array.from(this.prisma.memoryStore.domains.values()).find((d) => d.domain === cleanDomain);
    }

    if (!domainRecord || domainRecord.tenantId !== tenantId) {
      throw new NotFoundException(`Custom domain "${cleanDomain}" not found for this school.`);
    }

    const dnsResult = await this.domainProvider.verifyDns(cleanDomain, domainRecord.verificationToken || '');

    if (!dnsResult.verified) {
      return {
        verified: false,
        message: 'DNS verification failed. DNS records have not propagated yet.',
        details: dnsResult,
      };
    }

    const sslResult = await this.domainProvider.provisionSsl(cleanDomain);

    const updateData = {
      isVerified: true,
      sslStatus: sslResult.sslStatus,
      sslIssuedAt: sslResult.issuedAt ? new Date(sslResult.issuedAt) : new Date(),
      sslExpiresAt: sslResult.expiresAt ? new Date(sslResult.expiresAt) : new Date(Date.now() + 90 * 86400000),
      updatedAt: new Date(),
    };

    if (this.prisma.isDbConnected) {
      await this.prisma.tenantDomain.update({
        where: { id: domainRecord.id },
        data: updateData,
      });
    } else {
      Object.assign(domainRecord, updateData);
      this.prisma.memoryStore.domains.set(domainRecord.id, domainRecord);
    }

    return {
      verified: true,
      message: `Domain "${cleanDomain}" verified successfully and SSL certificate active!`,
      ssl: sslResult,
      domain: { ...domainRecord, ...updateData },
    };
  }

  async setPrimaryDomain(tenantId: string, domain: string) {
    const cleanDomain = domain.toLowerCase().trim();
    let target: any = null;

    if (this.prisma.isDbConnected) {
      target = await this.prisma.tenantDomain.findUnique({ where: { domain: cleanDomain } });
      if (!target || target.tenantId !== tenantId) {
        throw new NotFoundException('Domain not found for this school.');
      }
      if (!target.isVerified) {
        throw new BadRequestException('Cannot set an unverified domain as primary.');
      }

      await this.prisma.$transaction([
        this.prisma.tenantDomain.updateMany({
          where: { tenantId },
          data: { isPrimary: false },
        }),
        this.prisma.tenantDomain.update({
          where: { id: target.id },
          data: { isPrimary: true },
        }),
      ]);
    } else {
      target = Array.from(this.prisma.memoryStore.domains.values()).find(
        (d) => d.tenantId === tenantId && d.domain === cleanDomain,
      );
      if (!target) throw new NotFoundException('Domain not found for this school.');
      if (!target.isVerified) throw new BadRequestException('Cannot set an unverified domain as primary.');

      for (const d of this.prisma.memoryStore.domains.values()) {
        if (d.tenantId === tenantId) d.isPrimary = d.domain === cleanDomain;
      }
    }

    return { success: true, primaryDomain: cleanDomain };
  }

  async removeCustomDomain(tenantId: string, domain: string) {
    const cleanDomain = domain.toLowerCase().trim();
    let target: any = null;

    if (this.prisma.isDbConnected) {
      target = await this.prisma.tenantDomain.findUnique({ where: { domain: cleanDomain } });
      if (!target || target.tenantId !== tenantId) throw new NotFoundException('Domain not found for this school.');
      if (target.isPrimary) throw new BadRequestException('Cannot remove the primary domain. Set another primary first.');

      await this.domainProvider.removeCustomHostname(cleanDomain);
      await this.prisma.tenantDomain.delete({ where: { id: target.id } });
    } else {
      target = Array.from(this.prisma.memoryStore.domains.values()).find(
        (d) => d.tenantId === tenantId && d.domain === cleanDomain,
      );
      if (!target) throw new NotFoundException('Domain not found for this school.');
      if (target.isPrimary) throw new BadRequestException('Cannot remove the primary domain.');

      this.prisma.memoryStore.domains.delete(target.id);
    }

    return { success: true, message: `Domain "${cleanDomain}" removed successfully.` };
  }
}
