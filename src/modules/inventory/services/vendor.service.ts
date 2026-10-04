import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../../../database/prisma.service.js';
import {
  CreateVendorDto,
  UpdateVendorDto,
} from '../dto/vendor.dto.js';
import { VendorFilterDto } from '../dto/inventory-filter.dto.js';

@Injectable()
export class VendorService {
  private readonly logger = new Logger(VendorService.name);

  constructor(private readonly prisma: PrismaService) {}

  async createVendor(tenantId: string, dto: CreateVendorDto) {
    const existing = await this.prisma.vendor.findFirst({
      where: {
        tenantId,
        code: { equals: dto.code, mode: 'insensitive' },
      },
    });

    if (existing) {
      throw new BadRequestException(`Vendor with code '${dto.code}' already exists`);
    }

    const vendor = await this.prisma.vendor.create({
      data: {
        tenantId,
        name: dto.name,
        code: dto.code.toUpperCase(),
        contactPerson: dto.contactPerson || null,
        email: dto.email || null,
        phone: dto.phone || null,
        address: dto.address || null,
        taxId: dto.taxId || null,
        category: dto.category || 'GENERAL',
        paymentTerms: dto.paymentTerms || 'NET_30',
        status: 'ACTIVE',
        rating: dto.rating !== undefined ? dto.rating : 5.0,
        notes: dto.notes || null,
      },
    });

    this.logger.log(`Vendor ${vendor.code} (${vendor.name}) created for tenant ${tenantId}`);
    return vendor;
  }

  async updateVendor(tenantId: string, vendorId: string, dto: UpdateVendorDto) {
    await this.getVendorById(tenantId, vendorId);

    return this.prisma.vendor.update({
      where: { id: vendorId },
      data: dto,
    });
  }

  async getVendorById(tenantId: string, vendorId: string) {
    const vendor = await this.prisma.vendor.findFirst({
      where: { id: vendorId, tenantId },
    });
    if (!vendor) {
      throw new NotFoundException(`Vendor with ID '${vendorId}' not found`);
    }
    return vendor;
  }

  async findAllVendors(tenantId: string, filter?: VendorFilterDto) {
    const where: any = { tenantId };

    if (filter?.category) {
      where.category = filter.category;
    }
    if (filter?.status) {
      where.status = filter.status;
    }
    if (filter?.search) {
      const q = filter.search;
      where.OR = [
        { name: { contains: q, mode: 'insensitive' } },
        { code: { contains: q, mode: 'insensitive' } },
        { contactPerson: { contains: q, mode: 'insensitive' } },
        { email: { contains: q, mode: 'insensitive' } },
      ];
    }

    return this.prisma.vendor.findMany({
      where,
      orderBy: { createdAt: 'desc' },
    });
  }

  async deleteVendor(tenantId: string, vendorId: string) {
    const vendor = await this.getVendorById(tenantId, vendorId);

    const hasPOs = await this.prisma.purchaseOrder.count({
      where: { tenantId, vendorId },
    });
    if (hasPOs > 0) {
      throw new BadRequestException('Cannot delete vendor with linked purchase orders. Consider setting status to INACTIVE.');
    }

    await this.prisma.vendor.delete({
      where: { id: vendorId },
    });

    return { success: true, message: `Vendor ${vendor.code} removed successfully` };
  }
}
