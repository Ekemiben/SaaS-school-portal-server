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
    const existing = Array.from(
      this.prisma.memoryStore.vendors.values(),
    ).find((v: any) => v.tenantId === tenantId && v.code.toLowerCase() === dto.code.toLowerCase());

    if (existing) {
      throw new BadRequestException(`Vendor with code '${dto.code}' already exists`);
    }

    const id = `vnd_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const vendor = {
      id,
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
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    this.prisma.memoryStore.vendors.set(id, vendor);
    this.logger.log(`Vendor ${vendor.code} (${vendor.name}) created for tenant ${tenantId}`);
    return vendor;
  }

  async updateVendor(tenantId: string, vendorId: string, dto: UpdateVendorDto) {
    const vendor = await this.getVendorById(tenantId, vendorId);

    const updated = {
      ...vendor,
      ...dto,
      updatedAt: new Date(),
    };

    this.prisma.memoryStore.vendors.set(vendorId, updated);
    return updated;
  }

  async getVendorById(tenantId: string, vendorId: string) {
    const vendor = this.prisma.memoryStore.vendors.get(vendorId);
    if (!vendor || vendor.tenantId !== tenantId) {
      throw new NotFoundException(`Vendor with ID '${vendorId}' not found`);
    }
    return vendor;
  }

  async findAllVendors(tenantId: string, filter?: VendorFilterDto) {
    let list = Array.from(this.prisma.memoryStore.vendors.values()).filter(
      (v: any) => v.tenantId === tenantId,
    );

    if (filter?.category) {
      list = list.filter((v: any) => v.category === filter.category);
    }
    if (filter?.status) {
      list = list.filter((v: any) => v.status === filter.status);
    }
    if (filter?.search) {
      const q = filter.search.toLowerCase();
      list = list.filter(
        (v: any) =>
          v.name.toLowerCase().includes(q) ||
          v.code.toLowerCase().includes(q) ||
          (v.contactPerson && v.contactPerson.toLowerCase().includes(q)) ||
          (v.email && v.email.toLowerCase().includes(q)),
      );
    }

    return list.sort((a: any, b: any) => b.createdAt.getTime() - a.createdAt.getTime());
  }

  async deleteVendor(tenantId: string, vendorId: string) {
    const vendor = await this.getVendorById(tenantId, vendorId);
    
    // Check if vendor has purchase orders
    const hasPOs = Array.from(this.prisma.memoryStore.purchaseOrders.values()).some(
      (po: any) => po.tenantId === tenantId && po.vendorId === vendorId,
    );
    if (hasPOs) {
      throw new BadRequestException('Cannot delete vendor with linked purchase orders. Consider setting status to INACTIVE.');
    }

    this.prisma.memoryStore.vendors.delete(vendorId);
    return { success: true, message: `Vendor ${vendor.code} removed successfully` };
  }
}
