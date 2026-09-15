import { Controller, Get, Post, Delete, Param, Body, Query } from '@nestjs/common';
import { ExpensesService } from './expenses.service.js';
import { CurrentTenant } from '../../common/decorators/current-tenant.decorator.js';
import type { TenantContext } from '../../common/types/tenant-context.interface.js';
import { RequirePermissions } from '../../common/decorators/permissions.decorator.js';
import { SystemPermissions } from '../../common/constants/permissions.js';

@Controller('api/v1/expenses')
export class ExpensesController {
  constructor(private readonly expensesService: ExpensesService) {}

  @RequirePermissions(SystemPermissions.EXPENSES_MANAGE)
  @Get()
  async list(
    @CurrentTenant() tenant: TenantContext,
    @Query('campusId') campusId?: string,
  ) {
    return this.expensesService.listExpenses(tenant.tenantId, campusId);
  }

  @RequirePermissions(SystemPermissions.EXPENSES_MANAGE)
  @Get(':id')
  async getById(
    @CurrentTenant() tenant: TenantContext,
    @Param('id') id: string,
  ) {
    return this.expensesService.getExpenseById(tenant.tenantId, id);
  }

  @RequirePermissions(SystemPermissions.EXPENSES_MANAGE)
  @Post()
  async create(
    @CurrentTenant() tenant: TenantContext,
    @Body() body: any,
  ) {
    return this.expensesService.createExpense(tenant.tenantId, body);
  }

  @RequirePermissions(SystemPermissions.EXPENSES_MANAGE)
  @Delete(':id')
  async delete(
    @CurrentTenant() tenant: TenantContext,
    @Param('id') id: string,
  ) {
    return this.expensesService.deleteExpense(tenant.tenantId, id);
  }
}
